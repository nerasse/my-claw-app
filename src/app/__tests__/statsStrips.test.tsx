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
import { ScrollView } from 'react-native';
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

function payload(): StatsPayload {
  return {
    period: '30d',
    rollupIncluded: false,
    totals: NOTHING,
    models: [],
    providers: [],
    sessions: [],
    daily: [],
    reliability: [],
    callers: [],
    reconciliation: [],
    cache: { promptTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, readSharePct: 0, writeSharePct: 0 },
    filter: {},
    facets: { models: [], providers: [], callers: [], sessions: [] },
  };
}

function render(): ReactTestRenderer.ReactTestRenderer {
  ReactTestRenderer.act(() => statsStore.open('30d'));
  ReactTestRenderer.act(() => {
    statsStore.receive({ type: 'stats.result', stats: payload() });
  });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<StatsScreen onClose={() => {}} />);
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
