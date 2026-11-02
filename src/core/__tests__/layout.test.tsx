import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, useWindowDimensions } from 'react-native';
import { PAGE_WIDTH, READING_WIDTH, TOOL_WIDTH, useLayout, type Layout } from '../layout';

/**
 * The breakpoint ladder. Keyed on the window and not on the platform, so a tablet in landscape
 * and a browser dragged narrow both get the layout that fits rather than the one their OS
 * suggests.
 */

jest.mock('react-native/Libraries/Utilities/useWindowDimensions');

function layoutAt(width: number): Layout {
  (useWindowDimensions as jest.Mock).mockReturnValue({ width, height: 900, scale: 2, fontScale: 1 });
  let seen!: Layout;
  function Probe(): React.JSX.Element {
    seen = useLayout();
    return <Text>probe</Text>;
  }
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<Probe />);
  });
  ReactTestRenderer.act(() => tree.unmount());
  return seen;
}

test('a phone keeps the layout the app was written for', () => {
  const layout = layoutAt(412);
  expect(layout.breakpoint).toBe('phone');
  // The conversation list stays behind the hamburger: pinned, it would leave 124pt of chat.
  expect(layout.pinnedDrawer).toBe(false);
  expect(layout.dialogs).toBe(false);
  expect(layout.sidePane).toBe(false);
});

test('a tablet is still one column, because a pinned list would eat half of it', () => {
  expect(layoutAt(800).breakpoint).toBe('tablet');
  expect(layoutAt(800).pinnedDrawer).toBe(false);
});

test('a desktop pins the list and centres its menus', () => {
  const layout = layoutAt(1280);
  expect(layout.breakpoint).toBe('desktop');
  expect(layout.pinnedDrawer).toBe(true);
  expect(layout.dialogs).toBe(true);
  // 1280 - 288 of list - 460 of pane would leave a 532pt conversation: not yet.
  expect(layout.sidePane).toBe(false);
});

test('a wide desktop opens a page beside the conversation instead of over it', () => {
  expect(layoutAt(1600).sidePane).toBe(true);
});

test('a conversation never widens past a readable line, and never past the pane', () => {
  expect(layoutAt(3840).readingWidth).toBe(READING_WIDTH);
  // A 412 pt phone is narrower than the measure: the column is the window there.
  expect(layoutAt(412).readingWidth).toBe(412);
});

test('a card and a bubble share one column: a row starts where the row above started', () => {
  const wide = layoutAt(3840);
  expect(wide.toolWidth).toBe(wide.readingWidth);
  expect(wide.toolWidth).toBe(TOOL_WIDTH);
  // Settings pages are a different shape: two ends of a row, not a sentence.
  expect(PAGE_WIDTH).toBeLessThan(TOOL_WIDTH);
});

test('on a phone the tool column is the window, never wider than the pane', () => {
  expect(layoutAt(412).toolWidth).toBe(412);
});
