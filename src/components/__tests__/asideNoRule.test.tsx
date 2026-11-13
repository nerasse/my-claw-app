/**
 * The aside's body carries an inset, not a rule.
 *
 * Inside a run group the rail already draws a vertical right beside this text, and the two read
 * as one doubled line rather than as two meanings (owner, 2026-11-13, screenshot of a reasoning
 * body). Pinned here because the border is one property and nothing else would notice it coming
 * back -- it is invisible to every text assertion.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ThemeContext } from '../../theme';
import { darkPalette } from '../../theme/palettes';
import { CollapsibleAside } from '../CollapsibleAside';
import { resetAsideExpansion } from '../../core/asideExpansion';

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  ReactTestRenderer.act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
  resetAsideExpansion();
});

function open(): ReactTestRenderer.ReactTestRenderer['root'] {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark', themeId: 'sable' }}>
        <CollapsibleAside label="Reasoning" body="a thought" showHint="show" hideHint="hide" defaultOpen />
      </ThemeContext.Provider>,
    );
  });
  mounted.push(tree);
  return tree.root;
}

test('the unfolded body has no left border, only an inset', () => {
  const root = open();
  // Every view carrying the body style: none may declare a left border width.
  const bordered = root.findAll(
    node => typeof node.type === 'string' && node.props.style !== undefined,
  ).filter(node => {
    const flat = ([] as unknown[]).concat(node.props.style).flat(Infinity) as Array<Record<string, unknown> | null | undefined>;
    return flat.some(entry => (typeof entry?.borderLeftWidth === 'number' ? entry.borderLeftWidth : 0) > 0);
  });
  expect(bordered).toHaveLength(0);
});
