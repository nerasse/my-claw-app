/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { DeviceEventEmitter } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { commandStore } from '../src/core/commands';
import { labelsOf, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

/** Every string anywhere in the tree, including array children (bubble text renders as arrays). */
function allTexts(tree: Tree): string[] {
  const out: string[] = [];
  const walk = (node: ReactTestRenderer.ReactTestInstance): void => {
    const collect = (value: unknown): void => {
      if (typeof value === 'string') out.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
    };
    collect(node.props.children);
    for (const child of node.children) {
      if (child && typeof child === 'object' && 'props' in (child as object)) {
        walk(child as ReactTestRenderer.ReactTestInstance);
      }
    }
  };
  walk(tree.root);
  return out;
}

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-cmd';

const CATALOG = [
  { name: 'status', description: 'Session diagnostics: context, tokens, cost' },
  { name: 'model', description: 'Show or change current model' },
  { name: 'help', description: 'List available commands' },
];

function emit(frame: Record<string, unknown>): Promise<void> {
  return ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('claw:ws:message', { text: JSON.stringify(frame) });
  });
}

function sentFrames(): string[] {
  return bridge.sendMessage.mock.calls.map(([frame]) => String(frame));
}

beforeEach(() => {
  chatStore.clearAll();
  commandStore.replace(CATALOG);
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

test('the ⋮ menu opens the command menu with the conversation actions', async () => {
  const tree = await renderApp();
  await waitFor(() => labelsOf(tree).includes('Commands'));

  // The thread has no session yet, so conversation actions stay hidden; the app-level ones show.
  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Model…'));

  // The drawer's + keeps its own label ("New conversation"): assert on the sheet's rendered
  // text instead, which only options produce.
  const texts = textsOf(tree);
  expect(texts).toContain('Model…');
  // New conversations live on the + in the drawer (and the /new command); Files has its own
  // header button. Duplicating them here was noise.
  expect(texts).not.toContain('New conversation');
  expect(texts).not.toContain('Files');
  // Settings live in the drawer, Diagnostics inside them: duplicating them here was noise.
  expect(texts).not.toContain('Diagnostics');

  await settleAndUnmount(tree);
});

test('the model picker lists models with the current one checked and applies on tap', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hello', []);
  });
  await waitFor(() => allTexts(tree).includes('hello'), 60);
  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Model…'), 60);
  await pressLabel(tree, 'Model…');

  // The sheet asks the server; the server answers with the catalog and the thread state.
  await emit({ type: 'model.list.result', models: [
    { id: 'fast-1', label: 'Fast' },
    { id: 'strong-2', label: 'Strong', group: 'Advanced' },
  ], defaultModel: 'fast-1' });
  await emit({ type: 'model.result', threadId: THREAD, model: 'fast-1', defaultModel: 'fast-1', effort: { level: '', levels: [], supported: false } });

  await waitFor(() => labelsOf(tree).includes('Fast'), 60);
  // A grouped model hides behind its group's submenu.
  expect(labelsOf(tree)).not.toContain('Strong');
  expect(labelsOf(tree)).toContain('Advanced ›');

  await pressLabel(tree, 'Advanced ›');
  await waitFor(() => labelsOf(tree).includes('Strong'), 60);
  expect(labelsOf(tree)).toContain('< Back');

  // Back on the root, the default is offered and picking it asks the server to switch.
  await pressLabel(tree, '< Back');
  await waitFor(() => labelsOf(tree).includes('Use default (Fast)'), 60);
  await pressLabel(tree, 'Use default (Fast)');
  await waitFor(() => sentFrames().includes(JSON.stringify({ type: 'model.set', threadId: THREAD, model: 'fast-1' })), 60);
  // Returning to the default is the whole couple: the session effort goes back too.
  expect(sentFrames()).toContain(JSON.stringify({ type: 'model.effort.set', threadId: THREAD, level: '' }));

  await settleAndUnmount(tree);
});

