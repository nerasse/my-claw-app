/**
 * Taking text out of a conversation.
 *
 * Two platform facts shape all of this, and both are guarded here (docs/text-selection.md):
 * a selection never leaves the Text node it started in, and a selectable text view inside the
 * inverted chat list takes focus on long press, which makes Android scroll the thread to the
 * other end. So nothing in the thread is selectable, and everything worth selecting points at
 * one viewer that holds the raw source in a single node.
 *
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import type { HistoryEntry } from '../src/core/protocol';
import { labelsOf, press, renderApp, textsOf, unmount, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-select';

const history: HistoryEntry[] = [
  // A turn of the owner's, oldest here and so at the bottom of the thread: the menu can then be
  // checked on a message that carries no reasoning while the answer stays the newest row.
  { id: 'h-3', role: 'user', text: 'run it again please', ts: '2026-01-01T10:00:00.000Z' },
  {
    role: 'tool',
    ts: '2026-01-01T10:00:01.000Z',
    id: 'h-1',
    name: 'bash',
    args: { command: 'echo hello' },
    durationMs: 4,
    ok: true,
    output: 'hello from the shell',
    truncated: false,
  },
  {
    id: 'h-2',
    role: 'assistant',
    text: 'the command replied',
    reasoning: 'weighing two options',
    ts: '2026-01-01T10:00:02.000Z',
  },
];

/**
 * Every node the platform would let a finger start a selection in. Host nodes only: a Text is
 * both a composite and the host it renders, and the pair would count twice.
 */
function selectableNodes(tree: Tree): ReactTestRenderer.ReactTestInstance[] {
  return tree.root.findAll(node => node.props?.selectable === true && typeof node.type === 'string', {
    deep: true,
  });
}

/**
 * The bubble takes the long press. It carries no label on purpose (a labelled Pressable is one
 * accessible node and would hide everything inside the bubble), so it is found by the gesture.
 */
function longPressBubble(tree: Tree, holding?: string): void {
  const bubbles = tree.root.findAll(node => typeof node.props?.onLongPress === 'function');
  // The thread is inverted, so index 0 is the newest message, not the answer. A caller that names
  // a body gets the bubble that holds it; the plain call keeps taking the first one.
  const target = holding === undefined
    ? bubbles[0]
    : bubbles.find(bubble => drawnTexts(bubble).includes(holding));
  if (!target) throw new Error('no long-pressable bubble');
  ReactTestRenderer.act(() => {
    target.props.onLongPress();
  });
}

/** The strings under one node, in render order. */
function drawnTexts(node: ReactTestRenderer.ReactTestInstance): string[] {
  const out: string[] = [];
  const push = (value: unknown): void => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(push);
  };
  for (const text of node.findAllByType(Text)) push(text.props.children);
  return out;
}

async function renderThread(): Promise<Tree> {
  const tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.seedHistory(THREAD, history);
  });
  await waitFor(() => textsOf(tree).includes('the command replied'));
  return tree;
}

beforeEach(() => {
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
  (Clipboard.setString as jest.Mock).mockClear();
});

test('nothing inside the thread can start a selection, tool cards included', async () => {
  const tree = await renderThread();
  expect(selectableNodes(tree)).toHaveLength(0);

  // The output of a tool is the densest text in the thread and the most tempting to drag over.
  await press(tree, 'Tool bash, 4 ms');
  await waitFor(() => textsOf(tree).includes('hello from the shell'));
  expect(selectableNodes(tree)).toHaveLength(0);

  await unmount(tree);
});

test('a long press on a message opens its actions instead of a selection', async () => {
  const tree = await renderThread();

  longPressBubble(tree);
  await waitFor(() => textsOf(tree).includes('Select text'));
  expect(textsOf(tree)).toContain('Copy text');

  await unmount(tree);
});

test('the viewer holds the message in one selectable node, and the thinking is not in it', async () => {
  const tree = await renderThread();

  longPressBubble(tree);
  await waitFor(() => textsOf(tree).includes('Select text'));
  await press(tree, 'Select text');
  await waitFor(() => labelsOf(tree).includes('Close the selection view'));

  // One node, or a drag would stop at the first block again.
  const selectable = selectableNodes(tree);
  expect(selectable).toHaveLength(1);
  const body = selectable[0]!.props.children as string;
  expect(body).toContain('the command replied');
  // The thinking that produced the answer folds with the run now, on a row of its own with its own
  // copy button: it is not part of this message any more (owner, 2026-11-13).
  expect(body).not.toContain('weighing two options');

  // The bar takes the lot without asking the reader to drag at all.
  await press(tree, 'Copy everything');
  expect(Clipboard.setString).toHaveBeenCalledWith(body);

  await press(tree, 'Close the selection view');
  await waitFor(() => !labelsOf(tree).includes('Close the selection view'));

  await unmount(tree);
});

test('a tool card sends its output to the same viewer, raw', async () => {
  const tree = await renderThread();

  await press(tree, 'Tool bash, 4 ms');
  await waitFor(() => textsOf(tree).includes('hello from the shell'));
  await press(tree, 'Select text in bash output');
  await waitFor(() => labelsOf(tree).includes('Close the selection view'));

  const selectable = selectableNodes(tree);
  expect(selectable).toHaveLength(1);
  expect(selectable[0]!.props.children).toBe('hello from the shell');

  await unmount(tree);
});

/**
 * The copy row names what it takes, and there is only one left.
 *
 * `Copy text` used to drag the reasoning along, so `Copy with thinking` and `Copy reasoning` were
 * added to get at the parts separately (owner, 2026-11-04). The thinking now folds with the run and
 * carries its own copy button on its row, so both extra rows pointed at something the bubble no
 * longer holds: they are gone rather than left copying an empty string.
 */
test('copying a message takes its words alone: the thinking is not on it any more', async () => {
  const tree = await renderThread();

  longPressBubble(tree, 'the command replied');
  await waitFor(() => textsOf(tree).includes('Copy text'));

  await press(tree, 'Copy text');
  expect(Clipboard.setString).toHaveBeenCalledWith('the command replied');

  // Neither row exists: the reasoning folds with the run and carries its own copy button there
  // (owner, 2026-11-13). A row that copied the answer again, or copied nothing, would be worse.
  (Clipboard.setString as jest.Mock).mockClear();
  longPressBubble(tree, 'the command replied');
  await waitFor(() => textsOf(tree).includes('Copy text'));
  expect(textsOf(tree)).not.toContain('Copy with thinking');
  expect(textsOf(tree)).not.toContain('Copy reasoning');

  await unmount(tree);
});

test('a turn with no reasoning offers no copy-with-thinking row', async () => {
  const tree = await renderThread();
  // The owner's own messages carry no reasoning: the row would copy exactly what the row above
  // copies, so it is not drawn at all.
  longPressBubble(tree, 'run it again please');
  await waitFor(() => textsOf(tree).includes('Copy text'));
  expect(textsOf(tree)).not.toContain('Copy with thinking');

  await unmount(tree);
});
