import type { Palette } from './palettes';
import { deriveSet } from './derive';
import { DEFAULT_THEME_ID, type PaletteSet } from './themes';
import { paletteSources, type PaletteSource } from './themes.generated';

/**
 * A theme the owner writes himself.
 *
 * Two seeds, light and dark, of ten colours each: everything else -- the three elevations, the
 * two greys, the bubble, the code plate, the diff washes, AMOLED -- is arithmetic, the same
 * arithmetic the ten committed themes go through. That is the point: a custom theme cannot be
 * *worse* than a generated one, because it is one.
 *
 * Deliberately not thirty editable fields. `bubbleUserBg` and `textMeta` are not taste, they are
 * contrast the generator guarantees; a form that let them be typed would let the app ship a theme
 * where a timestamp is unreadable or a chip disappears inside a bubble, and the guarantee would
 * have to be re-established by hand at every edit.
 */
export interface CustomTheme {
  light: Partial<PaletteSource>;
  dark: Partial<PaletteSource>;
}

export const EMPTY_CUSTOM: CustomTheme = { light: {}, dark: {} };

/** What the editor offers, in the order a theme is easiest to reason about. */
export const SOURCE_FIELDS: Array<{ key: keyof PaletteSource; label: string }> = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'line', label: 'Hairline' },
  { key: 'ink', label: 'Text' },
  { key: 'muted', label: 'Muted text' },
  { key: 'faint', label: 'Faint text' },
  { key: 'accent', label: 'Accent' },
  { key: 'ok', label: 'Success' },
  { key: 'warn', label: 'Warning' },
  { key: 'danger', label: 'Danger' },
];

export function hasCustom(custom: CustomTheme | undefined): boolean {
  if (!custom) return false;
  return Object.keys(custom.light).length > 0 || Object.keys(custom.dark).length > 0;
}

/** The seeds fill in from Sable, so a half-written custom theme is still a whole palette. */
function seedsOf(custom: CustomTheme | undefined): { light: PaletteSource; dark: PaletteSource } {
  const base = paletteSources[DEFAULT_THEME_ID as keyof typeof paletteSources];
  return {
    light: { ...base.light, ...custom?.light },
    dark: { ...base.dark, ...custom?.dark },
  };
}

/**
 * The memo is what keeps `useThemedStyles` from rebuilding every StyleSheet in the app.
 *
 * That cache is keyed on palette *identity*, so a palette built in a render body is a new object
 * every time and a full `StyleSheet.create` per frame. Keyed on the overrides themselves, and
 * bounded: an editing session touches light and dark, and the fourth entry is one undo. An
 * unbounded map is a leak that only shows up after an hour of fiddling.
 */
const MEMO_LIMIT = 4;
const memo = new Map<string, PaletteSet>();

export function customPaletteSet(custom: CustomTheme | undefined): PaletteSet {
  const key = JSON.stringify(custom ?? EMPTY_CUSTOM);
  const hit = memo.get(key);
  if (hit) return hit;

  const derived = deriveSet(seedsOf(custom));
  const set: PaletteSet = {
    label: 'Custom',
    source: 'your own colours',
    ...derived,
  };
  memo.set(key, set);
  if (memo.size > MEMO_LIMIT) {
    const oldest = memo.keys().next();
    if (!oldest.done) memo.delete(oldest.value);
  }
  return set;
}

/** The seeds of the named theme, as the starting point of a custom one. */
export function duplicateSeeds(themeId: string): CustomTheme {
  const chosen = themeId in paletteSources ? (themeId as keyof typeof paletteSources) : DEFAULT_THEME_ID;
  const seeds = paletteSources[chosen as keyof typeof paletteSources];
  return { light: { ...seeds.light }, dark: { ...seeds.dark } };
}

/** One mode of the custom theme, for the editor's live preview and its contrast readings. */
export function customPalette(custom: CustomTheme | undefined, mode: 'light' | 'dark' | 'amoled'): Palette {
  return customPaletteSet(custom)[mode];
}

/** A hex the input can hand us, or null. `#abc` expands; everything is stored lowercase. */
export function parseHex(raw: string): string | null {
  const value = raw.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(value)) {
    return `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`;
  }
  return /^[0-9a-f]{6}$/.test(value) ? `#${value}` : null;
}
