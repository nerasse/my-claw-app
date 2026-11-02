import { generatedThemes, type GeneratedPaletteSet, type GeneratedThemeId } from './themes.generated';

/**
 * The palettes, by name.
 *
 * There is no `custom` entry: a hand-picked palette is built from prefs and memoised elsewhere,
 * and putting it in this table would make one of its rows a different kind of object from the
 * other ten. `useThemedStyles` caches one StyleSheet per palette *identity*, so every palette
 * reachable from here has to be a module constant.
 */
export type ThemeId = GeneratedThemeId;

export type PaletteSet = GeneratedPaletteSet;

export const themes: Record<ThemeId, PaletteSet> = generatedThemes;

/** Sable: the app's own theme, and the default of a fresh install. */
export const DEFAULT_THEME_ID: ThemeId = 'sable';

export const themeIds: ThemeId[] = Object.keys(generatedThemes) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && value in generatedThemes;
}

/**
 * `system` is a rule, not a palette; `amoled` is a compromise, not a darker dark.
 *
 * `dark` stays a boolean for the places that only branch on lightness -- it is true for both
 * `dark` and `amoled`, which is what those call sites mean by it.
 */
export type ThemeMode = 'system' | 'light' | 'dark' | 'amoled';

export const themeModes: Array<{ mode: ThemeMode; label: string }> = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'amoled', label: 'AMOLED' },
];

/**
 * Resolves a stored choice into the palette actually drawn.
 *
 * `amoled` is never reached from `system`: the phone reports light or dark and has no idea what
 * its panel is, so a black theme following "system" would appear for an owner who never asked
 * for one.
 */
export function resolveTheme(
  themeId: ThemeId,
  mode: ThemeMode,
  system: string | null | undefined,
): { palette: PaletteSet['light']; dark: boolean; mode: ThemeMode; themeId: ThemeId } {
  const set = themes[themeId] ?? themes[DEFAULT_THEME_ID];
  const resolved: 'light' | 'dark' | 'amoled' =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  return {
    palette: set[resolved],
    dark: resolved !== 'light',
    mode,
    themeId: themeId in themes ? themeId : DEFAULT_THEME_ID,
  };
}
