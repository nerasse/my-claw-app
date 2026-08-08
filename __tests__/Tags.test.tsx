/**
 * @format
 *
 * Tags (docs/tags.md on the server): the CRUD page under Settings > Agents, the model picker
 * it opens, the /tag command forms, and the wire frames behind it all.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { tagsStore } from '../src/core/tags';
import { deviceBridge } from '../src/core/nativeBridge';
import { parseTagCommand } from '../src/core/commands';
import { labelsOf, press, renderApp, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 'thread-tags';

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function sentFrames(): Array<Record<string, unknown>> {
  return bridge.sendMessage.mock.calls.map(
    ([frame]) => JSON.parse(String(frame)) as Record<string, unknown>,
  );
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

function typeInto(tree: Tree, label: string, text: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const input = tree.root.find(
      node => String(node.type) === 'TextInput' && node.props.accessibilityLabel === label,
    );
    input.props.onChangeText(text);
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

async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
}

function agentsConfig(): Record<string, unknown> {
  return {
    type: 'agents.config.result',
    defaultModel: 'fast-1',
    defaultEffort: '',
    effortLevels: ['low', 'medium', 'high'],
    providers: [{ key: 'tags', type: 'tags', discover: false, models: 2, keyPresent: true }],
    agents: [
      {
        key: 'orchestrator',
        label: 'Orchestrator',
        description: 'The agent you talk to',
        model: 'fast-1',
        pinned: false,
        inheritsFrom: 'global',
      },
    ],
  };
}

function tagsResult(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'tags.result',
    tags: [
      { name: 'Default', model: 'fast-1' },
      { name: 'opus', model: 'fast-1', effort: 'high' },
    ],
    ...over,
  };
}

async function bootToTagsPage(): Promise<Tree> {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await emit(agentsConfig());
  await emit({
    type: 'model.list.result',
    models: [
      { id: 'fast-1', label: 'Fast', effortLevels: ['low', 'medium', 'high'], context: 400000 },
      { id: 'small-1', label: 'Small', effortLevels: ['low', 'medium'], context: 100000 },
      { id: 'tag:Default', label: 'Default', group: 'Tags' },
      { id: 'tag:opus', label: 'opus', group: 'Tags' },
    ],
    defaultModel: 'fast-1',
  });
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');
  await press(tree, 'Open agents');
  await press(tree, 'Tags');
  await waitFor(() =>
    sentFrames().some(frame => frame.type === 'tags.list'),
  );
  await emit(tagsResult());
  await waitFor(() => labelsOf(tree).includes('Open tag opus'));
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  chatStore.clearAll();
  tagsStore.reset();
  bridge.sendMessage.mockResolvedValue(true);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('parseTagCommand: bare /tag opens the page, /tag new "name" the editor, junk stays', () => {
  expect(parseTagCommand('/tag')).toBe(null);
  expect(parseTagCommand('  /tag ')).toBe(null);
  expect(parseTagCommand('/tag new')).toBe('');
  expect(parseTagCommand('/tag new "opus"')).toBe('opus');
  expect(parseTagCommand('/tag new "Opus 4"')).toBe('Opus 4');
  expect(parseTagCommand('/tag delete opus')).toBe(undefined);
  expect(parseTagCommand('/model')).toBe(undefined);
});

test('the tags page lists the server catalog, Default row first and read-only', async () => {
  const tree = await bootToTagsPage();
  const labels = labelsOf(tree);
  expect(labels).toEqual(expect.arrayContaining(['Open tag opus', 'Delete tag opus']));
  // The Default tag rows but is not editable: no editor link, no delete link.
  expect(labels).not.toEqual(expect.arrayContaining(['Open tag Default', 'Delete tag Default']));
  await settleAndUnmount(tree);
});

test('the tag flow walks model, effort and window, then applies one upsert', async () => {
  const tree = await bootToTagsPage();
  await pressLabel(tree, 'Open tag opus');
  // Step 1: the model.
  await waitFor(() => labelsOf(tree).includes('Fast'));
  await pressLabel(tree, 'Fast');
  // Step 2: the effort, as its own screen rather than chips over the list.
  await waitFor(() => labelsOf(tree).includes('low'));
  await pressLabel(tree, 'low');
  // Step 3: the window, graduated under the model's own full window.
  await waitFor(() => labelsOf(tree).includes('Full: 400k'));
  expect(labelsOf(tree)).toEqual(expect.arrayContaining(['256k', '128k', '64k']));
  await pressLabel(tree, '128k');
  // Nothing was sent while staging: the whole combo goes on Apply.
  expect(sentFrames().some(frame => frame.type === 'tags.upsert')).toBe(false);
  await waitFor(() => labelsOf(tree).includes('Apply'));
  await pressLabel(tree, 'Apply');
  await waitFor(() =>
    sentFrames().some(
      frame =>
        frame.type === 'tags.upsert' &&
        frame.name === 'opus' &&
        frame.model === 'fast-1' &&
        frame.effort === 'low' &&
        frame.contextCap === 128000,
    ),
  );
  await settleAndUnmount(tree);
});

test('the window step never offers more than the model can hold', async () => {
  const tree = await bootToTagsPage();
  await pressLabel(tree, 'Open tag opus');
  await waitFor(() => labelsOf(tree).includes('Small'));
  await pressLabel(tree, 'Small');
  await waitFor(() => labelsOf(tree).includes('low'));
  await pressLabel(tree, 'low');
  // A 100k window keeps 64k and drops every graduation at or above it.
  await waitFor(() => labelsOf(tree).includes('Full: 100k'));
  const labels = labelsOf(tree);
  expect(labels).toEqual(expect.arrayContaining(['64k']));
  expect(labels).not.toEqual(expect.arrayContaining(['128k', '256k', '512k']));
  await settleAndUnmount(tree);
});

test('back walks the flow one step at a time', async () => {
  const tree = await bootToTagsPage();
  await pressLabel(tree, 'Open tag opus');
  await waitFor(() => labelsOf(tree).includes('Fast'));
  await pressLabel(tree, 'Fast');
  await waitFor(() => labelsOf(tree).includes('low'));
  // From the effort step, back returns to the model list rather than closing the sheet.
  await pressLabel(tree, '< Back');
  await waitFor(() => labelsOf(tree).includes('Fast'));
  await settleAndUnmount(tree);
});

test('deleting a tag confirms first and then sends tags.delete', async () => {
  const tree = await bootToTagsPage();
  await pressLabel(tree, 'Delete tag opus');
  await waitFor(() => labelsOf(tree).includes('Delete'));
  await pressLabel(tree, 'Delete');
  await waitFor(() => sentFrames().some(frame => frame.type === 'tags.delete' && frame.name === 'opus'));
  await settleAndUnmount(tree);
});

test('the context cap row opens the number editor and saves a tags.upsert', async () => {
  const tree = await bootToTagsPage();
  await pressLabel(tree, 'Context cap for tag opus');
  await waitFor(() => labelsOf(tree).includes('Save number'));
  await typeInto(tree, 'Tag opus · context cap value', '80000');
  await pressLabel(tree, 'Save number');
  await waitFor(() =>
    sentFrames().some(frame => frame.type === 'tags.upsert' && frame.name === 'opus' && frame.contextCap === 80000),
  );
  await settleAndUnmount(tree);
});

test('/tag in the composer opens the tags page', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await waitFor(() => labelsOf(tree).includes('Message to send'));
  await typeInto(tree, 'Message to send', '/tag');
  await pressLabel(tree, 'Send message');
  await waitFor(() => sentFrames().some(frame => frame.type === 'tags.list'));
  await settleAndUnmount(tree);
});

test('/tag new "opus" in the composer opens the tag flow', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await emit(agentsConfig());
  await emit({
    type: 'model.list.result',
    models: [{ id: 'fast-1', label: 'Fast', effortLevels: ['low', 'medium', 'high'], context: 400000 }],
    defaultModel: 'fast-1',
  });
  await waitFor(() => labelsOf(tree).includes('Message to send'));
  await typeInto(tree, 'Message to send', '/tag new "opus"');
  await pressLabel(tree, 'Send message');
  await waitFor(() => labelsOf(tree).includes('Fast'));
  await pressLabel(tree, 'Fast');
  await waitFor(() => labelsOf(tree).includes('medium'));
  await pressLabel(tree, 'medium');
  await waitFor(() => labelsOf(tree).includes('Full: 400k'));
  await pressLabel(tree, 'Full: 400k');
  await waitFor(() => labelsOf(tree).includes('Apply'));
  await pressLabel(tree, 'Apply');
  await waitFor(() =>
    sentFrames().some(
      frame =>
        frame.type === 'tags.upsert' &&
        frame.name === 'opus' &&
        frame.model === 'fast-1' &&
        frame.effort === 'medium' &&
        frame.contextCap === undefined,
    ),
  );
  await settleAndUnmount(tree);
});
