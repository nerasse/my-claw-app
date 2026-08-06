import { markedStyles } from '../../components/AgentMarkdown';
import { darkPalette, lightPalette, lineHeightFor } from '../palettes';

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
