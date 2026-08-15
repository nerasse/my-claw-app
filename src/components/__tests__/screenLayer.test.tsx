import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import { ScreenLayer } from '../ScreenLayer';
import { darkPalette } from '../../theme/palettes';
import { ThemeContext } from '../../theme';

/**
 * Guards the two things the shell's container used to do for a screen, and stops doing the
 * moment that screen is shown as a layer: paint the stage, and keep the first row clear of the
 * status bar. Both were missing on the nested AGENTS.md editor over the Instructions page, which
 * is why two headers were stacked and one of them sat under the clock.
 */
const TOP = 40;

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context/jest/mock').default;
  return { ...actual, useSafeAreaInsets: () => ({ top: TOP, bottom: 16, left: 0, right: 0 }) };
});

function stageStyle(): Record<string, number | string | undefined> {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeContext.Provider value={{ palette: darkPalette, dark: true, mode: 'dark' }}>
        <ScreenLayer>
          <Text>the editor</Text>
        </ScreenLayer>
      </ThemeContext.Provider>,
    );
  });
  const root = tree.root.findAll(node => String(node.type) === 'View')[0]!;
  const style = (StyleSheet.flatten(root.props.style as never) ?? {}) as Record<string, number | string | undefined>;
  ReactTestRenderer.act(() => tree.unmount());
  return style;
}

test('a layered screen paints its own stage instead of showing the page under it', () => {
  expect(stageStyle().backgroundColor).toBe(darkPalette.bg);
});

test('a layered screen pays the top inset itself, because it spans the whole window', () => {
  const style = stageStyle();
  expect(style.position).toBe('absolute');
  expect(Number(style.paddingTop)).toBeGreaterThan(TOP);
  // And it keeps the shell's own gutters, so a screen looks the same on either side of the door.
  expect(style.paddingHorizontal).toBeDefined();
});
