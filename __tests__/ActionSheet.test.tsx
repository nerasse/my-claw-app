/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ActionSheet } from '../src/components/ActionSheet';

function renderSheet(): ReactTestRenderer.ReactTestRenderer {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ActionSheet
        options={[
          { label: 'Session files', onPress: () => {} },
          { type: 'separator' },
          { label: 'Rename…', onPress: () => {} },
          { label: 'Delete', danger: true, onPress: () => {} },
        ]}
        onClose={() => {}}
      />,
    );
  });
  return tree;
}

test('a separator is not a pressable row, so it can never act as an option', () => {
  const tree = renderSheet();
  const rows = tree.root.findAll(
    node => typeof node.props.accessibilityLabel === 'string' && typeof node.props.onPress === 'function',
    { deep: true },
  );
  // Excluding the backdrop's own close control, which is a pressable by design.
  expect(rows.filter(node => node.props.accessibilityLabel !== 'Close menu').map(node => node.props.accessibilityLabel)).toEqual([
    'Session files',
    'Rename…',
    'Delete',
  ]);
  expect(tree.root.findAll(node => typeof node.props.accessibilityLabel === 'string', { deep: true })).not.toContain('separator');
  tree.unmount();
});
