/**
 * A thought drawn as a line of a run's spine.
 *
 * The row is as tall as a tool's so the group's dot centres on it, and the box that holds the
 * reasoning *once unfolded* keeps growing with its text: a fixed height there drew the opened text
 * straight over the calls below (owner, 2026-11-08: "c'est cassé quand on déplie un reasoning").
 *
 * What is fixed now is the head row -- chevron, label, figures -- at the spine's own height. That
 * is what keeps the chevron on the dot's axis in both states: left to its content, the row measured
 * one line folded and something else open, and the owner saw the arrow drift off the dot the moment
 * he expanded it (2026-11-08).
 */

import React from 'react';
import { View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Bubble } from '../Bubble';
import { spine } from '../spine';
import type { TextItem } from '../../core/chat';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';

const thought: TextItem = {
  kind: 'text',
  id: 'p1',
  role: 'agent',
  text: '',
  attachments: [],
  streaming: false,
  ts: 1,
  reasoning: 'weighing the options at some length, enough to wrap several times over',
};

function render(dense: boolean): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <Bubble
          item={thought}
          mediaBase=""
          deviceInfo={null}
          grouped={false}
          showTime={false}
          onMenu={() => {}}
          expandReasoning={false}
          dense={dense}
        />
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

function styles(tree: ReactTestRenderer.ReactTestRenderer): Record<string, unknown>[] {
  // One object per node, its style array merged: a height and a justification written in two
  // entries of the same array are one statement about one row.
  return tree.root.findAllByType(View).map(node => {
    const raw = Array.isArray(node.props.style) ? node.props.style : [node.props.style];
    const flat = raw.flat(Infinity).filter((style): style is Record<string, unknown> => style !== null && typeof style === 'object');
    return Object.assign({}, ...flat) as Record<string, unknown>;
  });
}

/** The aside's head row: the one row that states its own height *and* spreads its ends apart. */
function heads(tree: ReactTestRenderer.ReactTestRenderer): Record<string, unknown>[] {
  return styles(tree).filter(
    style => typeof style.height === 'number' && style.justifyContent === 'space-between',
  );
}

it('pins a dense thought head to the spine row, so its chevron sits on the dot', () => {
  const found = heads(render(true));
  expect(found.length).toBeGreaterThan(0);
  expect(found[0]!.height).toBe(spine(1).head);
});

it('keeps the box around the unfolded text free to grow', () => {
  // No `minHeight` box wrapping head and body: the fixed height belongs to the head alone, and the
  // text below decides how tall the row is.
  expect(styles(render(true)).some(style => 'minHeight' in style)).toBe(false);
});

it('leaves a free bubble without a fixed head', () => {
  expect(heads(render(false))).toHaveLength(0);
});

/**
 * The static state of the line -- a wait, or a count the endpoint kept its words for -- is a row
 * too, and on a spine the wait was drawn a few points above the dot it belongs to (owner,
 * 2026-11-08: "le wait est pas aligné sur le dot").
 */
it('gives a wait alone the same head height as a folded thought', () => {
  const waited: TextItem = {
    kind: 'text',
    id: 'p2',
    role: 'agent',
    text: '',
    attachments: [],
    streaming: true,
    ts: 1,
    waitMs: 4_200,
  };
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' }}>
        <Bubble item={waited} mediaBase="" deviceInfo={null} grouped={false} showTime={false} onMenu={() => {}} dense />
      </ThemeContext.Provider>,
    );
  });
  const rows = styles(tree).filter(style => typeof style.height === 'number');
  expect(rows.map(style => style.height)).toContain(spine(1).head);
});
