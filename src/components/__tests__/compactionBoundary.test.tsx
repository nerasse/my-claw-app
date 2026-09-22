/**
 * Two things the replayed boundary owes the reader (2026-09-12).
 *
 * The fold: the live rule moves between the list header and a row of the list depending on whether
 * a send is parked behind the compaction, and every move is a new instance -- the expansion lived
 * in the component and folded itself back under the owner while he was reading it.
 *
 * The span: the duration was only ever on the live counter, so a thread opened later showed a
 * boundary with no sign of how long it took. It now rides the rule itself -- the one line every
 * boundary draws, summary folded shut or not -- in the span format the whole thread shares.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import { CompactionBoundary } from '../CompactionBoundary';
import { resetAsideExpansion } from '../../core/asideExpansion';
import type { TextItem } from '../../core/chat';

beforeEach(() => {
  resetAsideExpansion();
});

const item = (over: Partial<TextItem> = {}): TextItem => ({
  kind: 'text',
  id: 'c1',
  role: 'user',
  attachments: [],
  text: 'Prior work: we fixed the runner.',
  streaming: false,
  summaryOf: 12,
  ts: 1,
  ...over,
});

function mount(props: { item: TextItem }): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark' }}>
        <CompactionBoundary {...props} />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

function texts(tree: ReactTestRenderer.ReactTestRenderer): string {
  const collect = (value: unknown): string =>
    typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : Array.isArray(value)
        ? value.map(collect).join('')
        : '';
  return tree.root.findAll(n => n.type === Text).map(n => collect(n.props.children)).join(' | ');
}

test('the rule says how many turns the summary stands for', () => {
  expect(texts(mount({ item: item() }))).toContain('12 turns summarized');
});

test('the span rides the rule itself, where a folded summary cannot hide it', () => {
  expect(texts(mount({ item: item({ compactionMs: 84_500 }) }))).toContain(
    'Context compacted · 12 turns summarized · 1 min 25 s',
  );
});

test('a boundary nobody timed draws no span, rather than a zero', () => {
  // Older boundaries predate the measurement: nothing is drawn, never a misleading "0 s".
  expect(texts(mount({ item: item() }))).not.toContain('0 s');
});

test('the summary stays open when the cell is unmounted and rebuilt', () => {
  const toggle = (tree: ReactTestRenderer.ReactTestRenderer): void => {
    const button = tree.root.findAll(n => n.props.accessibilityRole === 'button')[0]!;
    ReactTestRenderer.act(() => {
      button.props.onPress();
    });
  };

  const first = mount({ item: item() });
  expect(texts(first)).not.toContain('Prior work');
  toggle(first);
  expect(texts(first)).toContain('Prior work');

  // The rebuild: a fresh instance of the same item, exactly what a move between the list header and
  // a row produces.
  const rebuilt = mount({ item: item() });
  expect(texts(rebuilt)).toContain('Prior work');
});

/**
 * The boundary's stopped sibling (2026-09-14).
 *
 * A compaction the owner aborted left nothing behind before this: the boundary was written only
 * when the summary landed, so minutes of work vanished without a trace. The server now writes a
 * `compaction_stopped` entry, replayed as this rule: same shape, same count of turns, and "kept"
 * where a summary landed -- because nothing was folded, and every turn it names is still there.
 */
test('a stopped compaction is a rule too, and says how many turns it kept', () => {
  const tree = mount({ item: item({ compactionStopped: true, text: '' }) });

  expect(texts(tree)).toContain('Compaction stopped · 12 turns kept');
  expect(texts(tree)).not.toContain('Context compacted');
});

test('a stopped compaction says how long it ran, on the same rule', () => {
  // The counter was the summary's companion; a stopped pass has no summary, so it had nothing at
  // all. The rule is where both now say it.
  const tree = mount({ item: item({ compactionStopped: true, text: '', compactionMs: 12_400 }) });

  expect(texts(tree)).toContain('Compaction stopped · 12 turns kept · 12 s');
});

test('a stopped compaction offers no aside: there is no summary to fold', () => {
  const tree = mount({ item: item({ compactionStopped: true, text: '' }) });

  expect(texts(tree)).not.toContain('Show what the compaction kept');
  expect(texts(tree)).not.toContain('Summary');
});
