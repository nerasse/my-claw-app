import { StyleSheet } from 'react-native';
import { markedStyles, styles } from '../AgentMarkdown';
import { darkPalette, lightPalette } from '../../theme/palettes';

/**
 * Guards the rule behind a visible bug: a bubble is a column, so flexShrink there governs
 * height, not width. The prose block carried flexShrink: 1 while the attachment above it (a
 * rigid 190pt image) carried the default 0, so the prose was the only child allowed to yield.
 * Yoga handed the image the whole budget and crushed the words to the top sliver of their first
 * line. Text-only bubbles never showed it: nothing rigid was competing for the height.
 *
 * Only inline runs may shrink. They sit in the row a list item builds (bullet, then content),
 * where yielding is a width concession and is what makes a long item wrap.
 */
const INLINE = new Set(['text', 'li', 'strong', 'em', 'strikethrough', 'link', 'codespan']);

test('the prose block never yields its height to an attachment', () => {
  expect(StyleSheet.flatten(styles.wrap).flexShrink).toBe(0);
});

test.each([
  ['light', lightPalette],
  ['dark', darkPalette],
])('block-level markdown styles stay rigid in a column bubble (%s)', (_name, palette) => {
  const sheet = markedStyles(palette) as unknown as Record<string, { flexShrink?: number } | undefined>;

  for (const [key, style] of Object.entries(sheet)) {
    if (INLINE.has(key) || style?.flexShrink === undefined) continue;
    expect({ key, flexShrink: style.flexShrink }).toEqual({ key, flexShrink: 0 });
  }
});
