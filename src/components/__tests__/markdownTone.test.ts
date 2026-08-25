import { markedStyles, WrappingRenderer } from '../AgentMarkdown';
import { darkPalette, font, lightPalette } from '../../theme/palettes';

/**
 * An aside (the model's reasoning, a compaction summary) is markdown like the answer, only
 * quieter. These guard the "quieter" half: the day the aside is drawn at body size and body ink,
 * a 16k-character summary competes with the reply it is folded under.
 */
const PALETTES = [
  ['light', lightPalette],
  ['dark', darkPalette],
] as const;

type Sheet = Record<string, { fontSize?: number; color?: string; lineHeight?: number; flexShrink?: number } | undefined>;

test.each(PALETTES)('an aside reads one step under the body, in muted ink (%s)', (_name, palette) => {
  const body = markedStyles(palette, 'texte', 'body') as unknown as Sheet;
  const aside = markedStyles(palette, 'texte', 'aside') as unknown as Sheet;

  for (const key of ['text', 'li', 'strong', 'em', 'strikethrough'] as const) {
    expect(body[key]?.fontSize).toBe(font.body);
    expect(body[key]?.color).toBe(palette.text);
    expect(aside[key]?.fontSize).toBe(font.small);
    expect(aside[key]?.color).toBe(palette.textMuted);
  }
  // A link stays the accent in both: it is an affordance, not prose.
  expect(aside.link?.color).toBe(palette.accent);
});

test('headings scale with the prose they title instead of sitting at fixed points', () => {
  const aside = markedStyles(lightPalette, 'texte', 'aside') as unknown as Sheet;
  const body = markedStyles(lightPalette, 'texte', 'body') as unknown as Sheet;

  for (const key of ['h1', 'h2', 'h3', 'h4'] as const) {
    expect(aside[key]?.fontSize).toBeLessThan(body[key]?.fontSize ?? 0);
    // Still a hierarchy, and still above the prose it introduces.
    expect(aside[key]?.fontSize).toBeGreaterThanOrEqual(font.small);
  }
  expect(aside.h1?.fontSize).toBeGreaterThan(aside.h2?.fontSize ?? 0);
  expect(aside.h2?.fontSize).toBeGreaterThan(aside.h3?.fontSize ?? 0);
});

test('monospace never falls under the smallest size we ship', () => {
  for (const tone of ['body', 'aside'] as const) {
    const sheet = markedStyles(lightPalette, '', tone) as unknown as Sheet;
    expect(sheet.codespan?.fontSize).toBeGreaterThanOrEqual(font.micro);
  }
});

/** The layout and emoji invariants are the tone's business too, not the body tone's alone. */
test.each(PALETTES)('an aside keeps the block and line-box rules (%s)', (_name, palette) => {
  const INLINE = new Set(['text', 'li', 'strong', 'em', 'strikethrough', 'link', 'codespan']);
  const sheet = markedStyles(palette, 'texte', 'aside') as unknown as Sheet;

  for (const [key, style] of Object.entries(sheet)) {
    if (!INLINE.has(key) && style?.flexShrink !== undefined) {
      expect({ key, flexShrink: style.flexShrink }).toEqual({ key, flexShrink: 0 });
    }
    if (style?.fontSize && style.lineHeight) {
      expect(style.lineHeight / style.fontSize).toBeGreaterThanOrEqual(1.45);
    }
  }

  // An emoji in the run leaves every box unpinned, at this tone as at the other.
  const emoji = markedStyles(palette, 'compacté 🐱', 'aside') as unknown as Sheet;
  expect(emoji.text?.lineHeight).toBeUndefined();
  expect(emoji.h1?.lineHeight).toBeUndefined();
});

test('a thematic break is drawn in an answer and dropped in a thought', () => {
  // Models punctuate their thinking with `---` or a run of asterisks, and CommonMark reads those
  // as a rule: the aside was getting sliced by full-width bars. In an answer the break is meant.
  const style = { fontSize: font.body, color: lightPalette.text };
  const aside = new WrappingRenderer(style, style, 'aside');
  const body = new WrappingRenderer(style, style, 'body');

  expect(aside.hr()).toBeNull();
  expect(body.hr()).not.toBeNull();
  // Default tone is the answer's: a caller that says nothing keeps the rule.
  expect(new WrappingRenderer(style, style).hr()).not.toBeNull();
});
