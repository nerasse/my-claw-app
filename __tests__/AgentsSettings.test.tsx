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

/** The Android layer calls the last registered handler and stops when it returns true. */
function backHandler(): { __handlers: Array<() => boolean>; exitApp: jest.Mock } {
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  return back.default;
}

/** True when the press was handled: false is what makes Android close the app. */
async function hardwareBack(): Promise<boolean> {
  const handlers = backHandler().__handlers;
  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]!();
  });
  return handled;
}

function agentsConfig(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'agents.config.result',
    defaultModel: 'fast-1',
    defaultEffort: '',
    effortLevels: ['low', 'medium', 'high'],
    fallback: '',
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
  await pressLabel(tree, 'More');
  await pressLabel(tree, 'Settings');
  await pressLabel(tree, 'Open agents');
  await emit(agentsConfig());
  await emit({
    type: 'model.list.result',
    models: [
      { id: 'fast-1', label: 'Fast', effortLevels: ['low', 'medium', 'high'] },
      { id: 'opus', label: 'Opus', group: 'Claude', effortLevels: ['low', 'medium', 'high'], vision: true },
    ],
    defaultModel: 'fast-1',
  });
  await waitFor(() => labelsOf(tree).includes('Open agent Scheduled tasks'));
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
  expect(labels).toEqual(expect.arrayContaining(['Open agent Orchestrator', 'Open agent General sub-agent', 'Open agent Scheduled tasks']));
  // Nothing about the agents is hardcoded: the server's label and inheritance rule show up.
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['Scheduled tasks']));
  expect(textsOf(tree).some(text => text.includes('inherits from the orchestrator'))).toBe(true);
  expect(textsOf(tree).some(text => text.includes('inherits the global default'))).toBe(true);
  // The model reads as its catalog label, not the raw id the server stores.
  expect(textsOf(tree).some(text => text.startsWith('Fast · '))).toBe(true);
  await settleAndUnmount(tree);
});

test('picking a model for an agent sends agents.model.set and the page follows', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Open agent General sub-agent');
  await waitFor(() => labelsOf(tree).includes('Change model'));
  await pressLabel(tree, 'Change model');
  await waitFor(() => labelsOf(tree).includes('Claude ›'));
  await pressLabel(tree, 'Claude ›');
  await waitFor(() => labelsOf(tree).includes('Opus'));
  await pressLabel(tree, 'Opus');
  // The flow continues: model, then effort, then the confirmation applies both in one frame.
  await waitFor(() => labelsOf(tree).includes('medium'));
  await pressLabel(tree, 'medium');
  await waitFor(() => labelsOf(tree).includes('Apply'));
  await pressLabel(tree, 'Apply');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'agents.model.set', agent: 'general', model: 'opus', effort: 'medium' }),
    ]),
  );

  // The answer is the state the server stored: the detail page shows the pin.
  await emit(agentsConfig({ agents: [{ key: 'general', label: 'General sub-agent', description: 'Spawned with full tool access', model: 'opus', pinned: true, inheritsFrom: 'global' }] }));
  await waitFor(() => textsOf(tree).some(text => text.includes('pinned to this agent')));
  await settleAndUnmount(tree);
});

