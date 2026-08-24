/**
 * A tool output must not be allowed to take the whole thread, and no block may throw the
 * inverted chat list by nesting a ScrollView in it. Two behaviours, one per platform, and both
 * keep the full text reachable.
 */

import React from 'react';
import { Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { ThemeContext } from '../../theme';
import { TextSelectionContext } from '../../core/textSelection';
import { lightPalette } from '../../theme/palettes';

let mockScroll = false;
jest.mock('../../core/platform', () => ({
  get blockScrollSupported() {
    return mockScroll;
  },
}));

import { BLOCK_MAX_HEIGHT, ScrollableBlock } from '../ScrollableBlock';

function render(openSelection = jest.fn()) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: lightPalette, dark: false, mode: 'light' }}>
        <TextSelectionContext.Provider value={openSelection}>
          <ScrollableBlock title="bash output" value={'line 1\nline 2'}>
            <Text>body</Text>
          </ScrollableBlock>
        </TextSelectionContext.Provider>
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

function seeAll(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findAll(
    n => n.props.accessibilityLabel === 'Open bash output in full' && typeof n.props.onPress === 'function',
    { deep: true },
  );
}

/**
 * The web block caps its height and leaves the axis to CSS (webTheme.web.ts): a React Native
 * `overflow: 'scroll'` means both axes and two permanent bars, so `undefined` is the wanted
 * value there, not an oversight.
 */
function capped(tree: ReactTestRenderer.ReactTestRenderer, overflow: 'hidden' | undefined) {
  return tree.root
    .findAllByType(View)
    .some(n => [n.props.style].flat(2).some(s => s && s.maxHeight === BLOCK_MAX_HEIGHT && s.overflow === overflow));
}

describe('on a touchscreen', () => {
  beforeEach(() => {
    mockScroll = false;
  });

  it('clips the block instead of nesting a scroll view in the thread', () => {
    const tree = render();
    expect(capped(tree, 'hidden')).toBe(true);
  });

  it('offers the full text only once the block is actually cut', () => {
    const open = jest.fn();
    const tree = render(open);
    measure(tree, BLOCK_MAX_HEIGHT - 40);
    expect(seeAll(tree)).toHaveLength(0);

    measure(tree, BLOCK_MAX_HEIGHT + 400);
    const [button] = seeAll(tree);
    expect(button).toBeDefined();
    ReactTestRenderer.act(() => button!.props.onPress());
    // The whole value, not what was on screen.
    expect(open).toHaveBeenCalledWith({ title: 'bash output', body: 'line 1\nline 2' });
  });
});

describe('in a browser', () => {
  beforeEach(() => {
    mockScroll = true;
  });

  it('gives the block a real scrollbar and no button', () => {
    const tree = render();
    expect(capped(tree, undefined)).toBe(true);
    expect(capped(tree, 'hidden')).toBe(false);
    expect(seeAll(tree)).toHaveLength(0);
  });
});
