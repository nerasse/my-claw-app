import { createContext, useCallback, useContext, useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { lightPalette, type Palette } from './palettes';
import { DEFAULT_THEME_ID, resolveTheme, type ThemeId, type ThemeMode } from './themes';
import type { CustomTheme } from './customPalette';

export { space, radius, font, DRAWER_WIDTH, lineHeightFor, lineBoxFor } from './palettes';
export type { Palette } from './palettes';
export {
  DEFAULT_THEME_ID,
  isThemeId,
  resolveTheme,
  themeIds,
  themeModes,
  themes,
  type PaletteSet,
  type ThemeId,
  type ThemeMode,
} from './themes';

export interface Theme {
  palette: Palette;
  dark: boolean;
  mode: ThemeMode;
  themeId: ThemeId;
}

const defaultTheme: Theme = { palette: lightPalette, dark: false, mode: 'system', themeId: DEFAULT_THEME_ID };

export const ThemeContext = createContext<Theme>(defaultTheme);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * User-facing scale for the thread typography (messages, tools, reasoning). 1 = the design size;
 * 1.2 reads 20% larger. Owned by the prefs bag and applied through a dedicated context so the
 * chat tree re-renders without repainting the whole app.
 */
export type ChatFontScale = number;

export const ChatFontScaleContext = createContext<ChatFontScale>(1);

export function useChatFontScale(): ChatFontScale {
  return useContext(ChatFontScaleContext);
}

/**
 * Derives the scaled font from a design constant. Kept here so every component draws its chat
 * text through one function: the scale then moves every size, including the ones computed from
 * `font.body` (an aside at `font.small`, code at `size - 2`, headings at `size + 4`).
 */
export function scaleFont(size: number, scale: number): number {
  return Math.round(size * scale);
}

/** Resolves the stored theme and mode against the phone setting. */
export function useResolvedTheme(themeId: ThemeId, mode: ThemeMode, custom?: CustomTheme): Theme {
  const system = useColorScheme();
  return useMemo(() => resolveTheme(themeId, mode, system, custom), [themeId, mode, system, custom]);
}

type StyleFactory<T> = (palette: Palette, dark: boolean, scale: number) => T;

// StyleSheet.create is not free: cache one sheet per (factory, palette, scale) so a theme or
// font-scale change rebuilds the styles once instead of on every render.
const cache = new WeakMap<StyleFactory<unknown>, Map<Palette, Map<number, unknown>>>();

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: StyleFactory<T>): T {
  const { palette, dark } = useTheme();
  const scale = useChatFontScale();
  const build = useCallback(() => {
    let perPalette = cache.get(factory as StyleFactory<unknown>);
    if (!perPalette) {
      perPalette = new Map();
      cache.set(factory as StyleFactory<unknown>, perPalette);
    }
    let perScale = perPalette.get(palette);
    if (!perScale) {
      perScale = new Map();
      perPalette.set(palette, perScale);
    }
    const hit = perScale.get(scale);
    if (hit) return hit as T;
    const created = StyleSheet.create(factory(palette, dark, scale));
    perScale.set(scale, created);
    return created;
  }, [factory, palette, dark, scale]);
  return build();
}