test('the chat picker walks model, effort and window, and applies the combo on confirm', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hello', []);
  });
  await waitFor(() => allTexts(tree).includes('hello'), 60);
  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Model…'), 60);
  await pressLabel(tree, 'Model…');

  await emit({
    type: 'model.list.result',
    models: [
      { id: 'fast-1', label: 'Fast', effortLevels: ['low', 'medium', 'high'], context: 400000 },
      { id: 'strong-2', label: 'Strong', effortLevels: ['low', 'high'], context: 1048576 },
    ],
    defaultModel: 'fast-1',
  });
  await emit({
    type: 'model.result',
    threadId: THREAD,
    model: 'fast-1',
    defaultModel: 'fast-1',
    effort: { level: 'medium', levels: ['low', 'medium', 'high'], supported: true },
    context: { raw: 400000, effective: 256000, cap: 256000 },
  });

  await waitFor(() => labelsOf(tree).includes('Strong'), 60);
  // Frames already sent by earlier steps of this file: staging must add none of its own.
  const sentBeforeStaging = sentFrames().length;
  await pressLabel(tree, 'Strong');
  // The effort step is a menu of its own now, not a chip row over the model list.
  await waitFor(() => labelsOf(tree).includes('high'), 60);
  expect(labelsOf(tree)).toContain('Keep current: medium');
  await pressLabel(tree, 'high');
  // Then the window, graduated under the staged model's own full window.
  await waitFor(() => labelsOf(tree).includes('Full: 1.0M'), 60);
  expect(labelsOf(tree)).toEqual(expect.arrayContaining(['512k', '256k (cap)', '128k', '64k']));
  await pressLabel(tree, '512k');

  // Nothing is sent before the confirmation.
  expect(sentFrames().length).toBe(sentBeforeStaging);
  await waitFor(() => labelsOf(tree).includes('Apply'), 60);
  await pressLabel(tree, 'Apply');

  await waitFor(() => sentFrames().includes(JSON.stringify({ type: 'model.set', threadId: THREAD, model: 'strong-2' })), 60);
  expect(sentFrames()).toContain(JSON.stringify({ type: 'model.effort.set', threadId: THREAD, level: 'high' }));
  expect(sentFrames()).toContain(JSON.stringify({ type: 'model.context.set', threadId: THREAD, choice: 512000 }));

  await settleAndUnmount(tree);
});

test('the level that turns reasoning off is not read as the row that inherits it', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hello', []);
  });
  await waitFor(() => allTexts(tree).includes('hello'), 60);
  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Model…'), 60);
  await pressLabel(tree, 'Model…');

  // A ladder published by the model itself, bottom rung included (server-side docs/model-metadata.md).
  await emit({
    type: 'model.list.result',
    models: [
      { id: 'fast-1', label: 'Fast' },
      { id: 'flash-4', label: 'DeepSeek V4 Flash', effortLevels: ['none', 'high', 'max'] },
    ],
    defaultModel: 'fast-1',
  });
  await emit({
    type: 'model.result',
    threadId: THREAD,
    model: 'fast-1',
    defaultModel: 'fast-1',
    effort: { level: '', levels: ['none', 'high', 'max'], supported: true },
  });

  await waitFor(() => labelsOf(tree).includes('DeepSeek V4 Flash'), 60);
  await pressLabel(tree, 'DeepSeek V4 Flash');

  // Both rows exist and neither can be mistaken for the other: one pins "do not reason", the
  // other hands the choice back to the defaults.
  await waitFor(() => labelsOf(tree).includes('none (no reasoning)'), 60);
  expect(labelsOf(tree)).toContain('default (inherit)');
  expect(labelsOf(tree)).not.toContain('none');

  // And it is still the level `none` that goes on the wire, not the label.
  await pressLabel(tree, 'none (no reasoning)');
  await waitFor(() => labelsOf(tree).includes('Apply'), 60);
  await pressLabel(tree, 'Apply');
  await waitFor(
    () => sentFrames().includes(JSON.stringify({ type: 'model.effort.set', threadId: THREAD, level: 'none' })),
    60,
  );

  await settleAndUnmount(tree);
});

/**
 * A catalog long enough to earn the search row: one provider group holds a dozen models, the
 * way a discovering provider fills it (OpenRouter alone returns 400+).
 */
function bigCatalog(count = 12): Array<Record<string, unknown>> {
  return [
    { id: 'fast-1', label: 'Fast' },
    { id: 'strong-2', label: 'Strong', group: 'Advanced' },
    { id: 'nvidia/nemotron', label: 'nvidia/nemotron', group: 'openrouter' },
    ...Array.from({ length: count }, (_, index) => ({
      id: `vendor/model-${index}`,
      label: `vendor/model-${index}`,
      group: 'openrouter',
    })),
  ];
}

