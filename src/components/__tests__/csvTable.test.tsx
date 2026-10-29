/**
 * A delimited file at the reader's zoom.
 *
 * The table was the one kind the zoom could not reach: its cells are fixed-width columns, so
 * scaling the font alone would have wrapped every cell the reader asked to be bigger
 * (owner, 2026-10-29). The width follows the size.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { CsvTable } from '../CsvTable';

const CSV = 'name,qty\nbolt,12\nnut,40\n';

function cellStyles(scale: number): Array<{ fontSize?: number; width?: number }> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<CsvTable value={CSV} scale={scale} />);
  });
  const cells = tree.root.findAllByType(Text).map(node => [node.props.style].flat(4));
  ReactTestRenderer.act(() => tree.unmount());
  // The table's foot is a Text too, and it is not a cell: only the ones with a column width are.
  // The last width wins -- the base cell style carries one, and the zoom's override sits after it.
  return cells
    .map(styles => styles.filter(style => style && typeof style.width === 'number').pop())
    .filter((style): style is { fontSize?: number; width?: number } => Boolean(style));
}

test('the header and the body cells share one size, and it follows the zoom', () => {
  const atOne = cellStyles(1);
  expect(atOne.length).toBeGreaterThan(0);
  for (const style of atOne) {
    expect(style.fontSize).toBe(11);
    expect(style.width).toBe(132);
  }

  const atTwo = cellStyles(2);
  for (const style of atTwo) {
    expect(style.fontSize).toBe(22);
    // Column width scales with the text: a fixed width would wrap a 200 % cell to three lines.
    expect(style.width).toBe(264);
  }
});

test('no scale given is the plain 100 % table', () => {
  const styles = cellStyles(1);
  expect(new Set(styles.map(style => style.fontSize))).toEqual(new Set([11]));
});
