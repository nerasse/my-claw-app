import { createContext, useCallback, useContext, useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { darkPalette, lightPalette, type Palette } from './palettes';
import type { ThemeMode } from '../core/prefs';

export { space, radius, font, DRAWER_WIDTH, lineHeightFor } from './palettes';
export type { Palette } from './palettes';

export interface Theme {
  palette: Palette;
  dark: boolean;
  mode: ThemeMode;
}

const defaultTheme: Theme = { palette: lightPalette, dark: false, mode: 'system' };

export const ThemeContext = createContext<Theme>(defaultTheme);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Resolves the requested mode against the phone setting. */
export function useResolvedTheme(mode: ThemeMode): Theme {
  const system = useColorScheme();
  return useMemo(() => {
    const dark = mode === 'system' ? system === 'dark' : mode === 'dark';
    return { palette: dark ? darkPalette : lightPalette, dark, mode };
  }, [mode, system]);
}

type StyleFactory<T> = (palette: Palette, dark: boolean) => T;

// StyleSheet.create is not free: cache one sheet per (factory, palette) so a theme switch
// rebuilds the styles once instead of on every render.
const cache = new WeakMap<StyleFactory<unknown>, Map<Palette, unknown>>();

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: StyleFactory<T>): T {
  const { palette, dark } = useTheme();
  const build = useCallback(() => {
    let perPalette = cache.get(factory as StyleFactory<unknown>);
    if (!perPalette) {
      perPalette = new Map();
      cache.set(factory as StyleFactory<unknown>, perPalette);
    }
    const hit = perPalette.get(palette);
    if (hit) return hit as T;
    const created = StyleSheet.create(factory(palette, dark));
    perPalette.set(palette, created);
    return created;
  }, [factory, palette, dark]);
  return build();
}
