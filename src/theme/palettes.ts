import { generatedThemes } from './themes.generated';

export interface Palette {
  /** Screen background. */
  bg: string;
  /** Cards, drawer, sheets: one step off the background. */
  surface: string;
  /** Inputs and agent bubbles. */
  surfaceAlt: string;
  /**
   * The third elevation: a selected row, and a card drawn *inside* another surface (the chip and
   * the location card sit on the user bubble). Two steps were not enough -- with only `surface`
   * and `surfaceAlt` a selected row and a card were the same grey.
   */
  surfaceRaised: string;
  /** Hairlines. */
  border: string;
  text: string;
  /** Secondary prose: an aside, a caption, a hint under a control. */
  textMuted: string;
  /**
   * Timestamps, counts, model names: text you read, and small.
   *
   * `textFaint` used to carry this as well, at 2.6:1 in the light theme, which is not readable
   * in daylight. The two uses were always different -- one is a label, the other a decoration --
   * so they are two fields: this one is generated at 4.5:1, `textFaint` stays near 3:1.
   */
  textMeta: string;
  /** Decoration only: a hairline glyph, a disabled mark, a separator. Never below 3:1. */
  textFaint: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  /** The focus ring. Its own field: on a theme whose accent is also its warning, a ring in accent reads as an alert. */
  focus: string;
  /** The web `::selection`. An accent fill that is not the user bubble, by name and not by coincidence. */
  selection: string;
  /**
   * The user bubble: a neutral step off the thread, never the accent.
   *
   * It used to be filled with `accent`, which put 1.4 % of the screen in colour and made the
   * owner's own messages the loudest thing in a conversation they had already read. A bubble is
   * a surface; the colour belongs to the accent drawn on top of it.
   */
  bubbleUserBg: string;
  /** Text on `bubbleUserBg`. A dedicated field, because `text` has no relationship with it. */
  bubbleUserText: string;
  ok: string;
  warn: string;
  danger: string;
  /** Green used for diff additions and success state. */
  diffAdd: string;
  /** Red used for diff removals. */
  diffDel: string;
  /** Background of a diff addition line. */
  diffAddBg: string;
  /** Background of a diff removal line. */
  diffDelBg: string;
  /** Background of a diff hunk header (`@@ -a,b +c,d @@`). */
  diffHunkBg: string;
  overlay: string;
  /** Monospace blocks inside tool cards. */
  codeBg: string;
  /**
   * Text inside a `codeBg` block. Not `text`: on a theme whose code background is darker than
   * the page (Flexoki, AMOLED) the page ink has no contrast left to give.
   */
  codeText: string;
}

/**
 * Two of the ten generated palettes, by name, for the call sites that want a concrete one: a test
 * fixture, a context default. They are module constants like every other generated palette, which
 * is what `useThemedStyles` (theme/index.ts) requires of anything it caches a StyleSheet against.
 */
export const lightPalette: Palette = generatedThemes.sable.light;
export const darkPalette: Palette = generatedThemes.sable.dark;

/** Compact by design: one dense scale used everywhere so screens stay information-first. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
} as const;

/**
 * The box of one control in a toolbar.
 *
 * A single number, because two chips and a button in the same row each picked their own: the
 * context gauge stood 28 tall beside a sub-agent counter at 24, and the pair read as two rows that
 * had drifted into one strip. The ink still sets its own size; only the box is shared.
 */
export const control = {
  height: 28,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const font = {
  micro: 10,
  small: 11,
  meta: 12,
  body: 14,
  title: 15,
  screen: 16,
} as const;

/**
 * Line box for text that can contain emoji.
 *
 * Android draws colour emoji from a fallback font whose metrics are much taller than the Latin
 * face at the same size. An explicit lineHeight sets an exact line box, so anything tighter than
 * those metrics clips the glyph -- worst when an emoji wraps onto a line of its own, where no
 * Latin glyph is holding the box open and the emoji simply loses its bottom. 1.5x clears Noto
 * Color Emoji at every size used here. Chrome icons avoid the problem entirely by being vectors.
 */
export function lineHeightFor(fontSize: number): number {
  return Math.round(fontSize * 1.5);
}

/** Anything the platform draws from the colour emoji font rather than the Latin face. */
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

/**
 * The line box for a run of text, left unpinned when that run carries an emoji.
 *
 * An explicit lineHeight installs RN's CustomLineHeightSpan, which sizes the line solely from
 * the first available font -- the Latin face -- and then clamps the first and last line to that
 * box (`fm.top = fm.ascent`, `fm.bottom = fm.descent`). Interior lines stay loose, so a tall
 * glyph may overflow them and still be drawn; the outer two may not. An emoji that wraps onto a
 * line of its own at the end of a message therefore loses its bottom, with no Latin glyph beside
 * it to hold the box open.
 *
 * Raising the ratio barely helps: half the leading is floored into the descent, so at 14sp the
 * box has to reach 25pt to buy two pixels. Dropping the pin instead lets Android measure the
 * line from the fonts it actually used, which is the only way the emoji gets its full height.
 * Lines lose the 1.5x rhythm, which is the price of showing the glyph at all.
 */
export function lineBoxFor(fontSize: number, text: string): { lineHeight?: number } {
  return PICTOGRAPHIC.test(text) ? {} : { lineHeight: lineHeightFor(fontSize) };
}

export const DRAWER_WIDTH = 288;
