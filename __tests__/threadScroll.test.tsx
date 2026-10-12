/**
 * @format
 */

import ReactTestRenderer from 'react-test-renderer';
import { FlatList } from 'react-native';
import { chatStore } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { commandStore } from '../src/core/commands';
import type { HistoryEntry } from '../src/core/protocol';
import { renderApp, textsOf, waitFor, type Tree } from '../test-utils/render';

const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
const THREAD = 't-scroll';
const mounted: Tree[] = [];

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

beforeEach(() => {
  chatStore.clearAll();
  commandStore.replace([
    { name: 'status', description: 'Session diagnostics: context, tokens, cost' },
    { name: 'model', description: 'Show or change current model' },
    { name: 'help', description: 'List available commands' },
  ]);
  // The stored thread is what the shell reopens, so the seeded history is the one on screen.
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });
});

const history: HistoryEntry[] = [
  { id: 'h-0', role: 'user', text: 'read the file', ts: '2026-01-01T10:00:00.000Z' },
  {
    id: 'h-1',
    role: 'tool',
    name: 'bash',
    args: { command: 'ls' },
    durationMs: 4,
    ok: true,
    output: 'a\nb',
    truncated: false,
    ts: '2026-01-01T10:00:01.000Z',
  },
  { id: 'h-2', role: 'assistant', text: 'the file lists two names', ts: '2026-01-01T10:00:02.000Z' },
];

function threadList(tree: Tree): ReactTestRenderer.ReactTestInstance {
  const list = tree.root
    .findAllByType(FlatList)
    .find(node =>
      Array.isArray(node.props.data) &&
      (node.props.data as Array<Record<string, unknown>>).some(
        entry => entry && typeof entry === 'object' && 'kind' in entry,
      ),
    );
  expect(list).toBeDefined();
  return list!;
}

async function renderThread(): Promise<Tree> {
  const tree = await renderApp();
  mounted.push(tree);
  await ReactTestRenderer.act(async () => {
    chatStore.seedHistory(THREAD, history);
  });
  await waitFor(() => textsOf(tree).includes('bash'));
  return tree;
}

test('the thread anchors what the reader is looking at', async () => {
  const tree = await renderThread();
  const list = threadList(tree);

  // The doc, verbatim: the first child currently visible must not change position, which is the
  // whole bug -- a new item or a growing answer moved the paragraph being read.
  expect(list.props.maintainVisibleContentPosition).toBeDefined();
  expect(list.props.maintainVisibleContentPosition.minIndexForVisible).toBe(0);
  // A thread opens on its newest message, so the reader is following by definition, and the
  // threshold is not a distance any more: the native helper compares it to the offset it is
  // about to correct, which its own correction pushes past any distance we could name. A huge
  // value means "always", and the follow is carried by the gesture below, not by this number.
  expect(list.props.maintainVisibleContentPosition.autoscrollToTopThreshold).toBe(2_147_483_647);
});

/**
 * At 120, the stream took the follow away for good: the helper reads the offset *before* it
 * corrects it, so the first correction (which the reader asked for) put the value above the
 * threshold, and every correction after that found the door closed. The follow is an intention,
 * and an intention is only ever changed by a hand on the screen.
 */
test('a compensation does not take the follow away', async () => {
  const tree = await renderThread();
  const list = threadList(tree);

  // What the list emits on its own when an item arrives and the anchor moves. The reader did not
  // touch anything.
  ReactTestRenderer.act(() => {
    list.props.onScroll({ nativeEvent: { contentOffset: { y: 480 } } });
  });

  const list2 = threadList(tree);
  expect(list2.props.maintainVisibleContentPosition.autoscrollToTopThreshold).toBe(2_147_483_647);
});

test('a gesture that leaves the reader above the newest message takes the threshold away', async () => {
  const tree = await renderThread();
  const list = threadList(tree);

  ReactTestRenderer.act(() => {
    list.props.onScrollEndDrag({ nativeEvent: { contentOffset: { y: 480 } } });
  });

  // No threshold: the prop keeps its other half (the anchor holds still) and stops following.
  expect(threadList(tree).props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
});

test('the jump button brings the follow back', async () => {
  const tree = await renderThread();
  const list = threadList(tree);

  ReactTestRenderer.act(() => {
    list.props.onScroll({ nativeEvent: { contentOffset: { y: 480 } } });
    list.props.onScrollEndDrag({ nativeEvent: { contentOffset: { y: 480 } } });
  });
  expect(threadList(tree).props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });

  const jump = tree.root.find(
    node => node.props.accessibilityLabel === 'Jump to latest message',
  );
  ReactTestRenderer.act(() => {
    jump.props.onPress();
  });

  expect(threadList(tree).props.maintainVisibleContentPosition.autoscrollToTopThreshold).toBe(2_147_483_647);
});

test('no fold has a scroll to fail, so the list carries no failure handler', async () => {
  const tree = await renderThread();
  const list = threadList(tree);

  // The failure handler existed for one caller and one API: `scrollToIndex` without
  // `getItemLayout`. Nothing folds through it any more, so nothing needs it.
  expect(list.props.onScrollToIndexFailed).toBeUndefined();
});

test('unfolding a tool card asks the list to move nothing', async () => {
  const tree = await renderThread();
  const list = threadList(tree);
  const scrolled = jest
    .spyOn(list.instance as FlatList, 'scrollToIndex')
    .mockImplementation(() => {});
  const offset = jest
    .spyOn(list.instance as FlatList, 'scrollToOffset')
    .mockImplementation(() => {});

  const card = tree.root.find(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      (node.props.accessibilityLabel as string).startsWith('Tool bash'),
  );
  ReactTestRenderer.act(() => {
    card.props.onPress();
  });

  // The anchor prop already holds the reading position while a row changes height. Asking for a
  // second, computed destination is what used to fight it and move the row that was tapped.
  expect(scrolled).not.toHaveBeenCalled();
  expect(offset).not.toHaveBeenCalled();
  scrolled.mockRestore();
  offset.mockRestore();
});