async function openChatPicker(
  tree: Tree,
  models: Array<Record<string, unknown>>,
  messageId = 'u1',
): Promise<void> {
  // The store outlives an unmounted tree: a second picker in the same test needs its own id.
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, messageId, 'hello', []);
  });
  await waitFor(() => allTexts(tree).includes('hello'), 60);
  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Model…'), 60);
  await pressLabel(tree, 'Model…');
  await emit({ type: 'model.list.result', models, defaultModel: 'fast-1' });
  await emit({
    type: 'model.result',
    threadId: THREAD,
    model: 'fast-1',
    defaultModel: 'fast-1',
    effort: { level: '', levels: [], supported: false },
  });
  await waitFor(() => labelsOf(tree).includes('Fast'), 60);
}

test('the search reaches a model inside a group without browsing to it, and stages it', async () => {
  const tree = await renderApp();
  await openChatPicker(tree, bigCatalog());

  // The model is buried in its provider's group: the root shows the group, not the model.
  expect(labelsOf(tree)).toContain('openrouter ›');
  expect(labelsOf(tree)).not.toContain('nvidia/nemotron');

  await typeInto(tree, 'Search models', 'nemo');
  await waitFor(() => labelsOf(tree).includes('nvidia/nemotron'), 60);
  // The search crosses every group, so the groups themselves stop being rows.
  expect(labelsOf(tree)).not.toContain('openrouter ›');
  expect(labelsOf(tree)).not.toContain('Fast');
  expect(allTexts(tree)).toContain('1 match for "nemo"');

  await pressLabel(tree, 'nvidia/nemotron');
  await waitFor(() => labelsOf(tree).includes('Apply'), 60);
  await pressLabel(tree, 'Apply');
  await waitFor(
    () => sentFrames().includes(JSON.stringify({ type: 'model.set', threadId: THREAD, model: 'nvidia/nemotron' })),
    60,
  );

  await settleAndUnmount(tree);
});

test('back clears the search before it closes the picker', async () => {
  const tree = await renderApp();
  await openChatPicker(tree, bigCatalog());
  await typeInto(tree, 'Search models', 'nemo');
  await waitFor(() => labelsOf(tree).includes('nvidia/nemotron'), 60);

  // The keyboard is up over a filtered list: the step back the user means is the search, not
  // the sheet. The list comes back whole, the picker stays open.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => labelsOf(tree).includes('openrouter ›'), 60);
  expect(labelsOf(tree)).toContain('Fast');
  expect(labelsOf(tree)).not.toContain('nvidia/nemotron');

  // Only the next press closes it.
  expect(await hardwareBack()).toBe(true);
  await waitFor(() => !labelsOf(tree).includes('Fast'), 60);

  await settleAndUnmount(tree);
});

test('a short catalog carries no search row, a flooded one cuts the list it shows', async () => {
  const tree = await renderApp();
  await openChatPicker(tree, [
    { id: 'fast-1', label: 'Fast' },
    { id: 'strong-2', label: 'Strong' },
  ]);
  // Two models are read, not searched.
  expect(labelsOf(tree)).not.toContain('Search models');
  await settleAndUnmount(tree);

  const flooded = await renderApp();
  await openChatPicker(flooded, bigCatalog(45), 'u2');
  await typeInto(flooded, 'Search models', 'vendor/');
  // 45 matches, 40 rendered: the cut is the flow's own cap, not the sheet's virtualization,
  // so what it hides is a count rather than more scrolling.
  await waitFor(() => labelsOf(flooded).includes('5 more · narrow the search'), 60);
  expect(labelsOf(flooded)).toContain('vendor/model-39');
  expect(labelsOf(flooded)).not.toContain('vendor/model-40');

  await settleAndUnmount(flooded);
});

test('a group whose models all live in sub-groups is still reachable', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hello', []);
  });
  await waitFor(() => allTexts(tree).includes('hello'), 60);
  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Model…'), 60);
  await pressLabel(tree, 'Model…');

  // Nothing sits directly in "Claude": requiring an exact depth made the whole provider vanish.
  await emit({ type: 'model.list.result', models: [
    { id: 'fast-1', label: 'Fast' },
    { id: 'opus', label: 'Opus (auto)', group: 'Claude/Opus' },
  ], defaultModel: 'fast-1' });
  await emit({ type: 'model.result', threadId: THREAD, model: 'fast-1', defaultModel: 'fast-1', effort: { level: '', levels: [], supported: false } });

  await waitFor(() => labelsOf(tree).includes('Claude ›'), 60);
  await pressLabel(tree, 'Claude ›');
  await waitFor(() => labelsOf(tree).includes('Opus ›'), 60);
  await pressLabel(tree, 'Opus ›');
  await waitFor(() => labelsOf(tree).includes('Opus (auto)'), 60);

  await settleAndUnmount(tree);
});

