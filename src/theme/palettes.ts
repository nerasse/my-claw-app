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

export const DRAWER_WIDTH = 288;
