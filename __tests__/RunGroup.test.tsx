/**
 * A run group's controls.
 *
 * Two things are guarded here. A run is easily three hundred cards, so an open group offers a way
 * out at *both* ends -- a quiet `hide` word at the bottom, never a second full-width bar, which
 * read as two controls for one fold. And the open state lives in the screen, not in the row,
 * because a folded group whose work arrives is remounted as a group of real items -- held in the
 * component, it snapped shut the moment it filled.
 *
 * @format
 */

import React from 'react';
import { Text } from 'react-native';
import { ChevronIcon } from '../src/components/icons';
import ReactTestRenderer from 'react-test-renderer';
import { FoldedRunGroup, RunGroup } from '../src/components/RunGroup';
import { chatStore, type ChatItem, type RunInfo, type RunSummaryItem } from '../src/core/chat';
import { deviceBridge } from '../src/core/nativeBridge';
import { sessionStore } from '../src/core/sessions';
import type { HistoryEntry, RunMeta } from '../src/core/protocol';
import { ThemeContext } from '../src/theme';
import { darkPalette } from '../src/theme/palettes';
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

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

function render(node: React.JSX.Element): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark', themeId: 'sable' }}>{node}</ThemeContext.Provider>);
  });
  mounted.push(tree);
  return tree;
}

/**
 * Every control of the group: one when collapsed, two when an open body is long.
 *
 * Host nodes only. A Pressable surfaces three times (composite, its class, its view) with the
 * same props, so counting labels straight would triple every bar.
 */
/** Every string a Text draws, nested Texts included, in document order. */
function textOf(tree: ReactTestRenderer.ReactTestRenderer): string {
  const flat = (value: unknown): string =>
    typeof value === 'string' ? value : Array.isArray(value) ? value.map(flat).join('') : '';
  return tree.root.findAllByType(Text).map(node => flat(node.props.children)).join('');
}

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

const group = (items: ChatItem[], open: boolean, onToggle = jest.fn(), foot: RunInfo | undefined = undefined) =>
  render(
    <RunGroup
      run={RUN}
      items={items}
      open={open}
      foot={foot}
      onToggle={onToggle}
      renderItem={item => <Text>{item.id}</Text>}
    />,
  );

test('a collapsed group is one bar, and it says what it holds', () => {
  const tree = group([card('a'), card('b'), card('c')], false);
  expect(bars(tree)).toHaveLength(1);
  // Two weights inside one Text, as the POC draws them: the count in the ink, the tool name
  // greyed beside it. Nothing of the body is mounted while it is closed, and the header never
  // carries the run's span -- a span in it read as the fold's own time
  // ("on a l'impression que c'est le temps du dernier regroupement", 2026-09-22).
  const drawn = textOf(tree);
  expect(drawn).toContain('3 tool calls');
  // What it touched, not the first tool's name: `bash` is the first call of nearly every run, and
  // naming it said nothing about the other two.
  expect(drawn).toContain('· 3 shell');
  expect(drawn).not.toContain('· bash');
  expect(drawn).not.toContain('1 min');
  // Nothing of the body while it is closed: that is what makes a long thread cheap. The ids are
  // what renderItem draws, and `bash` hides an "a" of its own.
  expect(tree.root.findAllByType(Text).map(node => node.props.children)).not.toContain('a');
});

test("the run's span and status ride its empreinte, and only there", () => {
  // One run has a header per burst: the span and the status are the run's, so they stand once,
  // where the run ended, signed as the run's.
  const stopped: RunInfo = { ...RUN, status: 'aborted' };
  const items = [card('a'), card('b')];
  const middle = render(
    <RunGroup run={stopped} items={items} open={false} onToggle={jest.fn()} renderItem={item => <Text>{item.id}</Text>} />,
  );
  const middleTexts = middle.root.findAllByType(Text).map(node => node.props.children);
  expect(middleTexts.join('')).toContain('2 tool calls');
  expect(middleTexts).not.toContain('run ·');
  expect(middleTexts).not.toContain('Stopped');

  const tail = render(
    <RunGroup
      run={stopped}
      items={items}
      open={false}
      foot={stopped}
      onToggle={jest.fn()}
      renderItem={item => <Text>{item.id}</Text>}
    />,
  );
  const tailTexts = tail.root.findAllByType(Text).map(node => node.props.children);
  // The word `run` scopes the number: this is the run's 1 min, not the fold's.
  expect(tailTexts).toContain('run · 1 min');
  expect(tailTexts).toContain(' · Stopped');
  // The bar above says what it holds and no span at all.
  expect(textOf(middle)).not.toContain('1 min');
});

test('a fold that only holds thoughts says so, instead of "run"', () => {
  const thinking: ChatItem = {
    kind: 'text',
    id: 'p1',
    role: 'agent',
    text: '',
    reasoning: 'weighing the options',
    attachments: [],
    streaming: false,
    ts: 5,
  } as ChatItem;
  const tree = group([thinking, { ...thinking, id: 'p2' } as ChatItem], false);
  expect(tree.root.findAllByType(Text).map(node => node.props.children)).toContain('2 thoughts');
});

