import type { Palette } from './palettes';
import type { PaletteSource } from './themes.generated';

/**
 * The derivation, in TypeScript.
 *
 * `scripts/generate-palettes.py` owns this algorithm and writes the ten themes in
 * `themes.generated.ts`. The app cannot run Python, and a custom palette is derived at runtime
 * from whatever the owner typed -- so the algorithm exists twice, and two implementations of one
 * algorithm drift. `derive.test.ts` is what keeps them honest: it recomputes every generated
 * theme from its source colours through this file and asserts byte equality. The port is measured
 * against the output, not trusted.
 *
 * Three things here are ports rather than rewrites, and each is load-bearing:
 *   - `pyRound`, because Python rounds halves to even and `Math.round` rounds them up: a single
 *     channel differing by one is a different hex;
 *   - `push`/`pull` interpolating over the whole distance, because a repeated fixed-size mix
 *     stalls once the increment falls under half a channel;
 *   - the exact order of the comparisons, because the first value that passes is returned.
 */

function hx(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16)) as [number, number, number];
}

/** Python's `round`: halves to the nearest even, not up. */
function pyRound(x: number): number {
  const lower = Math.floor(x);
  const diff = x - lower;
  if (diff > 0.5) return lower + 1;
  if (diff < 0.5) return lower;
  return lower % 2 === 0 ? lower : lower + 1;
}

