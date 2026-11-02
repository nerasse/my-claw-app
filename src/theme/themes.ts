import { customPaletteSet, hasCustom, type CustomTheme } from './customPalette';
import { generatedThemes, type GeneratedPaletteSet, type GeneratedThemeId } from './themes.generated';

/**
 * The palettes, by name -- and one that has no name.
 *
 * `themes` holds the ten committed ones and nothing else. A custom palette is built from prefs
 * and memoised in `customPalette.ts`, because a table entry that changes with the prefs would be
 * a different kind of object from its nine neighbours, and `useThemedStyles` caches a StyleSheet
 * per palette *identity*: everything reachable from this file has to be a module constant.
 */
export type ThemeId = GeneratedThemeId | 'custom';

export type PaletteSet = GeneratedPaletteSet;

export const themes: Record<GeneratedThemeId, PaletteSet> = generatedThemes;

/** Sable: the app's own theme, and the default of a fresh install. */
export const DEFAULT_THEME_ID: ThemeId = 'sable';

/** The ten written themes, in the order the picker shows them. Custom is appended there. */
export const themeIds: GeneratedThemeId[] = Object.keys(generatedThemes) as GeneratedThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return value === 'custom' || (typeof value === 'string' && value in generatedThemes);
}

/** The set a theme id draws, or undefined when `custom` has nothing written yet. */
export function resolvePaletteSet(themeId: ThemeId, custom: CustomTheme | undefined): PaletteSet | undefined {
  if (themeId === 'custom') return hasCustom(custom) ? customPaletteSet(custom) : undefined;
  return themes[themeId as GeneratedThemeId];
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
  custom?: CustomTheme,
): { palette: PaletteSet['light']; dark: boolean; mode: ThemeMode; themeId: ThemeId } {
  // A custom theme with nothing written is not a half-built palette: it resolves to the default,
  // which is what an owner who cleared it (or a failed migration) expects to see.
  const resolvedId: ThemeId = resolvePaletteSet(themeId, custom) ? themeId : DEFAULT_THEME_ID;
  const set = resolvePaletteSet(resolvedId, custom) ?? themes[DEFAULT_THEME_ID as GeneratedThemeId];
  const resolved: 'light' | 'dark' | 'amoled' =
    mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  return {
    palette: set[resolved],
    dark: resolved !== 'light',
    mode,
    themeId: resolvedId,
  };
}
