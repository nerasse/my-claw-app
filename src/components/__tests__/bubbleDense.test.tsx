/**
 * A thought drawn as a line of a run's spine.
 *
 * The row is as tall as a tool's so the group's dot centres on it, but the same box holds the
 * reasoning once unfolded. A fixed height there drew the opened text straight over the calls
 * below (owner, 2026-11-08: "c'est cassé quand on déplie un reasoning").
 */

import React from 'react';
import { View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Bubble } from '../Bubble';
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
  return tree.root
    .findAllByType(View)
    .map(node => (Array.isArray(node.props.style) ? node.props.style : [node.props.style]))
    .flat(Infinity)
    .filter((style): style is Record<string, unknown> => style !== null && typeof style === 'object');
}

it('gives a dense thought a minimum height, never a fixed one', () => {
  const box = styles(render(true)).find(style => 'minHeight' in style);
  expect(box).toBeDefined();
  expect(box).not.toHaveProperty('height');
});

it('leaves a free bubble exactly as it was', () => {
  expect(styles(render(false)).some(style => 'minHeight' in style)).toBe(false);
});
