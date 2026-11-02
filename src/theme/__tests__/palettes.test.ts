import { themes, themeIds } from '../themes';
import type { Palette } from '../palettes';

/**
 * The rules a palette has to keep, checked on the generated table rather than trusted to the
 * generator: a hand edit in `themes.generated.ts`, or a seed changed without regenerating, is a
 * theme whose error state looks like its accent. The generator prints the same checks; this is
 * the one that runs on every commit.
 */

function channels(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(c => c / 255);
  const f = (u: number): number => (u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(c => c / 255);
  const f = (u: number): number => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [f(r), f(g), f(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const g_ = (t: number): number => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
  return [116 * g_(y) - 16, 500 * (g_(x) - g_(y)), 200 * (g_(y) - g_(z))];
}

function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

const MODES = ['light', 'dark', 'amoled'] as const;

const cases = themeIds.flatMap(id => MODES.map(mode => [`${id}/${mode}`, themes[id][mode]] as const));

describe.each(cases)('%s', (_name, palette: Palette) => {
  test('every text role reads on its own background', () => {
    for (const field of ['text', 'textMuted', 'textMeta'] as const) {
      expect([field, contrast(palette[field], palette.bg)]).toEqual([field, expect.any(Number)]);
      expect(contrast(palette[field], palette.bg)).toBeGreaterThanOrEqual(4.5);
    }
    // Decorative, but still visible: a hairline label at 2:1 is a smudge.
    expect(contrast(palette.textFaint, palette.bg)).toBeGreaterThanOrEqual(2.8);
  });

  test('textFaint stays below textMeta: the two roles are not interchangeable', () => {
    expect(contrast(palette.textFaint, palette.bg)).toBeLessThan(contrast(palette.textMeta, palette.bg));
  });

  test('the coloured roles read, and on their own ink', () => {
    for (const field of ['accent', 'ok', 'warn', 'danger'] as const) {
      expect(contrast(palette[field], palette.bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(palette.accentText, palette.accent)).toBeGreaterThanOrEqual(4.5);
  });

  test('an error never looks like the accent', () => {
    expect(deltaE(palette.accent, palette.danger)).toBeGreaterThanOrEqual(25);
  });

  test('the user bubble is a surface: readable ink, distinguishable, not a card', () => {
    expect(contrast(palette.bubbleUserText, palette.bubbleUserBg)).toBeGreaterThanOrEqual(8.5);
    expect(contrast(palette.bubbleUserBg, palette.bg)).toBeGreaterThanOrEqual(1.08);
    expect(contrast(palette.bubbleUserBg, palette.bg)).toBeLessThanOrEqual(1.5);
  });

  test('the three elevations step away from each other, and the raised one clears the bubble', () => {
    expect(contrast(palette.surface, palette.bg)).toBeGreaterThanOrEqual(1.05);
    expect(contrast(palette.surfaceAlt, palette.surface)).toBeGreaterThanOrEqual(1.05);
    expect(contrast(palette.surfaceRaised, palette.surfaceAlt)).toBeGreaterThanOrEqual(1.05);
    // A chip drawn inside a user bubble sits on `surfaceRaised`: it has to detach from the bubble,
    // not from the page.
    expect(contrast(palette.surfaceRaised, palette.bubbleUserBg)).toBeGreaterThanOrEqual(1.09);
  });

  test('code keeps its own ink, and the diffs stay legible', () => {
    expect(contrast(palette.codeText, palette.codeBg)).toBeGreaterThanOrEqual(7);
    // The wash carries its own ink: `ok`/`danger` are the marks on the page, `diffAdd`/`diffDel`
    // the pair that has to survive inside a tinted line.
    expect(contrast(palette.diffAdd, palette.diffAddBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.diffDel, palette.diffDelBg)).toBeGreaterThanOrEqual(4.5);
  });
});

test('AMOLED is black, and dark enough to switch the pixels off', () => {
  for (const id of themeIds) {
    expect(themes[id].amoled.bg).toBe('#000000');
    expect(luminance(themes[id].amoled.surface)).toBeGreaterThan(0);
  }
});

test('every theme names where its colours came from', () => {
  for (const id of themeIds) {
    expect(themes[id].label.length).toBeGreaterThan(0);
    expect(themes[id].source.length).toBeGreaterThan(0);
  }
});
