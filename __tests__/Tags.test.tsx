/**
 * @format
 *
 * Tags (docs/tags.md on the server): the CRUD page under Settings > Providers, the model picker
 * it opens, the /tag command forms, and the wire frames behind it all.
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { tagsStore } from '../src/core/tags';
import { deviceBridge } from '../src/core/nativeBridge';
import { parseTagCommand } from '../src/core/commands';
import { labelsOf, press, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

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

/** The Android layer calls the last registered handler and stops when it returns true. */
function backHandler(): { __handlers: Array<() => boolean>; exitApp: jest.Mock } {
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean>; exitApp: jest.Mock };
  };
  return back.default;
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
    fallback: '',
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

async function bootToTagsPage(tagFrame: Record<string, unknown> = tagsResult()): Promise<Tree> {
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
  // Tags lives under Providers since it left the Agents page: the row is the synthetic
  // "tags" provider, and reaching it from the providers list asks for the tags catalog.
  await press(tree, 'Open models');
  await press(tree, 'Open tags');
  await waitFor(() =>
    sentFrames().some(frame => frame.type === 'tags.list'),
  );
  await emit(tagFrame);
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

test('an ordered route is name-only in the list and opens the route editor', async () => {
  const tree = await bootToTagsPage(tagsResult({
    tags: [
      { name: 'Default', model: 'fast-1' },
      { name: 'opus', model: 'fast-1', route: [{ model: 'fast-1', effort: 'high', contextCap: 200000 }, { model: 'small-1' }], fallbackToGlobalDefault: true },
    ],
  }));
  expect(labelsOf(tree)).toEqual(expect.arrayContaining(['Open tag opus']));
  expect(labelsOf(tree)).not.toContain('Delete tag opus');
  await pressLabel(tree, 'Open tag opus');
  await waitFor(() => textsOf(tree).includes('Fallback order'));
  expect(textsOf(tree)).toEqual(expect.arrayContaining(['fast-1', 'small-1', 'Fallback to global default']));
  expect(labelsOf(tree)).toContain('Delete tag opus');
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

test('the tag model picker offers no tag entries: a tag cannot pin a tag', async () => {
  const tree = await bootToTagsPage();
  await pressLabel(tree, 'Open tag opus');
  await waitFor(() => labelsOf(tree).includes('Fast'));
  // The catalog carries tag:Default and tag:opus, but the editor must not offer them: a tag
  // pinning a tag reference is how cycles are born (the server refuses those writes).
  const labels = labelsOf(tree);
  expect(labels).not.toEqual(expect.arrayContaining(['Tags ›', 'Default', 'opus']));
  await settleAndUnmount(tree);
});

test('back from the tags page returns to Providers, and the Agents page has no Tags row', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await emit(agentsConfig());
  await emit({ type: 'model.list.result', models: [{ id: 'fast-1', label: 'Fast' }], defaultModel: 'fast-1' });
  await press(tree, 'Open conversations');
  await press(tree, 'Open settings');
  await press(tree, 'Open agents');
  // The Agents page holds only the defaults and the agent rows since Tags left it.
  expect(labelsOf(tree)).not.toContain('Tags');
  await press(tree, 'Back to settings');
  await press(tree, 'Open models');
  await press(tree, 'Open tags');
  await waitFor(() => sentFrames().some(frame => frame.type === 'tags.list'));
  await emit(tagsResult());
  await waitFor(() => labelsOf(tree).includes('Open tag opus'));

  // Hardware back: tags -> the providers list, not the agents page it used to live on.
  const handlers = backHandler().__handlers;
  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]!();
  });
  expect(handled).toBe(true);
  await waitFor(() => labelsOf(tree).includes('New provider'));
  expect(labelsOf(tree)).not.toContain('Open tag opus');

  await settleAndUnmount(tree);
});