function toHex(channels: number[]): string {
  return `#${channels
    .map(c => Math.max(0, Math.min(255, pyRound(c))).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function luminance(hex: string): number {
  const [r, g, b] = hx(hex).map(c => c / 255) as [number, number, number];
  const f = (u: number): number => (u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(a: string, b: string, t: number): string {
  const pa = hx(a);
  const pb = hx(b);
  return toHex([0, 1, 2].map(i => pa[i]! + (pb[i]! - pa[i]!) * t));
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = hx(hex).map(c => c / 255) as [number, number, number];
  const f = (u: number): number => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [f(r), f(g), f(b)] as [number, number, number];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const g_ = (t: number): number => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
  const [X, Y, Z] = [g_(x), g_(y), g_(z)] as [number, number, number];
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

/** Moves `fg` away from `bg` to the smallest step that reaches `target`. */
function push(fg: string, bg: string, target: number, steps = 200): string {
  const away = luminance(bg) > 0.5 ? '#000000' : '#ffffff';
  for (let i = 1; i <= steps; i++) {
    const cur = mix(fg, away, i / steps);
    if (contrast(cur, bg) >= target) return cur;
  }
  return away;
}

/** Moves `fg` towards `bg` to the smallest step that drops to `target`. */
function pull(fg: string, bg: string, target: number, steps = 200): string {
  for (let i = 1; i <= steps; i++) {
    const cur = mix(fg, bg, i / steps);
    if (contrast(cur, bg) <= target) return cur;
  }
  return bg;
}

/** The dark, AMOLED variant: pure black, the ink capped so it stops haloing. */
function amoledOf(source: PaletteSource): Palette {
  const out: Palette = build({ ...source, bg: '#000000', surface: '#0d0d0d' });
  let ink = out.text;
  for (let i = 0; i < 120; i++) {
    if (contrast(ink, '#000000') <= 14.0) break;
    ink = mix(ink, '#000000', 0.02);
  }
  ink = push(ink, '#000000', 7.0);
  return {
    ...out,
    bg: '#000000',
    surface: '#0d0d0d',
    surfaceAlt: '#171717',
    border: '#2e2e2e',
    text: ink,
    codeBg: '#070707',
    bubbleUserBg: '#161616',
    overlay: 'rgba(0,0,0,0.78)',
    codeText: push(out.codeText, '#070707', 7.0),
    bubbleUserText: push(ink, '#161616', 10.0),
    textMeta: push(out.textMeta, '#000000', 4.5),
    textMuted: push(out.textMuted, '#000000', 5.2),
    textFaint: pull(out.textFaint, '#000000', 3.2),
    diffAddBg: mix('#000000', out.ok, 0.13),
    diffDelBg: mix('#000000', out.danger, 0.13),
    diffHunkBg: mix('#000000', out.accent, 0.09),
    accentSoft: mix('#000000', out.accent, 0.16),
    surfaceRaised: '#212121',
    focus: out.accent,
    selection: out.accent,
    diffAdd: push(out.ok, mix('#000000', out.ok, 0.13), 4.5),
    diffDel: push(out.danger, mix('#000000', out.danger, 0.13), 4.5),
  };
}

/** One mode of one theme, from the eleven colours a human chooses. */
export function build(source: PaletteSource): Palette {
  const bg = source.bg;
  let surface = source.surface;
  const ink = source.ink;
  const dark = luminance(bg) < 0.22;
  const toward = dark ? '#ffffff' : '#000000';

  if (contrast(surface, bg) < 1.06) surface = push(surface, bg, 1.06);
  const surfaceAlt = mix(surface, toward, dark ? 0.055 : 0.035);

  let bubble = dark ? mix(surfaceAlt, '#ffffff', 0.045) : mix(surface, source.accent, 0.11);
  if (contrast(bubble, bg) < 1.1) bubble = push(bubble, bg, 1.1);
  if (contrast(bubble, bg) > 1.45) bubble = pull(bubble, bg, 1.4);

  let raised = mix(surfaceAlt, toward, dark ? 0.055 : 0.035);
  for (let i = 0; i < 80; i++) {
    if (contrast(raised, bubble) >= 1.1) break;
    raised = mix(raised, toward, 0.02);
  }

  const meta = push(source.faint, bg, 4.5);
  let faint = push(source.faint, bg, 3.0);
  if (contrast(faint, bg) > 3.4) faint = pull(faint, bg, 3.4);
  let muted = push(source.muted, bg, 5.2);
  if (contrast(meta, bg) > contrast(muted, bg) - 1.2) {
    muted = push(mix(muted, dark ? '#ffffff' : '#000000', 0.25), bg, contrast(meta, bg) + 1.2);
  }

  const accent = push(source.accent, bg, 4.5);
  const accentInk = push(contrast('#ffffff', accent) >= 3.4 ? '#ffffff' : '#100f0f', accent, 4.5);
  const accentSoft = mix(surface, accent, dark ? 0.13 : 0.09);

  const ok = push(source.ok, bg, 4.5);
  const warn = push(source.warn, bg, 4.5);
  let danger = push(source.danger, bg, 4.5);
  for (let i = 0; i < 120; i++) {
    if (deltaE(accent, danger) >= 25) break;
    danger = mix(danger, '#ff2d78', 0.02);
  }
  danger = push(danger, bg, 4.5);

  const codeBg = dark ? mix(bg, '#000000', 0.45) : mix(bg, toward, 0.045);
  const codeText = push(ink, codeBg, 7.0);
  const bubbleUserText = push(ink, bubble, 8.5);

  const diffAddBg = mix(bg, ok, 0.13);
  const diffDelBg = mix(bg, danger, 0.13);

  return {
    bg,
    surface,
    surfaceAlt,
    surfaceRaised: raised,
    border: source.line,
    text: ink,
    textMuted: muted,
    textMeta: meta,
    textFaint: faint,
    accent,
    accentText: accentInk,
    accentSoft,
    focus: accent,
    selection: accent,
    bubbleUserBg: bubble,
    bubbleUserText,
    ok,
    warn,
    danger,
    diffAdd: push(ok, diffAddBg, 4.5),
    diffDel: push(danger, diffDelBg, 4.5),
    diffAddBg,
    diffDelBg,
    diffHunkBg: mix(bg, accent, 0.07),
    overlay: dark ? 'rgba(0,0,0,0.62)' : 'rgba(25,22,20,0.38)',
    codeBg,
    codeText,
  };
}

/** The three modes of a theme, from the two seeds a human writes. */
export function deriveSet(source: { light: PaletteSource; dark: PaletteSource }): {
  light: Palette;
  dark: Palette;
  amoled: Palette;
} {
  const light = build(source.light);
  const dark = build(source.dark);
  return { light, dark, amoled: amoledOf(source.dark) };
}
