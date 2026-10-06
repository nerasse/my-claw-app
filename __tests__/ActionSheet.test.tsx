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

describe('a physical keyboard on Android (docs/keyboard.md)', () => {
  const { deviceBridge } = require('../src/core/nativeBridge') as typeof import('../src/core/nativeBridge');
  const bridge = deviceBridge as jest.Mocked<typeof deviceBridge>;

  function render(options: React.ComponentProps<typeof ActionSheet>['options'], search = false): ReactTestRenderer.ReactTestRenderer {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ActionSheet
          options={options}
          search={search ? { value: '', onChange: () => {}, placeholder: 'Search' } : null}
          onClose={() => {}}
        />,
      );
    });
    return tree;
  }
  const row = (tree: ReactTestRenderer.ReactTestRenderer, label: string) =>
    tree.root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');

  // The test renderer has no native views: each node gets a tag of its own, as Android gives one.
  const tags = new WeakMap<object, number>();
  let nextTag = 1;
  const RN = require('react-native') as typeof import('react-native');
  beforeEach(() => {
    bridge.focusIfKeyboard.mockClear();
    bridge.restoreKeyboardFocus.mockClear();
    jest.spyOn(RN, 'findNodeHandle').mockImplementation(node => {
      if (!node || typeof node !== 'object') return null;
      if (!tags.has(node)) tags.set(node, nextTag++);
      return tags.get(node)!;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  test('opening asks for the focus on the option in effect, and closing gives it back', () => {
    const tree = render([
      { label: 'Fast', onPress: () => {} },
      { type: 'separator' },
      { label: 'Strong', selected: true, onPress: () => {} },
    ]);
    expect(bridge.focusIfKeyboard).toHaveBeenCalledTimes(1);
    // The option in effect, not the first row: its tag is the one Strong stays on sideways.
    expect(bridge.focusIfKeyboard).toHaveBeenCalledWith(row(tree, 'Strong').props.nextFocusLeft);
    // Counted from here: a tree an earlier case unmounted outside act() may clean up late.
    bridge.restoreKeyboardFocus.mockClear();
    ReactTestRenderer.act(() => tree.unmount());
    expect(bridge.restoreKeyboardFocus).toHaveBeenCalledTimes(1);
  });

  test('the arrows and Tab go round the ends, and stay on a row sideways', () => {
    const tree = render([
      { label: 'One', onPress: () => {} },
      { type: 'separator' },
      { label: 'Two', onPress: () => {} },
      { label: 'Three', onPress: () => {} },
    ]);
    const one = row(tree, 'One').props;
    const three = row(tree, 'Three').props;
    expect(one.nextFocusUp).toBeDefined();
    expect(three.nextFocusDown).toBe(one.nextFocusLeft);
    expect(three.nextFocusForward).toBe(one.nextFocusLeft);
    expect(one.nextFocusUp).toBe(three.nextFocusRight);
    expect(row(tree, 'Two').props.nextFocusDown).toBeUndefined();
    tree.unmount();
  });

  test('the search field comes first, and is where the focus goes', () => {
    const tree = render([{ label: 'One', onPress: () => {} }], true);
    const field = tree.root.find(node => node.props.accessibilityLabel === 'Search' && node.props.onChangeText);
    expect(field.props.nextFocusUp).toBeDefined();
    expect(field.props.nextFocusUp).toBe(row(tree, 'One').props.nextFocusLeft);
    expect(bridge.focusIfKeyboard).toHaveBeenCalledWith(field.props.nextFocusLeft);
    tree.unmount();
  });

  test("the backdrop is a tap's way out, never a keyboard stop", () => {
    const tree = render([{ label: 'One', onPress: () => {} }]);
    expect(row(tree, 'Close menu').props.focusable).toBe(false);
    tree.unmount();
  });
});
