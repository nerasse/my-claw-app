import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { useResolvedTheme, useThemedStyles, ThemeContext, type Palette, type Theme } from '../index';
import { darkPalette, lightPalette } from '../palettes';
import { themes } from '../themes';
import type { ThemeId, ThemeMode } from '../themes';

/* eslint-disable @react-native/no-deep-imports -- the color scheme hook can only be mocked at its source module */
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

// The hook is mocked at its RN internal path; grab the same instance the component sees.
const systemScheme = require('react-native/Libraries/Utilities/useColorScheme').default as jest.Mock;

function resolve(mode: ThemeMode, themeId: ThemeId = 'sable'): Theme {
  let captured!: Theme;
  function Probe(): null {
    captured = useResolvedTheme(themeId, mode);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return captured;
}

describe('useResolvedTheme', () => {
  test('follows the phone when the mode is system', () => {
    systemScheme.mockReturnValue('dark');
    expect(resolve('system').dark).toBe(true);
    expect(resolve('system').palette).toBe(darkPalette);

    systemScheme.mockReturnValue('light');
    expect(resolve('system').dark).toBe(false);
    expect(resolve('system').palette).toBe(lightPalette);
  });

  test('an explicit mode overrides the phone', () => {
    systemScheme.mockReturnValue('dark');
    expect(resolve('light').palette).toBe(lightPalette);
    systemScheme.mockReturnValue('light');
    expect(resolve('dark').palette).toBe(darkPalette);
  });

  test('system never resolves to AMOLED: a phone has no idea what its panel is', () => {
    systemScheme.mockReturnValue('dark');
    expect(resolve('system').palette).toBe(themes.sable.dark);
    expect(resolve('system').themeId).toBe('sable');
  });

  test('AMOLED is a dark theme with a black background, and it is only reached on purpose', () => {
    const amoled = resolve('amoled');
    expect(amoled.palette).toBe(themes.sable.amoled);
    expect(amoled.palette.bg).toBe('#000000');
    // The ~40 call sites that branch on lightness mean "is this a dark palette".
    expect(amoled.dark).toBe(true);
  });

  test('a stored theme that no longer exists falls back rather than resolving to nothing', () => {
    expect(resolve('dark', 'charbon' as ThemeId).palette).toBe(themes.charbon.dark);
    expect(resolve('dark', 'nope' as ThemeId).palette).toBe(themes.sable.dark);
  });
});

describe('useThemedStyles', () => {
  const factory = (palette: Palette) => ({ box: { backgroundColor: palette.bg } });

  function stylesFor(theme: Theme): ReturnType<typeof factory> {
    let captured!: ReturnType<typeof factory>;
    function Probe(): null {
      captured = useThemedStyles(factory);
      return null;
    }
    ReactTestRenderer.act(() => {
      ReactTestRenderer.create(
        <ThemeContext.Provider value={theme}>
          <Probe />
        </ThemeContext.Provider>,
      );
    });
    return captured;
  }

  test('reuses the same sheet for a palette and rebuilds for the other one', () => {
    const light: Theme = { palette: lightPalette, dark: false, mode: 'light', themeId: 'sable' };
    const dark: Theme = { palette: darkPalette, dark: true, mode: 'dark', themeId: 'sable' };

    const first = stylesFor(light);
    expect(stylesFor(light)).toBe(first);

    const other = stylesFor(dark);
    expect(other).not.toBe(first);
    expect(stylesFor(dark)).toBe(other);
  });
});