test('a pinned effort can go back to default from the effort step', async () => {
  const tree = await bootToTagsPage();
  // The opus fixture pins effort high; the flow must offer a way back to an absent pin.
  await pressLabel(tree, 'Open tag opus');
  await waitFor(() => labelsOf(tree).includes('Fast'));
  await pressLabel(tree, 'Fast');
  // The pin shows up as the current value; the default row must be there to remove it.
  await waitFor(() => labelsOf(tree).includes('default (inherit)'));
  expect(labelsOf(tree)).toContain('Keep current: high');
  await pressLabel(tree, 'default (inherit)');
  // The window step follows the effort step, as in any other run of the flow.
  await waitFor(() => labelsOf(tree).includes('Full: 400k'));
  await pressLabel(tree, '128k');
  await waitFor(() => labelsOf(tree).includes('Apply'));
  await pressLabel(tree, 'Apply');
  await waitFor(() =>
    sentFrames().some(
      frame => frame.type === 'tags.upsert' && frame.name === 'opus' && frame.effort === undefined,
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
  // From the effort step, the page's back entry returns to the model list rather than
  // leaving the page: the flow is walked one step at a time.
  await pressLabel(tree, 'Back to the tags list');
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

test('/tag new "opus" in the composer opens the ordered route editor', async () => {
  const tree = await renderApp();
  await emit({ type: 'session.list.result', sessions: [summary(THREAD, 'Infra maison')] });
  await emit(agentsConfig());
  await emit({
    type: 'model.list.result',
    models: [{ id: 'fast-1', label: 'Fast', effortLevels: ['low', 'medium', 'high'], context: 400000 }],
    defaultModel: 'fast-1',
  });
  await waitFor(() => labelsOf(tree).includes('Message to send'));
  await typeInto(tree, 'Message to send', '/tag new');
  await pressLabel(tree, 'Send message');
  await waitFor(() => labelsOf(tree).includes('Name this tag'));
  await typeInto(tree, 'Name this tag', 'opus');
  await pressLabel(tree, 'Save');
  await waitFor(() => textsOf(tree).includes('Fallback order'));
  expect(labelsOf(tree)).toContain('Add model');
  await pressLabel(tree, 'Add model');
  await waitFor(() => labelsOf(tree).includes('Fast'));
  await pressLabel(tree, 'Fast');
  await waitFor(() => labelsOf(tree).includes('medium'));
  await pressLabel(tree, 'medium');
  await waitFor(() => labelsOf(tree).includes('Full: 400k'));
  await pressLabel(tree, 'Full: 400k');
  await settleAndUnmount(tree);
});

/** The Android layer calls the last registered handler and stops when it returns true. */
async function hardwareBack(): Promise<boolean> {
  const handlers = backHandler().__handlers;
  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]!();
  });
  return handled;
}

/** The route toggle is the cheapest edit that makes the editor dirty. */
async function toggleGlobalFallback(tree: Tree): Promise<void> {
  const toggle = tree.root.findAll(
    node => node.props.accessibilityRole === 'checkbox' && typeof node.props.onPress === 'function',
    { deep: true },
  )[0];
  if (!toggle) throw new Error('no route toggle on the tag editor');
  await ReactTestRenderer.act(async () => toggle.props.onPress());
}

test('back on the discard question closes it and keeps the editor, changes and all', async () => {
  // A tag with a route opens the editor; a single-model tag opens the picker flow instead.
  const tree = await bootToTagsPage(tagsResult({
    tags: [
      { name: 'Default', model: 'fast-1' },
      { name: 'opus', model: 'fast-1', route: [{ model: 'fast-1', effort: 'high' }], fallbackToGlobalDefault: false },
    ],
  }));
  await pressLabel(tree, 'Open tag opus');
  await waitFor(() => textsOf(tree).includes('Fallback order'));
  await toggleGlobalFallback(tree);

  // The press out of a dirty editor asks instead of leaving. That question is a layer of the
  // shell drawn over the page, and the page is still there underneath.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => textsOf(tree).includes('Discard the unsaved route changes?'));

  expect(await hardwareBack()).toBe(true);
  await waitFor(() => !textsOf(tree).includes('Discard the unsaved route changes?'));

  // Still on the editor, still dirty: nothing was discarded and nothing was saved.
  expect(textsOf(tree)).toContain('Fallback order');
  expect(labelsOf(tree)).toContain('Add model');
  expect(sentFrames().some(frame => frame.type === 'tags.save')).toBe(false);

  // And the question can be asked again, which is the proof the editor kept its changes.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => textsOf(tree).includes('Discard the unsaved route changes?'));

  await settleAndUnmount(tree);
});
