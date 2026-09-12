/**
 * Two things the replayed boundary owes the reader (2026-09-12).
 *
 * The fold: the live rule moves between the list header and a row of the list depending on whether
 * a send is parked behind the compaction, and every move is a new instance -- the expansion lived
 * in the component and folded itself back under the owner while he was reading it.
 *
 * The span: the duration was only ever on the live counter, so a thread opened later showed a
 * boundary with no sign of how long it took. Same gap the thinking duration had.
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

test('the span is drawn beside the summary, with the two decimals the thinking spans use', () => {
  expect(texts(mount({ item: item({ compactionMs: 84_500 }) }))).toContain('1m 24.50s');
});

test('a boundary nobody timed draws no span, rather than a zero', () => {
  expect(texts(mount({ item: item() }))).not.toContain('0.00s');
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
