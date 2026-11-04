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

test('the viewer holds the whole message, reasoning included, in one selectable node', async () => {
  const tree = await renderThread();

  longPressBubble(tree);
  await waitFor(() => textsOf(tree).includes('Select text'));
  await press(tree, 'Select text');
  await waitFor(() => labelsOf(tree).includes('Close the selection view'));

  // One node, or a drag would stop at the first block again.
  const selectable = selectableNodes(tree);
  expect(selectable).toHaveLength(1);
  const body = selectable[0]!.props.children as string;
  expect(body).toContain('weighing two options');
  expect(body).toContain('the command replied');

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
 * The two copy rows name what they take.
 *
 * `Copy text` used to paste the reasoning along with the answer, and there was no way to take
 * both halves at once without the selection viewer (owner, 2026-11-04: "mets un action copy with
 * thinking et retire le thinking du copy message"). So the plain copy is the answer alone, and
 * `Copy with thinking` is the pair. A third row for the reasoning stays where it was, which is
 * why the plain one must not carry it: it would copy the same text twice.
 */
test('copying a message takes the answer alone, and a second row takes the reasoning too', async () => {
  const tree = await renderThread();

  longPressBubble(tree, 'the command replied');
  await waitFor(() => textsOf(tree).includes('Copy text'));

  await press(tree, 'Copy text');
  expect(Clipboard.setString).toHaveBeenCalledWith('the command replied');

  (Clipboard.setString as jest.Mock).mockClear();
  longPressBubble(tree, 'the command replied');
  await waitFor(() => textsOf(tree).includes('Copy with thinking'));
  await press(tree, 'Copy with thinking');
  const copied = String((Clipboard.setString as jest.Mock).mock.calls[0]![0]);
  expect(copied).toContain('## Reasoning');
  expect(copied).toContain('weighing two options');
  expect(copied).toContain('the command replied');

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
