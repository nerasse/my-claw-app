/**
 * A run group's controls.
 *
 * Two things are guarded here. A run is easily three hundred cards, so an open group carries a
 * bar at both ends: closing one must not mean scrolling back up through the work you just read.
 * And the open state lives in the screen, not in the row, because a folded group whose work
 * arrives is remounted as a group of real items -- held in the component, it snapped shut the
 * moment it filled.
 *
 * @format
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { FoldedRunGroup, RunGroup } from '../src/components/RunGroup';
import { chatStore, type ChatItem, type RunInfo, type RunSummaryItem } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { sessionStore } from '../src/core/sessions';
import type { HistoryEntry, RunMeta } from '../src/core/protocol';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { labelsOf, renderApp, unmount, waitFor, type Tree } from '../test-utils/render';

const RUN: RunInfo = { id: 'r1', status: 'done', startTs: 1_000, endTs: 61_000 };

const card = (id: string): ChatItem =>
  ({ kind: 'tool', id, name: 'bash', args: {}, output: 'ok', ok: true, truncated: false, ts: 5 }) as ChatItem;

const summaryRow = (id: string, itemCount: number): RunSummaryItem => ({
  kind: 'run',
  id,
  run: RUN,
  toolCount: itemCount,
  firstTool: 'bash',
  itemCount,
  lastId: `${id}-last`,
  hydration: 'idle',
  ts: 5,
});

function render(node: React.JSX.Element): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<ThemeProvider>{node}</ThemeProvider>);
  });
  return tree;
}

/**
 * Every control of the group: one when collapsed, two when an open body is long.
 *
 * Host nodes only. A Pressable surfaces three times (composite, its class, its view) with the
 * same props, so counting labels straight would triple every bar.
 */
const bars = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'button');

/** The pressable behind a bar: the composite is the one that can react. */
const press = (tree: ReactTestRenderer.ReactTestRenderer, index: number): void => {
  const targets = tree.root.findAll(
    node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    { deep: true },
  );
  ReactTestRenderer.act(() => {
    targets[index]!.props.onPress();
  });
};

const TS = '2026-01-01T10:00:00.000Z';

/** A question, a run of eight calls, its answer: one group, long enough to earn a bottom bar. */
function runHistory(): HistoryEntry[] {
  const meta: RunMeta = { id: 'run-1', status: 'done', startTs: TS, endTs: '2026-01-01T10:01:00.000Z' };
  return [
    { id: 'h-0', role: 'user', text: 'check the site', ts: TS },
    ...Array.from({ length: 8 }, (_, i): HistoryEntry => ({
      role: 'tool',
      ts: TS,
      id: `h-t${i}`,
      name: 'bash',
      args: { command: 'echo hello' },
      durationMs: 4,
      ok: true,
      output: 'hello',
      truncated: false,
      run: meta,
    })),
    { id: 'h-9', role: 'assistant', text: 'the command replied', ts: TS, run: meta },
  ];
}

/** Presses a control of the mounted app by label, the composite that can react. */
function pressAppLabel(tree: Tree, label: string): Promise<void> {
  return ReactTestRenderer.act(async () => {
    const targets = tree.root.findAll(
      node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
      { deep: true },
    );
    targets[0]!.props.onPress();
  });
}

const group = (items: ChatItem[], open: boolean, onToggle = jest.fn()) =>
  render(
    <RunGroup
      run={RUN}
      items={items}
      open={open}
      onToggle={onToggle}
      renderItem={item => <Text>{item.id}</Text>}
    />,
  );

test('a collapsed group is one bar, and it says what it holds', () => {
  const tree = group([card('a'), card('b'), card('c')], false);
  expect(bars(tree)).toHaveLength(1);
  const texts = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(texts).toContain('3 tool calls · bash · 1 min');
  // Nothing of the body is mounted while it is closed: that is what makes a long thread cheap.
  expect(texts).not.toContain('a');
});

test('a long open group carries a bar at the bottom too', () => {
  // The complaint this exists for: with the only control at the top, closing a three-hundred
  // card run meant scrolling all the way back up through it.
  const items = Array.from({ length: 8 }, (_, i) => card(`c${i}`));
  const tree = group(items, true);
  const both = bars(tree);
  expect(both).toHaveLength(2);
  // Both close it, and both name it, so whichever end the reader reaches is the same control.
  expect(both.map(node => node.props.accessibilityLabel)).toEqual(['Hide the run work', 'Hide the run work']);
  const chevrons = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(chevrons).toContain('▾');
  expect(chevrons).toContain('▴');
});

test('a short open group keeps one bar', () => {
  // About a screen of body: the header is still in reach and a second bar is chrome.
  const tree = group([card('a'), card('b')], true);
  expect(bars(tree)).toHaveLength(1);
});

test('the bar at the bottom closes the group', () => {
  const onToggle = jest.fn();
  const items = Array.from({ length: 8 }, (_, i) => card(`c${i}`));
  const tree = group(items, true, onToggle);
  press(tree, 1);
  expect(onToggle).toHaveBeenCalledWith(RUN);
});

