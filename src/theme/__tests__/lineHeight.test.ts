import { markedStyles } from '../../components/AgentMarkdown';
import { darkPalette, lightPalette, lineBoxFor, lineHeightFor } from '../palettes';

/**
 * Guards the rule that produced a visible bug: an emoji alone on a line lost its bottom half,
 * because the line box was tuned for the Latin face while Android drew the glyph from the much
 * taller emoji fallback.
 */
const EMOJI_SAFE_RATIO = 1.45;

test('the line box leaves room for an emoji at every size', () => {
  expect(lineHeightFor(14)).toBe(21);
  expect(lineHeightFor(11)).toBeGreaterThanOrEqual(11 * EMOJI_SAFE_RATIO);
  expect(lineHeightFor(12)).toBeGreaterThanOrEqual(12 * EMOJI_SAFE_RATIO);
});

test.each([
  ['light', lightPalette],
  ['dark', darkPalette],
])('markdown text styles cannot clip an emoji (%s)', (_name, palette) => {
  const styles = markedStyles(palette) as unknown as Record<
    string,
    { fontSize?: number; lineHeight?: number } | undefined
  >;

  for (const [key, style] of Object.entries(styles)) {
    if (!style?.fontSize || !style.lineHeight) continue;
    expect({ key, ratio: style.lineHeight / style.fontSize }).toEqual({
      key,
      ratio: expect.any(Number),
    });
    expect(style.lineHeight / style.fontSize).toBeGreaterThanOrEqual(EMOJI_SAFE_RATIO);
  }
});

/**
 * A pinned line box installs RN's CustomLineHeightSpan, which measures the line from the Latin
 * face alone and then clamps the first and last line to it. An emoji that wraps onto a line of
 * its own at the end of a message has no Latin glyph beside it holding the box open, so the
 * clamp cuts its bottom. Interior lines are left loose and were never affected, which is why the
 * glyph survived mid-paragraph and vanished at the end.
 */
describe('lineBoxFor', () => {
  test('pins the box for text the Latin face draws on its own', () => {
    expect(lineBoxFor(14, 'un chat random')).toEqual({ lineHeight: 21 });
    expect(lineBoxFor(12, '')).toEqual({ lineHeight: 18 });
  });

  test('leaves the box unpinned as soon as an emoji is in the run', () => {
    expect(lineBoxFor(14, "Voilà, un chat random d'Unsplash 🐱")).toEqual({});
    expect(lineBoxFor(14, '🐱')).toEqual({});
    // A trailing emoji is the case that bit: it is the one that wraps onto the last line.
    expect(lineBoxFor(14, 'done ✅')).toEqual({});
  });

  test('the regex is stateless, so the same run answers the same way twice', () => {
    expect(lineBoxFor(14, 'a 🐱 b')).toEqual(lineBoxFor(14, 'a 🐱 b'));
  });
});

test('markdown drops the pin for a message carrying an emoji', () => {
  const plain = markedStyles(lightPalette, 'un chat') as unknown as Record<string, { lineHeight?: number }>;
  const emoji = markedStyles(lightPalette, 'un chat 🐱') as unknown as Record<string, { lineHeight?: number }>;

  expect(plain.text?.lineHeight).toBe(21);
  expect(plain.li?.lineHeight).toBe(21);
  expect(emoji.text?.lineHeight).toBeUndefined();
  expect(emoji.li?.lineHeight).toBeUndefined();
});

test('bubble emphasis wears the palette ink, never the library default gray', () => {
  for (const palette of [lightPalette, darkPalette]) {
    const styles = markedStyles(palette) as unknown as Record<
      string,
      { color?: string; fontSize?: number } | undefined
    >;
    for (const key of ['strong', 'em', 'strikethrough', 'li'] as const) {
      expect(styles[key]?.color).toBe(palette.text);
      expect(styles[key]?.fontSize).toBe(14);
    }
  }
});
