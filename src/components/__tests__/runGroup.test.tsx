/**
 * The run's header, and the spine the children hang from.
 *
 * Two things the owner asked for and that keep coming back: the header must say what the run
 * touched instead of naming the first tool (`bash` in almost every run), and an open group must
 * have one control, not the same bar drawn at its top and its bottom.
 */

import React from 'react';
import { Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { RunGroup, composition } from '../RunGroup';
import { spine } from '../spine';
import type { ChatItem, RunInfo, ToolItem } from '../../core/chat';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
});

const run: RunInfo = { id: 'run-1', startTs: 1, status: 'done' };

function tool(name: string, overrides: Partial<ToolItem> = {}): ToolItem {
  return {
    id: `${name}-${Math.random()}`,
    kind: 'tool',
    name,
    args: {},
    ok: true,
    output: '',
    truncated: false,
    ts: 1,
    run,
    ...overrides,
  };
}

function thought(overrides: Partial<ChatItem> = {}): ChatItem {
  return {
    kind: 'text',
    id: `t-${Math.random()}`,
    role: 'agent',
    text: '',
    attachments: [],
    streaming: false,
    reasoning: 'thinking',
    run,
    ...overrides,
  } as ChatItem;
}

function renderGroup(items: ChatItem[], open: boolean, live = false) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <RunGroup
          items={items}
          open={open}
          live={live}
          onToggle={() => {}}
          renderItem={item => <Text>{`child:${item.id}`}</Text>}
        />
      </ThemeContext.Provider>,
    );
    mounted.push(tree);
  });
  return tree;
}

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
}

describe('the header says what the run touched', () => {
  it('counts the families instead of naming the first tool', () => {
    const label = composition(['bash', 'bash', 'bash', 'read', 'read', 'apply_patch'], 0);
    expect(label.count).toBe('6 tool calls');
    expect(label.detail).toBe('· 3 shell · 2 read · 1 edits');
    // `bash` is the first call of nearly every run: naming it said nothing about the other five.
    expect(label.detail).not.toBe('· bash');
  });

  it('names a thinking phase as one more thing the run did', () => {
    expect(composition(['bash'], 2).detail).toBe('· 1 shell · 2 thoughts');
  });

  it('says only the thoughts when there is no call at all', () => {
    const label = composition([], 3);
    expect(label.count).toBe('3 thoughts');
    // `3 thoughts · 3 thoughts` is the duplicate the owner flags.
    expect(label.detail).toBe('');
  });

  it('keeps a tool nobody classified under its own name', () => {
    expect(composition(['mcp__linear__issue'], 0).detail).toBe('· 1 mcp__linear__issue');
  });

  it('reads a lone thought as singular', () => {
    expect(composition([], 1).count).toBe('1 thought');
  });
});