test('staging a tag for an agent asks for neither effort nor window, and writes no cap', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'More');
  await pressLabel(tree, 'Settings');
  await pressLabel(tree, 'Open agents');
  await emit(agentsConfig());
  // The tag carries its own pins and the window of the model behind it, exactly as the server
  // now reports them. Both are the tag's business: the agent has nothing left to decide.
  await emit({
    type: 'model.list.result',
    models: [
      { id: 'fast-1', label: 'Fast', effortLevels: ['low', 'medium', 'high'], context: 1_000_000 },
      { id: 'tag:Cheap', label: 'Cheap', group: 'Tags', effort: 'max', context: 1_000_000 },
    ],
    defaultModel: 'fast-1',
  });
  await waitFor(() => labelsOf(tree).includes('Open agent Scheduled tasks'));
  await pressLabel(tree, 'Open agent Scheduled tasks');
  await waitFor(() => labelsOf(tree).includes('Change model'));
  await pressLabel(tree, 'Change model');
  await waitFor(() => labelsOf(tree).includes('Tags ›'));
  await pressLabel(tree, 'Tags ›');
  await waitFor(() => labelsOf(tree).includes('Cheap'));
  await pressLabel(tree, 'Cheap');

  // Straight to the confirmation: no effort screen, and above all no window screen offering a
  // ceiling that the tag's own cap would outrank anyway.
  await waitFor(() => labelsOf(tree).includes('Apply'));
  const labels = labelsOf(tree);
  expect(labels).not.toEqual(expect.arrayContaining(['max']));
  expect(labels).not.toEqual(expect.arrayContaining(['Full: 1.0M', '512k', '256k', '128k', '64k']));
  await pressLabel(tree, 'Apply');

  const frames = sentFrames();
  expect(frames).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'agents.model.set', agent: 'cron', model: 'tag:Cheap' })]),
  );
  expect(frames.some(frame => frame.type === 'agents.contextcap.set')).toBe(false);
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
  await pressLabel(tree, 'Open agent General sub-agent');
  await waitFor(() => labelsOf(tree).includes('Change model'));
  await pressLabel(tree, 'Change model');
  await waitFor(() => labelsOf(tree).includes('Follow global default (Fast)'));
  await pressLabel(tree, 'Follow global default (Fast)');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'agents.model.clear', agent: 'general' })]),
  );
  await settleAndUnmount(tree);
});

test('the detail page shows the scope the server sent, read-only', async () => {
  const tree = await boot();
  await emit(
    agentsConfig({
      agents: [
        {
          key: 'general',
          label: 'General sub-agent',
          description: 'Spawned with full tool access',
          model: 'opus',
          pinned: true,
          inheritsFrom: 'global',
          skills: ['forgejo', 'pdf'],
          mcp: ['*'],
          workspace: 'infra',
          contextCap: 0,
          maxIterations: 12,
        },
      ],
    }),
  );
  await pressLabel(tree, 'Open agent General sub-agent');
  await waitFor(() => labelsOf(tree).includes('Change model'));

  const texts = textsOf(tree);
  // What decides what this agent can reach, without opening config.json on the server.
  expect(texts).toEqual(expect.arrayContaining(['forgejo, pdf', 'all', 'infra', 'no ceiling', '12']));
  // The pinned model reads as its catalog label.
  expect(texts).toEqual(expect.arrayContaining(['Opus']));
  await settleAndUnmount(tree);
});

test('a refused write shows the reason on the page that asked for it', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Open agent General sub-agent');
  await waitFor(() => labelsOf(tree).includes('Change model'));
  await ReactTestRenderer.act(async () => {
    agentsStore.fail('unknown agent');
  });
  // The config is still on screen: the error must not be swallowed by the loaded state.
  await waitFor(() => labelsOf(tree).includes('Agents error unknown agent'));
  await settleAndUnmount(tree);
});

test('the default model flow walks model then effort, and Apply sends both in one frame', async () => {
  const tree = await boot();
  await pressLabel(tree, 'Default model');
  await waitFor(() => labelsOf(tree).includes('Fast'));
  await pressLabel(tree, 'Fast');
  await waitFor(() => labelsOf(tree).includes('medium'));
  await pressLabel(tree, 'medium');
  await waitFor(() => labelsOf(tree).includes('Apply'));
  await pressLabel(tree, 'Apply');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'agents.model.set', agent: 'global', model: 'fast-1', effort: 'medium' }),
    ]),
  );
  await settleAndUnmount(tree);
});

test('the fallback row opens a picker limited to vision models and Apply pins it', async () => {
  const tree = await boot();
  await emit(
    agentsConfig({
      fallback: 'opus',
    }),
  );
  await pressLabel(tree, 'Fallback model');
  // Only vision-capable models are on offer: Opus is, the text-only Fast is not.
  await waitFor(() => labelsOf(tree).includes('Claude ›'));
  expect(labelsOf(tree)).not.toContain('Fast');
  await pressLabel(tree, 'Claude ›');
  await waitFor(() => labelsOf(tree).includes('Opus'));
  await pressLabel(tree, 'Opus');
  await waitFor(() => labelsOf(tree).includes('Apply'));
  await pressLabel(tree, 'Apply');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'agents.fallback.set', model: 'opus' })]),
  );
  await settleAndUnmount(tree);
});

