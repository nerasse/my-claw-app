/**
 * The two rows of chips and tabs on the statistics page.
 *
 * They are horizontal ScrollViews, and React Native's own base style gives every ScrollView
 * `flexGrow: 1, flexShrink: 1`. Inside the page's column, that made the rows flex items of the
 * page: the tall vertical list under them took the free space and pushed them below their own
 * content, so the bottom of every label came out cut. The owner reported it as "les filtres et
 * boutons sont mangés dans la page statistique" on 2026-09-15.
 *
 * A layout bug of this kind has no string to assert on, so what is pinned is the one thing the
 * flexbox arithmetic depends on: the rows own their height.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ScrollView, Text } from 'react-native';
import { StatsScreen } from '../StatsScreen';
import { statsStore } from '../../core/stats';
import type { StatsPayload, StatsTotals } from '../../core/protocol';

const NOTHING: StatsTotals = {
  calls: 0,
  errors: 0,
  promptTokens: 0,
  completionTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  billedUsd: 0,
  referenceUsd: 0,
  unpriced: 0,
  durationMs: 0,
};

function payload(over: Partial<StatsTotals> = {}, callers: StatsPayload['callers'] = []): StatsPayload {
  return {
    period: '30d',
    rollupIncluded: false,
    totals: { ...NOTHING, ...over },
    models: [],
    providers: [],
    sessions: [],
    daily: [],
    reliability: [],
    callers,
    reconciliation: [],
    cache: { promptTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, readSharePct: 0, writeSharePct: 0 },
    filter: {},
    facets: { models: [], providers: [], callers: [], sessions: [], workspaces: [], folders: [] },
  };
}

/**
 * The screen asks the server on every opening, so the answer has to land after it mounted: a
 * payload delivered first is thrown away by the `open()` of the mount, and the page stays on
 * "asking the server…" -- which is what the first version of the hero test read.
 */
function render(over: Partial<StatsTotals> = {}, callers: StatsPayload['callers'] = []): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<StatsScreen onClose={() => {}} />);
  });
  ReactTestRenderer.act(() => {
    statsStore.receive({ type: 'stats.result', stats: payload(over, callers) });
  });
  return tree;
}

afterEach(() => {
  ReactTestRenderer.act(() => statsStore.reset());
});

test('the filter and tab rows take the height of their content, never the page\u2019s', () => {
  const tree = render();

  const strips = tree.root.findAllByType(ScrollView).filter(node => node.props.horizontal === true);
  expect(strips.length).toBe(2);
  for (const strip of strips) {
    expect(strip.props.style).toMatchObject({ flexGrow: 0, flexShrink: 0 });
  }
});

test('the hero draws the consumption beside the price, in the same type', () => {
  const tree = render({ calls: 10, promptTokens: 900_000_000, completionTokens: 120_000_000, billedUsd: 12, referenceUsd: 3 });
  const words = tree.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().join(''))
    .join('|');

  expect(words).toContain('$15.00');
  expect(words).toContain('1.0B');
  expect(words).toContain('tokens');
  // The same size as the money: two figures of the page, not a figure and its note.
  const sizes = tree.root
    .findAllByType(Text)
    .filter(node => [node.props.children].flat().join('').includes('15.00') || [node.props.children].flat().join('') === '1.0B')
    .map(node => (Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style).fontSize);
  expect(sizes).toEqual([28, 28]);
});

test('the overview has a compaction card under the total when the window compacted, and none otherwise', () => {
  const words = (tree: ReactTestRenderer.ReactTestRenderer) =>
    tree.root.findAllByType(Text).map(node => [node.props.children].flat().join('')).join('|');
  const compacted = render({ calls: 10, promptTokens: 1_000_000, completionTokens: 100_000, billedUsd: 10 }, [
    { caller: 'agent', ...NOTHING, calls: 8, promptTokens: 600_000, completionTokens: 40_000, billedUsd: 4 },
    { caller: 'compaction', ...NOTHING, calls: 2, promptTokens: 400_000, completionTokens: 60_000, billedUsd: 6 },
  ]);
  const text = words(compacted);
  expect(text).toContain('compaction');
  expect(text).toContain('2 passes');
  expect(text).toContain('60% of the cost · 42% of the tokens');
  ReactTestRenderer.act(() => compacted.unmount());

  const quiet = render({ calls: 10, promptTokens: 1_000, billedUsd: 1 }, [{ caller: 'agent', ...NOTHING, calls: 10 }]);
  expect(words(quiet)).not.toContain('passes');
});
