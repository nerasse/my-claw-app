/**
 * @format
 *
 * The Agents page is fed entirely by agents.config.result: the rows it renders, the picker it
 * opens and the mutations it sends all come from the server, so a server that gains an agent
 * shows it without an app release. A server that predates the frames answers nothing at all,
 * and the page must say so instead of spinning.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { agentsStore } from '../src/core/agents';
import { deviceBridge } from '../src/core/nativeBridge';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-agents';

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function summary(threadId: string, title: string) {
  return {
    threadId,
    title,
    messageCount: 1,
    createdAt: '2026-08-06T10:00:00.000Z',
    lastActiveAt: '2026-08-06T10:05:00.000Z',
  };
}

function pressLabel(tree: Tree, label: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const targets = tree.root.findAll(
      node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
      { deep: true },
    );
    const target = targets[0] ?? tree.root.find(node => node.props.accessibilityLabel === label);
    target.props.onPress();
  });
}

/** The chat screen's 40ms scroll timer must fire before unmount, or the next test crashes. */
async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as Record<string, unknown>,
  );
}

function agentsConfig(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'agents.config.result',
    defaultModel: 'fast-1',
    defaultEffort: '',
    effortLevels: ['low', 'medium', 'high'],
    providers: [],
    agents: [
      {
        key: 'orchestrator',
        label: 'Orchestrator',
        description: 'The agent you talk to',
        model: 'fast-1',
        pinned: false,
        inheritsFrom: 'global',
      },
      {
        key: 'general',
        label: 'General sub-agent',
        description: 'Spawned with full tool access',
        model: 'fast-1',
        pinned: false,
        inheritsFrom: 'global',
      },
      {
        key: 'cron',
        label: 'Scheduled tasks',
        description: 'Jobs on a schedule',
        model: 'fast-1',
        pinned: false,
        inheritsFrom: 'orchestrator',
      },
    ],
    ...over,
  };
}

async function boot(): Promise<Tree> {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await pressLabel(tree, 'Open agents');
  await emit(agentsConfig());
  await emit({
    type: 'model.list.result',
    models: [
      { id: 'fast-1', label: 'Fast' },
      { id: 'opus', label: 'Opus', group: 'Claude' },
    ],
    defaultModel: 'fast-1',
  });
  await waitFor(() => labelsOf(tree).includes('Open agent cron'));
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('the page renders every agent the server sends, names included', async () => {
  const tree = await boot();
  const labels = labelsOf(tree);
  expect(labels).toEqual(expect.arrayContaining(['Open agent orchestrator', 'Open agent general', 'Open agent cron']));
  // Nothing about the agents is hardcoded: the server's label and inheritance rule show up.
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['Scheduled tasks']));
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['inherits from the orchestrator']));
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['inherits the global default']));
  await settleAndUnmount(tree);
});

test('picking a model for an agent sends agents.model.set and the page follows', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Open agent general');
  await waitFor(() => labelsOf(tree).includes('Change model'));
  await pressLabel(tree, 'Change model');
  await waitFor(() => labelsOf(tree).includes('Claude ›'));
  await pressLabel(tree, 'Claude ›');
  await waitFor(() => labelsOf(tree).includes('Opus'));
  await pressLabel(tree, 'Opus');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'agents.model.set', agent: 'general', model: 'opus' })]),
  );

  // The answer is the state the server stored: the detail page shows the pin.
  await emit(agentsConfig({ agents: [{ key: 'general', label: 'General sub-agent', description: 'Spawned with full tool access', model: 'opus', pinned: true, inheritsFrom: 'global' }] }));
  await waitFor(() => textsOf(tree).includes('pinned to this agent'));
  await settleAndUnmount(tree);
});

test('the root option sends agents.model.clear so the agent inherits again', async () => {
  const tree = await boot();
  await emit(
    agentsConfig({
      agents: [
        { key: 'general', label: 'General sub-agent', description: 'Spawned with full tool access', model: 'opus', pinned: true, inheritsFrom: 'global' },
      ],
    }),
  );
  await pressLabel(tree, 'Open agent general');
  await waitFor(() => labelsOf(tree).includes('Change model'));
  await pressLabel(tree, 'Change model');
  await waitFor(() => labelsOf(tree).includes('Follow global default (Fast)'));
  await pressLabel(tree, 'Follow global default (Fast)');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'agents.model.clear', agent: 'general' })]),
  );
  await settleAndUnmount(tree);
});

test('the effort sheet sends agents.effort.set with the chosen level', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Default effort');
  await waitFor(() => labelsOf(tree).includes('Reasoning effort not set') || labelsOf(tree).includes('Not set'));
  await pressLabel(tree, 'high');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'agents.effort.set', level: 'high' })]),
  );
  await settleAndUnmount(tree);
});

test('a page the server never answers shows the unsupported notice', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'Open settings');
  await pressLabel(tree, 'Open agents');
  await waitFor(() => labelsOf(tree).includes('Back to settings'));

  // What the 4s guard in the shell does: a server that predates the frames answers nothing,
  // and the page must say so instead of spinning.
  agentsStore.markUnsupported();
  await waitFor(() => textsOf(tree).some(text => text.includes('0.1.168')));
  await settleAndUnmount(tree);
});
