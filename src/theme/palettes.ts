export interface Palette {
  /** Screen background. */
  bg: string;
  /** Cards, drawer, sheets: one step off the background. */
  surface: string;
  /** Inputs and agent bubbles. */
  surfaceAlt: string;
  /** Hairlines. */
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  /**
   * Secondary text and inactive tracks drawn *on* an accent fill (a user bubble). Neither
   * textMuted nor border survives there: both are tuned for the page background, and on accent
   * they read as either invisible or dirty. Expressed as a translucent accentText so the two
   * themes stay coherent without a second accent ramp.
   */
  onAccentMuted: string;
  onAccentTrack: string;
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
}

export const lightPalette: Palette = {
  bg: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#f2f3f5',
  border: '#e3e5e9',
  text: '#14161a',
  textMuted: '#5c626d',
  textFaint: '#9aa0ab',
  accent: '#2563eb',
  accentText: '#ffffff',
  accentSoft: '#e8efff',
  onAccentMuted: 'rgba(255,255,255,0.74)',
  onAccentTrack: 'rgba(255,255,255,0.34)',
  ok: '#12855a',
  warn: '#b45309',
  danger: '#c02626',
  diffAdd: '#12855a',
  diffDel: '#c02626',
  diffAddBg: '#e6f4ec',
  diffDelBg: '#fbeaea',
  diffHunkBg: '#eef1f6',
  overlay: 'rgba(15,18,24,0.42)',
  codeBg: '#f7f8fa',
};

export const darkPalette: Palette = {
  bg: '#0f1115',
  surface: '#161a20',
  surfaceAlt: '#1d222a',
  border: '#262c36',
  text: '#e8eaee',
  textMuted: '#9ba3b0',
  textFaint: '#6b7481',
  accent: '#4d84ff',
  accentText: '#0b1220',
  accentSoft: '#1b2740',
  onAccentMuted: 'rgba(11,18,32,0.68)',
  onAccentTrack: 'rgba(11,18,32,0.26)',
  ok: '#3ecf8e',
  warn: '#e0a33e',
  danger: '#ff6b6b',
  diffAdd: '#3ecf8e',
  diffDel: '#ff6b6b',
  diffAddBg: '#12281c',
  diffDelBg: '#2b1414',
  diffHunkBg: '#1a1f28',
  overlay: 'rgba(0,0,0,0.6)',
  codeBg: '#11151b',
};

/** Compact by design: one dense scale used everywhere so screens stay information-first. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
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

export const DRAWER_WIDTH = 360;