test('a long open group offers a way out at its bottom, without a second bar', () => {
  // The complaint this exists for: with the only control at the top, closing a three-hundred
  // card run meant scrolling all the way back up through it. The answer is one quiet word, not
  // the same bar drawn again: two identical bars for one fold was the slop the owner rejected.
  const items = Array.from({ length: 8 }, (_, i) => card(`c${i}`));
  const tree = group(items, true);
  expect(bars(tree)).toHaveLength(2);
  expect(textOf(tree)).toContain('hide');
  // One chevron, on the header, pointing down at the work.
  expect(tree.root.findAllByType(ChevronIcon)).toHaveLength(1);
  expect(tree.root.findAllByType(ChevronIcon)[0]!.props.direction).toBe('down');
});

test('a short open group keeps one bar', () => {
  // About a screen of body: the header is still in reach and a second bar is chrome.
  const tree = group([card('a'), card('b')], true);
  expect(bars(tree)).toHaveLength(1);
});

test('the hide word at the bottom closes the group', () => {
  const onToggle = jest.fn();
  const items = Array.from({ length: 8 }, (_, i) => card(`c${i}`));
  const tree = group(items, true, onToggle);
  press(tree, 1);
  expect(onToggle).toHaveBeenCalledTimes(1);
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
  expect(onToggle).toHaveBeenCalledTimes(1);

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
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark', themeId: 'sable' }}>
        <FoldedRunGroup run={RUN} summaries={refreshed} open onToggle={jest.fn()} onOpen={onOpen} />
      </ThemeContext.Provider>,
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
      foot={RUN}
      onToggle={jest.fn()}
      onOpen={jest.fn()}
    />,
  );
  const texts = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(texts.join('')).toContain('52 tool calls');
  // The merged folds read as one group, and the run signs once, under it.
  expect(texts).toContain('run · 1 min');
});

test('a stopped run wears the owner’s word, not the engine’s', () => {
  // One vocabulary across the surfaces: the loader says "Stopping…" while the abort travels, and
  // the signature of the run it cut says "Stopped" once it landed. `aborted` was the engine's.
  const stopped: RunInfo = { ...RUN, status: 'aborted' };
  const tree = render(
    <RunGroup
      run={stopped}
      items={[card('a')]}
      open={false}
      foot={stopped}
      onToggle={jest.fn()}
      renderItem={item => <Text>{item.id}</Text>}
    />,
  );

  const texts = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(texts).toContain(' · Stopped');
  expect(texts).not.toContain('aborted');
});

test('a fold of one card draws the card, and the run signs under it', () => {
  // The bar hides work the reader has not asked to see, and one card hides nothing -- so the run's
  // signature is what the row still owes, drawn as its own line under the card.
  const tree = group([card('only')], false, jest.fn(), RUN);
  const texts = tree.root.findAllByType(Text).map(node => node.props.children);
  expect(texts).toContain('only');
  expect(texts).toContain('run · 1 min');
  expect(bars(tree)).toHaveLength(0);
});

/** A group the run signs under, or one it does not. */
const groupWith = (items: ChatItem[], foot: boolean, run: RunInfo = RUN) =>
  render(
    <RunGroup
      run={run}
      items={items}
      open={false}
      foot={foot ? run : undefined}
      onToggle={jest.fn()}
      renderItem={item => <Text>{item.id}</Text>}
    />,
  );

const textsOf = (tree: ReactTestRenderer.ReactTestRenderer): unknown[] =>
  tree.root.findAllByType(Text).map(node => node.props.children);

test('a fold of a single tool call draws the card, and no bar to open', () => {
  // The owner, twice in one message: "quand il n'y a qu'un seul tool call, ne regroupe pas"
  // (2026-09-21). One card behind one bar is a press for nothing -- the bar said the same thing
  // the card says, and the card is what he was after.
  const tree = groupWith([card('a')], false);
  expect(bars(tree)).toHaveLength(0);
  expect(textsOf(tree)).toContain('a');
});

test('a fold of a single thought still folds: the thought is what the bar stands for', () => {
  // The rule is about a card, not about every short fold: a lone thinking phase is a body the
  // reader has not asked for, which is exactly what a group is for.
  const thinking = {
    kind: 'text',
    id: 'p1',
    role: 'agent',
    text: '',
    reasoning: 'weighing the options',
    attachments: [],
    streaming: false,
    ts: 5,
  } as ChatItem;
  const tree = groupWith([thinking], true);
  expect(bars(tree)).toHaveLength(1);
  expect(textsOf(tree)).toContain('1 thought');
});

test('the run\'s span and the word it stopped on stand under the lone card', () => {
  // What the bar carried is not about the fold: "Stopped" and the run's span exist nowhere else
  // in the thread, so they sign under the card as the run's empreinte rather than disappearing
  // with the bar.
  const stopped: RunInfo = { ...RUN, status: 'aborted' };
  const tree = groupWith([card('a')], true, stopped);
  expect(bars(tree)).toHaveLength(0);
  expect(textsOf(tree)).toContain('a');
  expect(textsOf(tree)).toContain(' · Stopped');
  expect(textsOf(tree)).toContain('run · 1 min');
});

test('a lone card in the middle of a run draws nothing under it', () => {
  // The signature is the run's end, and a fold the run did not end on has none: the span would be
  // the run's, said once per fold.
  const tree = groupWith([card('a')], false);
  expect(textsOf(tree).some(line => String(line).includes('run ·'))).toBe(false);
});