describe('the fold', () => {
  const items = [tool('bash'), tool('read'), tool('apply_patch')];

  it('draws no child while it is closed', () => {
    expect(texts(renderGroup(items, false))).not.toContain(`child:${items[0]!.id}`);
  });

  const controls = (tree: ReactTestRenderer.ReactTestRenderer): number =>
    tree.root.findAll(
      node => node.props?.accessibilityLabel === 'Hide the run work' && typeof node.type === 'string',
    ).length;

  it('draws one control, never a bar at each end', () => {
    // Three children: the header is the only way out.
    expect(controls(renderGroup(items, true))).toBe(1);
    // Past five, a quiet `hide` word is offered at the bottom as well -- never a second bar.
    const long = renderGroup([tool('bash'), tool('bash'), tool('bash'), tool('bash'), tool('read'), tool('read')], true);
    expect(controls(long)).toBe(2);
    expect(texts(long)).toContain('hide');
  });

  /** Every style object of every View in the tree, one merged object per node. */
  const nodeStyles = (tree: ReactTestRenderer.ReactTestRenderer): Record<string, unknown>[] =>
    tree.root.findAllByType(View).map(node => {
      const raw = Array.isArray(node.props.style) ? node.props.style : [node.props.style];
      const flat = raw.flat(Infinity).filter((style: unknown): style is Record<string, unknown> => style !== null && typeof style === 'object');
      return Object.assign({}, ...flat) as Record<string, unknown>;
    });

  /**
   * The column used to be one line under the whole group, ending a fixed 13 pt above the bottom --
   * which hung a stub under the last row when that row was taller than a head, and read as an
   * empty bar with nothing in it (owner, 2026-11-08).
   */
  it('draws the column row by row, and stops it on the last dot', () => {
    const rails = nodeStyles(renderGroup(items, true)).filter(style => style.width === 1);
    expect(rails).toHaveLength(items.length);
    // All but the last span their own row; the last one stops on its dot, half a head down.
    expect(rails.slice(0, -1).every(rail => rail.bottom === 0 && rail.height === undefined)).toBe(true);
    const last = rails[rails.length - 1]!;
    expect(last.height).toBe(Math.round(spine(1).head / 2));
    expect(last.bottom).toBeUndefined();
  });

  /**
   * The owner's rule, verbatim: a column only ever runs *between* dots. A trailing row with
   * nothing to show kept a stub under the last real dot -- an empty bar with nothing after it
   * (2026-11-08).
   */
  it('never draws a line where no dot follows', () => {
    const waiting = {
      ...thought(),
      text: '',
      reasoning: undefined,
      reasoningTokens: undefined,
      streaming: true,
      waitingSince: Date.now(),
    } as ChatItem;
    const rails = nodeStyles(renderGroup([tool('bash'), tool('read'), waiting], true)).filter(
      style => style.width === 1,
    );
    // Two dotted rows: a full segment down to the second, and a short one to its dot. Nothing
    // hangs under it.
    expect(rails).toHaveLength(2);
    expect(rails[1]!.height).toBe(Math.round(spine(1).head / 2));
  });

  /** A row with nothing in it still takes its line of the column, so the thread does not jump. */
  it('reserves the height of a row that has nothing to show yet', () => {
    const waiting = {
      ...thought(),
      text: '',
      reasoning: undefined,
      reasoningTokens: undefined,
      streaming: true,
      waitingSince: Date.now(),
    } as ChatItem;
    const heights = nodeStyles(renderGroup([tool('bash'), waiting], true))
      .map(style => style.minHeight)
      .filter((value): value is number => typeof value === 'number');
    expect(heights).toContain(spine(1).head);
  });

  it('leaves a row that has nothing to show yet without a dot', () => {
    const dots = (tree: ReactTestRenderer.ReactTestRenderer): number =>
      nodeStyles(tree).filter(style => style.borderRadius !== undefined && style.position === 'absolute' && style.width !== 1).length;
    const thoughtRows = renderGroup([tool('bash'), thought()], true);
    expect(dots(thoughtRows)).toBe(2);

    // A streaming phase with no words yet and no reasoning to report: nothing drawn, no dot.
    const blank = renderGroup(
      [tool('bash'), { ...thought(), reasoning: undefined, reasoningTokens: undefined, streaming: true, waitingSince: Date.now() } as ChatItem],
      true,
    );
    expect(dots(blank)).toBe(1);
  });

  it('shows the header line and every child when open', () => {
    const shown = texts(renderGroup(items, true));
    expect(shown).toContain('3 tool calls');
    expect(shown).toContain('· 1 shell · 1 read · 1 edits');
    for (const item of items) expect(shown).toContain(`child:${item.id}`);
  });

  it('leaves a single tool call to its own row of the column, with no header', () => {
    const tree = renderGroup([tool('bash')], true);
    const shown = texts(tree);
    expect(shown.some(text => text.startsWith('1 tool call'))).toBe(false);
    expect(shown.filter(text => text.startsWith('child:')).length).toBe(1);
    // The same surface as a grouped burst: one dot, no frame -- never a bordered card of its own.
    const dot = nodeStyles(tree).filter(style => style.borderRadius !== undefined && style.position === 'absolute' && style.width !== 1);
    expect(dot).toHaveLength(1);
    // No rail either: a column only ever runs between dots, and there is no second one here.
    expect(nodeStyles(tree).filter(style => style.width === 1)).toHaveLength(0);
  });

  it('draws a dot for each child, and a hollow one for a thought', () => {
    const tree = renderGroup([tool('bash', { ok: false }), thought()], true);
    const dotted = tree.root
      .findAllByType(View)
      .map(node => (Array.isArray(node.props.style) ? node.props.style.flat() : [node.props.style]))
      .filter(style => style.some(s => s !== null && typeof s === 'object' && 'borderRadius' in s && 'width' in s && 'height' in s));
    // One dot per child, both on the same axis.
    expect(dotted.length).toBe(2);
    const lefts = dotted.map(style => style.find(s => s !== null && typeof s === 'object' && 'left' in s)?.left);
    expect(new Set(lefts).size).toBe(1);
  });
});