test('the open state is the caller, so it survives the row being replaced', () => {
  // The reader opens a folded group; its items arrive and the row becomes a group of real items,
  // which is a different list key and therefore a remount. Held in the component, the group they
  // just opened closed itself.
  const onToggle = jest.fn();
  const onOpen = jest.fn();
  const folded = render(
    <FoldedRunGroup run={RUN} summaries={[summaryRow('run-w1', 8)]} open={false} onToggle={onToggle} onOpen={onOpen} />,
  );
  press(folded, 0);
  // The press reports the toggle and nothing else: the screen is what remembers it, and being
  // open is what fetches (see the two tests below).
  expect(onToggle).toHaveBeenCalledWith(RUN);

  // The screen having recorded it, the group that replaces the row renders open.
  const items = Array.from({ length: 8 }, (_, i) => card(`c${i}`));
  const hydrated = group(items, true);
  expect(hydrated.root.findAllByType(Text).map(node => node.props.children)).toContain('c0');
});

test('a group drawn open asks for its work, with no press behind it', () => {
  // The press used to be the only trigger, and a group can be open without one: the screen
  // remembers the fold across a redraw, so a reconnect (a reset re-seeds every row at `idle`) or
  // the trim (a hydrated group folded back to its row) both hand back an open group nobody will
  // press again. It sat on a skeleton for good -- a stack of empty bars mid-conversation.
  const onOpen = jest.fn();
  const summaries = [summaryRow('run-w1', 10)];
  render(<FoldedRunGroup run={RUN} summaries={summaries} open onToggle={jest.fn()} onOpen={onOpen} />);
  expect(onOpen).toHaveBeenCalledWith(summaries);

  const closed = jest.fn();
  render(<FoldedRunGroup run={RUN} summaries={[summaryRow('run-w2', 10)]} open={false} onToggle={jest.fn()} onOpen={closed} />);
  expect(closed).not.toHaveBeenCalled();
});

test('a redraw that hands back a row without its work asks again', () => {
  // `requestRunItems` is idempotent on the row's own `hydration`, so asking on every redraw costs
  // a comparison -- and it is the only thing that refills a group without the reader's help.
  const onOpen = jest.fn();
  const loading: RunSummaryItem[] = [{ ...summaryRow('run-w1', 10), hydration: 'loading' }];
  const tree = render(<FoldedRunGroup run={RUN} summaries={loading} open onToggle={jest.fn()} onOpen={onOpen} />);
  expect(onOpen).toHaveBeenCalledTimes(1);

  const refreshed = [summaryRow('run-w1', 10)];
  ReactTestRenderer.act(() => {
    tree.update(
      <ThemeProvider>
        <FoldedRunGroup run={RUN} summaries={refreshed} open onToggle={jest.fn()} onOpen={onOpen} />
      </ThemeProvider>,
    );
  });
  expect(onOpen).toHaveBeenNthCalledWith(2, refreshed);
});

test('an opened folded group draws a skeleton the size of what is coming', () => {
  const tree = render(
    <FoldedRunGroup run={RUN} summaries={[summaryRow('run-w1', 4)]} open onToggle={jest.fn()} onOpen={jest.fn()} />,
  );
  const loading = tree.root.findAll(
    node => typeof node.type === 'string' && node.props.accessibilityLabel === 'Loading the run work',
  );
  expect(loading).toHaveLength(1);
  expect(loading[0]!.props.children).toHaveLength(4);
});

test('a range the branch no longer holds says so instead of opening on nothing', () => {
  const tree = render(
    <FoldedRunGroup
      run={RUN}
      summaries={[{ ...summaryRow('run-w1', 4), hydration: 'failed' }]}
      open
      onToggle={jest.fn()}
      onOpen={jest.fn()}
    />,
  );
  expect(tree.root.findAllByType(Text).map(node => node.props.children)).toContain('work no longer available');
});

test('leaving a thread and coming back folds every group again', async () => {
  // The screen is not remounted on a thread change, so the open set is emptied by hand. A row
  // still marked open on the way back would draw a skeleton nobody fills: the work is fetched on
  // the press, not on the render.
  const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;
  const THREAD = 't-runs';
  chatStore.clearAll();
  bridge.prefsGetAll.mockResolvedValue({ themeMode: 'dark', lastThreadId: THREAD });

  const tree: Tree = await renderApp();
  await ReactTestRenderer.act(async () => {
    chatStore.seedHistory(THREAD, runHistory());
    sessionStore.replace([
      { threadId: THREAD, title: 'this one', messageCount: 9, createdAt: TS, lastActiveAt: TS },
      { threadId: 'other', title: 'the other one', messageCount: 1, createdAt: TS, lastActiveAt: TS },
    ]);
  });
  await waitFor(() => labelsOf(tree).includes('Show the run work'));

  await pressAppLabel(tree, 'Show the run work');
  await waitFor(() => labelsOf(tree).includes('Hide the run work'));

  // Out through the drawer and back in, the way a reader would.
  await pressAppLabel(tree, 'Open conversations');
  await pressAppLabel(tree, 'Conversation the other one');
  await waitFor(() => !labelsOf(tree).includes('Hide the run work'));
  await pressAppLabel(tree, 'Open conversations');
  await pressAppLabel(tree, 'Conversation this one');

  await waitFor(() => labelsOf(tree).includes('Show the run work'));
  expect(labelsOf(tree)).not.toContain('Hide the run work');
  await unmount(tree);
});

test('two merged rows of one run read as a single group', () => {
  // A run cut by a page boundary folds once per page; the counts add up under one header.
  const tree = render(
    <FoldedRunGroup
      run={RUN}
      summaries={[summaryRow('run-older', 40), summaryRow('run-newer', 12)]}
      open={false}
      onToggle={jest.fn()}
      onOpen={jest.fn()}
    />,
  );
  expect(tree.root.findAllByType(Text).map(node => node.props.children)).toContain('52 tool calls · bash · 1 min');
});