test('the fallback root option removes the pin with an empty frame', async () => {
  const tree = await boot();
  await emit(
    agentsConfig({
      fallback: 'opus',
    }),
  );
  await pressLabel(tree, 'Fallback model');
  await waitFor(() => labelsOf(tree).includes('No fallback'));
  await pressLabel(tree, 'No fallback');

  expect(sentFrames()).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'agents.fallback.set', model: '' })]),
  );
  await settleAndUnmount(tree);
});

test('a page the server never answers shows the unsupported notice', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await pressLabel(tree, 'Open conversations');
  await pressLabel(tree, 'More');
  await pressLabel(tree, 'Settings');
  await pressLabel(tree, 'Open agents');
  await waitFor(() => labelsOf(tree).includes('Back to settings'));

  // What the 4s guard in the shell does: a server that predates the frames answers nothing,
  // and the page must say so instead of spinning.
  await ReactTestRenderer.act(async () => {
    agentsStore.markUnsupported();
  });
  await waitFor(() => textsOf(tree).some(text => text.includes('0.1.168')));
  await settleAndUnmount(tree);
});

describe('providers', () => {
  function providersConfig(): Record<string, unknown> {
    return {
      ...agentsConfig(),
      defaultModel: 'mimo',
      defaultProvider: 'litellm',
      providers: [
        { key: 'litellm', type: 'openai', discover: true, models: 2, keyEnv: 'LITELLM_API_KEY', keyPresent: true },
        { key: 'anthropic', type: 'claude-sdk', discover: true, models: 1, keyEnv: 'ANTHROPIC_API_KEY', keyPresent: false },
      ],
    };
  }

  /** Providers is its own index row: from the agents page, back out to the index first. */
  async function openProviders(tree: Tree): Promise<void> {
    expect(await hardwareBack()).toBe(true);
    await waitFor(() => labelsOf(tree).includes('Open providers'));
    await pressLabel(tree, 'Open providers');
    await waitFor(() => labelsOf(tree).includes('Open provider litellm'));
  }

  test('Providers is its own index row, not a row of the agents page', async () => {
    const tree = await boot();
    await emit(providersConfig());
    // The agents page keeps only the defaults and the tags: no Providers row left behind.
    expect(labelsOf(tree)).not.toContain('Providers');
    // The index rows the category with its own badge and a live count.
    expect(await hardwareBack()).toBe(true);
    await waitFor(() => labelsOf(tree).includes('Open providers'));
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['2 providers · model providers, API keys, models']));
    await settleAndUnmount(tree);
  });

  test('the Providers row opens the list the server sent', async () => {
    const tree = await boot();
    await emit(providersConfig());
    await openProviders(tree);
    expect(labelsOf(tree)).toEqual(expect.arrayContaining(['Open provider litellm', 'Open provider anthropic']));
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['2 models · key set (LITELLM_API_KEY)']));
    await settleAndUnmount(tree);
  });

  test('a provider opens only its own models, filtered like the server counts them', async () => {
    const tree = await boot();
    await emit(providersConfig());
    await emit({
      type: 'model.list.result',
      models: [
        { id: 'mimo', label: 'Mimo', provider: 'litellm' },
        { id: 'opus', label: 'Opus', provider: 'anthropic' },
        { id: 'naked', label: 'Naked' },
      ],
      defaultModel: 'mimo',
    });
    await openProviders(tree);
    await pressLabel(tree, 'Open provider litellm');
    await waitFor(() => labelsOf(tree).includes('Edit Naked'));
    expect(labelsOf(tree)).not.toContain('Edit Opus');
    // Mimo is already the global default: the row says so instead of offering a no-op.
    expect(labelsOf(tree)).toContain('Mimo, already the default');
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['default']));
    await settleAndUnmount(tree);
  });

  test('tapping a model opens its settings, never sets a default', async () => {
    const tree = await boot();
    await emit(providersConfig());
    await emit({
      type: 'model.list.result',
      models: [
        { id: 'mimo', label: 'Mimo', provider: 'litellm' },
        { id: 'opus', label: 'Opus', provider: 'anthropic' },
      ],
      defaultModel: 'mimo',
    });
    await openProviders(tree);
    await pressLabel(tree, 'Open provider anthropic');
    await waitFor(() => labelsOf(tree).includes('Edit Opus'));
    await pressLabel(tree, 'Edit Opus');

    // Opening the editor is the new tap action; no model is silently switched.
    await waitFor(() => labelsOf(tree).includes('Model id'));
    expect(sentFrames()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'agents.model.set' })]),
    );
    await settleAndUnmount(tree);
  });

  test('back walks provider, providers, index, chat', async () => {
    const tree = await boot();
    await emit(providersConfig());
    await openProviders(tree);
    await pressLabel(tree, 'Open provider litellm');
    await waitFor(() => labelsOf(tree).includes('Back to providers'));

    expect(await hardwareBack()).toBe(true);
    await waitFor(() => labelsOf(tree).includes('Open provider litellm'));

    expect(await hardwareBack()).toBe(true);
    await waitFor(() => labelsOf(tree).includes('Open general'));

    expect(await hardwareBack()).toBe(true);
    await waitFor(() => labelsOf(tree).includes('Open conversations'));
    expect(backHandler().exitApp).not.toHaveBeenCalled();

    await settleAndUnmount(tree);
  });

  test('a file-defined agent shows its tier, and a reserved role shows none', async () => {
    const tree = await boot();
    await emit(agentsConfig({
      agents: [
        { key: 'orchestrator', label: 'Orchestrator', description: 'The agent you talk to', model: 'fast-1', pinned: false, inheritsFrom: 'global' },
        { key: 'research', label: 'research', description: 'Read-only', model: 'fast-1', pinned: false, inheritsFrom: 'global', source: 'built-in', path: '/b/research.md', base: 'research' },
        { key: 'reviewer', label: 'reviewer', description: 'Reviews diffs', model: 'fast-1', pinned: false, inheritsFrom: 'global', source: 'workspace', path: '/w/reviewer.md', base: 'research', layer: 'proj' },
      ],
    }));
    await waitFor(() => labelsOf(tree).includes('Open agent reviewer'));
    const texts = textsOf(tree);
    // The workspace name is what tells two same-named files apart, so it wins over the tier word.
    expect(texts).toEqual(expect.arrayContaining(['BUILT-IN', 'PROJ']));
    await settleAndUnmount(tree);
  });

  test('the detail page shows where a file agent is defined, and hides it for a role', async () => {
    const tree = await boot();
    await emit(agentsConfig({
      agents: [
        { key: 'orchestrator', label: 'Orchestrator', description: 'The agent you talk to', model: 'fast-1', pinned: false, inheritsFrom: 'global' },
        { key: 'reviewer', label: 'reviewer', description: 'Reviews diffs', model: 'fast-1', pinned: false, inheritsFrom: 'global', source: 'workspace', path: '/w/.agents/reviewer.md', base: 'research', layer: 'proj' },
      ],
    }));
    await waitFor(() => labelsOf(tree).includes('Open agent reviewer'));
    await pressLabel(tree, 'Open agent reviewer');
    await waitFor(() => textsOf(tree).includes('definition'));
    expect(textsOf(tree)).toEqual(expect.arrayContaining(['workspace \u00b7 proj', 'research', '/w/.agents/reviewer.md']));

    expect(await hardwareBack()).toBe(true);
    await waitFor(() => labelsOf(tree).includes('Open agent Orchestrator'));
    await pressLabel(tree, 'Open agent Orchestrator');
    await waitFor(() => textsOf(tree).includes('scope'));
    // A role has no file, so a tier and a path would be an invention.
    expect(textsOf(tree)).not.toContain('definition');
    await settleAndUnmount(tree);
  });
});
