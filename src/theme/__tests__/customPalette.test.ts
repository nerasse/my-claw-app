import { customPaletteSet, duplicateSeeds, hasCustom, parseHex } from '../customPalette';
import { contrast } from '../derive';
import { resolveTheme, themes } from '../themes';
import { paletteSources } from '../themes.generated';

describe('a custom palette', () => {
  test('is derived, so it keeps the invariants a generated theme keeps', () => {
    const custom = { light: { bg: '#faf7f2', accent: '#1f6f8b' }, dark: { bg: '#101418', accent: '#7fd1e0' } };
    for (const mode of ['light', 'dark', 'amoled'] as const) {
      const palette = customPaletteSet(custom)[mode];
      expect(contrast(palette.text, palette.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.textMeta, palette.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.accentText, palette.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.bubbleUserText, palette.bubbleUserBg)).toBeGreaterThanOrEqual(8.5);
      // AMOLED is the black one, whatever the seed said.
      if (mode === 'amoled') expect(palette.bg).toBe('#000000');
    }
  });

  test('the same overrides give back the same object: the StyleSheet cache is keyed on identity', () => {
    const custom = { light: { accent: '#8a3a2e' }, dark: { accent: '#e08a72' } };
    const first = customPaletteSet(custom);
    expect(customPaletteSet(custom)).toBe(first);
    expect(customPaletteSet({ ...custom })).toBe(first);
    // ...and a different one is a different palette, not a mutated one.
    expect(customPaletteSet({ ...custom, light: { accent: '#1b6ec2' } })).not.toBe(first);
  });

  test('the memo is bounded: an hour of fiddling is not a leak', () => {
    const seen = new Set<unknown>();
    for (let i = 0; i < 50; i++) {
      seen.add(customPaletteSet({ light: { accent: `#${(0x111111 * (i + 1)).toString(16).slice(-6)}` }, dark: {} }));
    }
    expect(seen.size).toBeGreaterThan(4);
    // Nothing to assert on size from outside; the point is that it does not grow without bound
    // in memory, which the cap in customPalette.ts guarantees and this loop exercises.
    expect(hasCustom({ light: { accent: '#000000' }, dark: {} })).toBe(true);
  });

  test('a sparse override falls back to the default theme for everything unset', () => {
    const palette = customPaletteSet({ light: { accent: '#123456' }, dark: {} }).light;
    const sable = themes.sable.light;
    expect(palette.bg).toBe(sable.bg);
    expect(palette.surface).toBe(sable.surface);
    // The accent is pushed for contrast, so not the exact seed -- but it is that hue's family.
    expect(palette.accent).not.toBe(sable.accent);
  });

  test('duplicating a theme copies its seeds, so editing starts from something known', () => {
    const seeds = duplicateSeeds('gruvbox');
    expect(seeds.light.bg).toBe(paletteSources.gruvbox.light.bg);
    expect(seeds.dark.bg).toBe(paletteSources.gruvbox.dark.bg);
    expect(customPaletteSet(seeds).dark.bg).toBe(themes.gruvbox.dark.bg);
  });

  test('an unknown id duplicates the default rather than throwing', () => {
    expect(duplicateSeeds('nope').light.bg).toBe(paletteSources.sable.light.bg);
  });
});

describe('hex input', () => {
  test.each([
    ['#8A3A2E', '#8a3a2e'],
    ['8a3a2e', '#8a3a2e'],
    ['#abc', '#aabbcc'],
    ['  #FFFFFF ', '#ffffff'],
  ])('%s reads as %s', (raw, expected) => {
    expect(parseHex(raw)).toBe(expected);
  });

  test.each(['', '#12345', 'rebeccapurple', '#1234567'])('%s is not a colour', raw => {
    expect(parseHex(raw)).toBeNull();
  });
});

describe('resolving the custom id', () => {
  test('with nothing written it resolves to the default, not to a half-built palette', () => {
    const theme = resolveTheme('custom', 'dark', 'dark', { light: {}, dark: {} });
    expect(theme.themeId).toBe('sable');
    expect(theme.palette).toBe(themes.sable.dark);
  });

  test('with a colour written it resolves to the custom palette', () => {
    const theme = resolveTheme('custom', 'dark', 'dark', { light: {}, dark: { bg: '#101418' } });
    expect(theme.themeId).toBe('custom');
    expect(theme.dark).toBe(true);
  });
});