test('the subtitle shows which model the thread runs on', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hello', []);
  });
  await waitFor(() => allTexts(tree).includes('hello'), 60);
  await emit({ type: 'model.list.result', models: [
    { id: 'fast-1', label: 'Fast' },
    { id: 'strong-2', label: 'Strong' },
  ], defaultModel: 'fast-1' });
  await emit({ type: 'model.result', threadId: THREAD, model: 'strong-2', defaultModel: 'fast-1', effort: { level: '', levels: [], supported: false } });
  await waitFor(() => allTexts(tree).some(text => text.includes('model: Strong')), 60);
  await settleAndUnmount(tree);
});

test('an approval request opens a sheet; approving answers the server', async () => {
  const tree = await renderApp();
  await waitFor(() => labelsOf(tree).includes('Message to send'));

  await emit({ type: 'approval.request', id: 'a1', threadId: THREAD, toolName: 'bash', args: { command: 'rm -rf /tmp/x' }, replyToId: 'm1', expiresAt: Date.now() + 60000 });

  await waitFor(() => labelsOf(tree).includes('Approve'));
  expect(allTexts(tree).some(text => text.includes('rm -rf'))).toBe(true);

  await pressLabel(tree, 'Approve');
  await waitFor(() =>
    sentFrames().includes(JSON.stringify({ type: 'approval.response', id: 'a1', accepted: true })),
  );
  await waitFor(() => !labelsOf(tree).includes('Approve'));

  await settleAndUnmount(tree);
});

test('a command result arrives as its own bubble, not an agent reply', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, 'u1', '/status', []);
  });
  await emit({ type: 'chat.command.result', threadId: THREAD, replyToId: 'u1', text: 'Tokens: 1200' });
  await waitFor(() => allTexts(tree).some(text => text.includes('Tokens: 1200')), 60);
  await settleAndUnmount(tree);
});

test('a slow command shows it is running, and the result replaces that bubble', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, 'u2', '/compact', []);
  });

  await emit({ type: 'chat.command.pending', threadId: THREAD, replyToId: 'u2', text: 'Running /compact...' });
  await waitFor(() => allTexts(tree).some(text => text.includes('Running /compact...')), 60);

  await emit({ type: 'chat.command.result', threadId: THREAD, replyToId: 'u2', text: 'Context compacted (SDK session summarized).' });
  await waitFor(() => allTexts(tree).some(text => text.includes('Context compacted')), 60);
  // One bubble, not two: the wait and its answer are the same place in the conversation.
  expect(allTexts(tree).some(text => text.includes('Running /compact...'))).toBe(false);
  expect(chatStore.getItems(THREAD).filter(item => item.kind === 'text' && item.role === 'agent')).toHaveLength(1);

  await settleAndUnmount(tree);
});

test('a compaction summary is folded under the result, and opens on tap', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, 'u4', '/compact', []);
  });

  await emit({
    type: 'chat.command.result',
    threadId: THREAD,
    replyToId: 'u4',
    text: 'Context compacted (SDK session summarized).',
    details: '1. What the owner asked\n2. What was built',
  });
  await waitFor(() => allTexts(tree).some(text => text.includes('Context compacted')), 60);

  // Folded: the label is there, the body is not.
  expect(labelsOf(tree)).toContain('Summary');
  expect(allTexts(tree).some(text => text.includes('What was built'))).toBe(false);

  await pressLabel(tree, 'Summary');
  await waitFor(() => allTexts(tree).some(text => text.includes('What was built')), 60);

  await settleAndUnmount(tree);
});

