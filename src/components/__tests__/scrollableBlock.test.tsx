/**
 * A long block in a conversation is capped and unfolds in place, everywhere. No nested scroll
 * area on any platform: the thread is the scroll area (docs/text-selection.md).
 */

import React from 'react';
import { Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ThemeContext } from '../../theme';
import { lightPalette } from '../../theme/palettes';
import { BLOCK_MAX_HEIGHT, ScrollableBlock } from '../ScrollableBlock';

function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
        <ScrollableBlock title="bash output">
          <Text>body</Text>
        </ScrollableBlock>
      </ThemeContext.Provider>,
    );
  });
  return tree;
}

/** Reports a measured height for the inner content node, the way a real layout pass would. */
function measure(tree: ReactTestRenderer.ReactTestRenderer, height: number) {
  const node = tree.root.findAll(n => typeof n.props.onLayout === 'function', { deep: true })[0]!;
  ReactTestRenderer.act(() => {
    node.props.onLayout({ nativeEvent: { layout: { height, width: 300, x: 0, y: 0 } } });
  });
}

/** The fold bar, whichever way it currently points. */
function foldBar(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findAll(
    n =>
      typeof n.props.accessibilityLabel === 'string' &&
      /(Unfold|Fold) bash output/.test(n.props.accessibilityLabel) &&
      typeof n.props.onPress === 'function',
    { deep: true },
  );
}

/** Whether some view is holding the block down to the cap. */
function clipped(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root
    .findAllByType(View)
    .some(n =>
      [n.props.style]
        .flat(2)
        .some(s => s && s.maxHeight === BLOCK_MAX_HEIGHT && s.overflow === 'hidden'),
    );
}

it('caps the block instead of nesting a scroll area in the thread', () => {
  const tree = render();
  expect(clipped(tree)).toBe(true);
  // Nothing scrollable of its own, on any platform: three nested scroll areas is a trap, and the
  // gesture is disputed with the inverted list on a touchscreen.
  expect(
    tree.root
      .findAllByType(View)
      .some(n => [n.props.style].flat(2).some(s => s && (s.overflow === 'scroll' || s.overflowY))),
  ).toBe(false);
});

it('offers the fold only once the block is actually cut', () => {
  const tree = render();
  measure(tree, BLOCK_MAX_HEIGHT - 40);
  expect(foldBar(tree)).toHaveLength(0);

  measure(tree, BLOCK_MAX_HEIGHT + 400);
  expect(foldBar(tree)).toHaveLength(1);
});

it('unfolds in place rather than sending the reader to another screen', () => {
  const tree = render();
  measure(tree, BLOCK_MAX_HEIGHT + 400);

  const [bar] = foldBar(tree);
  ReactTestRenderer.act(() => bar!.props.onPress());
  // The cap is gone: the rest of the output is on screen, in the card, and the thread scrolls.
  expect(clipped(tree)).toBe(false);
  // Same control, now announcing the way back.
  expect(foldBar(tree)[0]!.props.accessibilityLabel).toBe('Fold bash output');

  ReactTestRenderer.act(() => bar!.props.onPress());
  expect(clipped(tree)).toBe(true);
});
