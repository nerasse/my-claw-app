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
  // Near the newest message the reader is following, not reading: keep following, with the same
  // 120 the jump-to-latest button already uses for "near the bottom".
  expect(list.props.maintainVisibleContentPosition.autoscrollToTopThreshold).toBe(120);
});

test('an index the list has never measured is asked for again rather than crashing', async () => {
  const tree = await renderThread();
  const list = threadList(tree);

  // No getItemLayout: heights are unknowable (markdown, images, tool output), so VirtualizedList
  // requires a failure handler and asserts without one.
  expect(typeof list.props.onScrollToIndexFailed).toBe('function');
});

test('unfolding a tool card brings its row to the top of the reading area', async () => {
  const tree = await renderThread();
  const list = threadList(tree);
  const scrolled = jest
    .spyOn(list.instance as FlatList, 'scrollToIndex')
    .mockImplementation(() => {});

  const card = tree.root.find(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      (node.props.accessibilityLabel as string).startsWith('Tool bash'),
  );
  ReactTestRenderer.act(() => {
    card.props.onPress();
  });

  expect(scrolled).toHaveBeenCalled();
  // 1, not 0: the axis is flipped with the content, so the usual value lands the row at the bottom.
  expect((scrolled.mock.calls[0][0] as { viewPosition: number }).viewPosition).toBe(1);
  scrolled.mockRestore();
});