test('a placeholder left by a command the server does not know goes away when the agent answers', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, 'u3', '/whatever', []);
  });
  await emit({ type: 'chat.command.pending', threadId: THREAD, replyToId: 'u3', text: 'Running /whatever...' });
  await waitFor(() => allTexts(tree).some(text => text.includes('Running /whatever...')), 60);

  await emit({ type: 'chat.stream.start', threadId: THREAD, id: 's1', replyToId: 'u3' });
  await emit({ type: 'chat.stream.delta', threadId: THREAD, id: 's1', text: 'no such command' });
  await waitFor(() => allTexts(tree).some(text => text.includes('no such command')), 60);
  expect(allTexts(tree).some(text => text.includes('Running /whatever...'))).toBe(false);

  await settleAndUnmount(tree);
});

test('emptying a conversation is gone: archive files it away, delete destroys it', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hello there', []);
  });
  await waitFor(() => allTexts(tree).includes('hello there'));

  await pressLabel(tree, 'Commands');
  await waitFor(() => labelsOf(tree).includes('Model…'));
  expect(labelsOf(tree)).not.toContain('Clear history');

  // Nothing may reach for the frame either: the server no longer answers it.
  expect(sentFrames().some(frame => frame.includes('session.clear'))).toBe(false);

  await settleAndUnmount(tree);
});

test('chat.cleared empties the thread on the server word', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hello there', []);
  });
  await waitFor(() => allTexts(tree).includes('hello there'), 60);
  await emit({ type: 'chat.cleared', threadId: THREAD });
  await waitFor(() => !allTexts(tree).includes('hello there'), 60);
  await settleAndUnmount(tree);
});

test('a run keeps Stop visible across tool calls and until it ends', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.startRun(THREAD);
    chatStore.startStream(THREAD, 's1', 'u1');
    chatStore.appendDelta(THREAD, 's1', 'one ');
  });
  await waitFor(() => labelsOf(tree).includes('Stop generating'));
  expect(labelsOf(tree)).not.toContain('Send message');

  // The bubble seals while a tool runs: the button must survive it.
  await ReactTestRenderer.act(async () => {
    chatStore.endStream(THREAD, 's1');
    chatStore.addToolCall(THREAD, { id: 'c1', name: 'bash', args: {}, ok: true, output: 'out', truncated: false });
  });
  await waitFor(() => labelsOf(tree).includes('Stop generating'));

  await pressLabel(tree, 'Stop generating');
  await waitFor(() =>
    sentFrames().includes(JSON.stringify({ type: 'chat.stop', threadId: THREAD })),
  );

  await ReactTestRenderer.act(async () => {
    chatStore.endRun(THREAD);
  });
  await waitFor(() => !labelsOf(tree).includes('Stop generating'));

  await settleAndUnmount(tree);
});

/**
 * The list scrolls on a 40ms timer; a test that ends first lets it fire outside act() and
 * fails the run. Wait it out inside act before tearing the tree down.
 */
async function settleAndUnmount(tree: Tree): Promise<void> {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 60));
  });
  await unmount(tree);
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

/** The Android layer calls the last registered handler and stops when it returns true. */
async function hardwareBack(): Promise<boolean> {
  // eslint-disable-next-line @react-native/no-deep-imports -- the ios stub is what the barrel resolves to under jest
  const back = require('react-native/Libraries/Utilities/BackHandler.ios') as {
    default: { __handlers: Array<() => boolean> };
  };
  const handlers = back.default.__handlers;
  let handled = false;
  await ReactTestRenderer.act(async () => {
    handled = handlers[handlers.length - 1]!();
  });
  return handled;
}



test('the model row says when the chat only inherits the model, and from where', async () => {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hello', []);
  });
  await waitFor(() => allTexts(tree).includes('hello'), 60);
  // The server resolved this chat's model to an agent pin: the chat picked nothing, so the row
  // must not read as a choice the user made. Without the origin, picking the global default looks
  // like a no-op with no explanation -- which is how the incident hid for two days.
  await emit({
    type: 'model.list.result',
    models: [
      { id: 'fast-1', label: 'Fast' },
      { id: 'strong-2', label: 'Strong' },
    ],
    defaultModel: 'fast-1',
  });
  await emit({
    type: 'model.result',
    threadId: THREAD,
    model: 'strong-2',
    defaultModel: 'fast-1',
    source: 'agent',
    effort: { level: '', levels: [], supported: false },
  });
  await pressLabel(tree, 'Commands');
  await waitFor(() => textsOf(tree).some(t => t.includes('current: Strong')), 60);
  expect(textsOf(tree).some(t => t.includes('from the agent config'))).toBe(true);
  await settleAndUnmount(tree);
});