describe('a run in flight', () => {
  const items = [tool('bash'), tool('read'), tool('bash')];

  it('is drawn open even though nobody opened it', () => {
    const shown = texts(renderGroup(items, false, true));
    for (const item of items) expect(shown).toContain(`child:${item.id}`);
  });

  it('cannot be closed, and offers no hide word', () => {
    const onToggle = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
          <RunGroup items={items} open={false} live onToggle={onToggle} renderItem={item => <Text>{`child:${item.id}`}</Text>} />
        </ThemeContext.Provider>,
      );
    });
    mounted.push(tree);
    const header = tree.root.findAll(
      node => node.props?.accessibilityLabel === 'The run is still going' && typeof node.props.onPress === 'function',
      { deep: true },
    )[0];
    ReactTestRenderer.act(() => header!.props.onPress());
    expect(onToggle).not.toHaveBeenCalled();
    expect(texts(tree)).not.toContain('hide');
  });

  it('carries the run\'s chrono, which no other row has while it runs', () => {
    const shown = texts(renderGroup(items, false, true));
    expect(shown.some(text => text.startsWith('running · '))).toBe(true);
  });
});

describe("a segment's own clock", () => {
  /**
   * No clock under a group, open or folded: the hour belongs to a message, or to a block the reader
   * opened -- a group's is its header's span, and a second figure under it read as a duplicate
   * (owner, 2026-11-08).
   */
  it('draws no clock under a group', () => {
    const ts = new Date(2026, 10, 8, 14, 6).getTime();
    const items = [tool('bash', { ts }), tool('read', { ts: ts + 2_000, durationMs: 1_000 })];
    expect(texts(renderGroup(items, false))).not.toContain('14:06');
    expect(texts(renderGroup(items, true))).not.toContain('14:06');
  });

  // A run is folded one group per burst between the messages it wrote. Every burst used to wear the
  // run's elapsed time and a spinner, so three finished groups read as three runs of twelve minutes
  // (owner, 2026-11-08: "il doit compter pour chaque groupe et se reset a chaque debut d'un autre").
  const segment = [
    tool('bash', { ts: 1_000 }),
    tool('read', { ts: 3_000, durationMs: 2_000 }),
  ];

  it('a finished segment shows its own span, never "running"', () => {
    const shown = texts(renderGroup(segment, false, false));
    expect(shown.some(text => text.startsWith('running'))).toBe(false);
    // 1 s (first call) .. 3 s + 2 s = 4 s of work.
    expect(shown).toContain('4 s');
  });

  /**
   * A segment a message cut is over, even while its run goes on: it folds back to its line and the
   * present stays open (owner, 2026-11-08: the present is open, the past is compact). What it keeps
   * is its own span, and the run's total stays on its foot.
   */
  it('a segment of a live run that a message cut folds back to its line', () => {
    const shown = texts(renderGroup(segment, false, false));
    expect(shown.some(text => text.startsWith('running'))).toBe(false);
    expect(shown).toContain('4 s');
    expect(shown).not.toContain(`child:${segment[0]!.id}`);
  });

  it('opens again on a tap, and stays open for the reader', () => {
    expect(texts(renderGroup(segment, true, false))).toContain(`child:${segment[0]!.id}`);
  });

  it('the segment being written counts from its own first call', () => {
    const shown = texts(renderGroup([tool('bash', { ts: Date.now() - 5_000 })], false, true));
    expect(shown.some(text => /^running · \d+ s$/.test(text))).toBe(true);
  });
});
