#!/usr/bin/env python3
"""Generates src/theme/themes.generated.ts: ten themes, three modes, the app's Palette.

Run it by hand (`python3 scripts/generate-palettes.py`) and commit the output. The build never
runs Python: a .ts file that is committed is reviewable in a diff, and a palette change shows up
as one.

What is derived here and never picked by eye:

  - the elevation steps (surfaceAlt, surfaceRaised), mixed from the surface *towards* the ink,
    because derived from the background they collapsed onto it;
  - textMeta at 4.5:1 and textFaint at ~3:1: in this app the faint grey draws timestamps, so it
    has to be readable, and the decorative hairlines want to stay quiet. Two roles, two fields;
  - the bubble: a neutral elevation, never the accent;
  - the code background and the ink that survives it;
  - AMOLED: the ink capped so white on pure black stops haloing, and every tinted background
    remixed over #000 instead of carried over from the dark set.

AMOLED is generated rather than computed at runtime because `useThemedStyles` caches one
StyleSheet per palette *identity*: a palette rebuilt per render turns that cache into a leak.
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "theme" / "themes.generated.ts"


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def tohex(t):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(c))) for c in t)


def lum(h):
    r, g, b = (c / 255 for c in hx(h))
    def f(u):
        return u / 12.92 if u <= 0.03928 else ((u + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def mix(a, b, t):
    pa, pb = hx(a), hx(b)
    return tohex([pa[i] + (pb[i] - pa[i]) * t for i in range(3)])


def push(fg, bg, target, steps=200):
    """Moves fg away from bg, by the smallest step that reaches `target` contrast.

    A repeated fixed-size mix stalls: at 2 % of an 8-bit channel the increment rounds away and the
    colour stops moving (#cdd6f4 towards white never passed #e6e6f4). Interpolating over the whole
    distance instead always arrives, and lands on the first value that passes.
    """
    away = "#000000" if lum(bg) > 0.5 else "#ffffff"
    for i in range(1, steps + 1):
        cur = mix(fg, away, i / steps)
        if ratio(cur, bg) >= target:
            return cur
    return away


def pull(fg, bg, target, steps=200):
    """Moves fg towards bg, by the smallest step that drops to `target` contrast."""
    for i in range(1, steps + 1):
        cur = mix(fg, bg, i / steps)
        if ratio(cur, bg) <= target:
            return cur
    return bg


def lab(h):
    r, g, b = (c / 255 for c in hx(h))
    def f(u):
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    r, g, b = f(r), f(g), f(b)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    def g_(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    x, y, z = g_(x), g_(y), g_(z)
    return 116 * y - 16, 500 * (x - y), 200 * (y - z)


def delta_e(a, b):
    la, aa, ba = lab(a)
    lb, ab, bb = lab(b)
    return ((la - lb) ** 2 + (aa - ab) ** 2 + (ba - bb) ** 2) ** 0.5


# name, label, where the values come from, mode, the eleven colours a human actually chooses.
THEMES = [
    ("sable", "Sable", "my-claw", "light", dict(
        bg="#f6f4f1", surface="#fdfbf8", line="#e1dcd4", ink="#191714",
        muted="#56504a", faint="#8a8378", accent="#8a3a2e",
        ok="#2f6b47", warn="#8a5a10", danger="#a51f4b")),
    ("sable", "Sable", "my-claw", "dark", dict(
        bg="#14120f", surface="#1b1815", line="#2a261f", ink="#eae5dd",
        muted="#a0988c", faint="#6f685e", accent="#e08a72",
        ok="#6cc08d", warn="#d8a94f", danger="#ef6a86")),

    ("lin", "Lin", "my-claw", "light", dict(
        bg="#f5f4ef", surface="#fcfbf7", line="#dfddd3", ink="#191a15",
        muted="#53544a", faint="#8a8b7d", accent="#5c6b32",
        ok="#2f6b47", warn="#8a5a10", danger="#a82f28")),
    ("lin", "Lin", "my-claw", "dark", dict(
        bg="#12130f", surface="#191a16", line="#282a22", ink="#e8e9e1",
        muted="#a8a39a", faint="#6f6b63", accent="#a8bd6e",
        ok="#6cc08d", warn="#d8a94f", danger="#f08379")),

    ("charbon", "Charbon", "my-claw", "light", dict(
        bg="#f6f5f3", surface="#ffffff", line="#e0ded8", ink="#181614",
        muted="#544f49", faint="#8a857f", accent="#242220",
        ok="#2f6b47", warn="#b4762a", danger="#a82f28")),
    ("charbon", "Charbon", "my-claw", "dark", dict(
        bg="#131210", surface="#1a1917", line="#282622", ink="#e9e6e1",
        muted="#a8a39a", faint="#6f6b64", accent="#e8e4dd",
        ok="#6cc08d", warn="#e0a45c", danger="#f08379")),

    ("catppuccin", "Catppuccin", "catppuccin.com", "light", dict(
        bg="#eff1f5", surface="#ffffff", line="#bcc0cc", ink="#4c4f69",
        muted="#6c6f85", faint="#9ea0b0", accent="#8839ef",
        ok="#40a02b", warn="#df8e1d", danger="#d20f39")),
    ("catppuccin", "Catppuccin", "catppuccin.com", "dark", dict(
        bg="#1e1e2e", surface="#262637", line="#45475a", ink="#cdd6f4",
        muted="#a6adc8", faint="#707592", accent="#cba6f7",
        ok="#a6e3a1", warn="#f9e2af", danger="#f38ba8")),

    ("gruvbox", "Gruvbox", "github.com/morhetz/gruvbox", "light", dict(
        bg="#fbf1c7", surface="#f7edc3", line="#d5c4a1", ink="#3c3836",
        muted="#7c6f64", faint="#a89a86", accent="#076678",
        ok="#79740e", warn="#b57614", danger="#9d0006")),
    ("gruvbox", "Gruvbox", "github.com/morhetz/gruvbox", "dark", dict(
        bg="#282828", surface="#32302f", line="#504945", ink="#ebdbb2",
        muted="#a89984", faint="#7c6f64", accent="#fe8019",
        ok="#b8bb26", warn="#fabd2f", danger="#fb4934")),

    ("rose-pine", "Rose Pine", "rosepinetheme.com", "light", dict(
        bg="#faf4ed", surface="#fffaf3", line="#f2e9e1", ink="#464261",
        muted="#797593", faint="#a4a0b0", accent="#907aa9",
        ok="#56887f", warn="#ea9d34", danger="#b4637a")),
    ("rose-pine", "Rose Pine", "rosepinetheme.com", "dark", dict(
        bg="#191724", surface="#1f1d2e", line="#26233a", ink="#e0def4",
        muted="#908caa", faint="#6e6a86", accent="#c4a7e7",
        ok="#95b1ac", warn="#f6c177", danger="#eb6f92")),

    ("everforest", "Everforest", "github.com/sainnhe/everforest", "light", dict(
        bg="#fdf6e3", surface="#f8f2dd", line="#efebd4", ink="#5c6a72",
        muted="#829181", faint="#a6b0a0", accent="#3a94c5",
        ok="#8da101", warn="#dfa000", danger="#f85552")),
    ("everforest", "Everforest", "github.com/sainnhe/everforest", "dark", dict(
        bg="#2d353b", surface="#343f44", line="#3d484d", ink="#d3c6aa",
        muted="#859289", faint="#7a8478", accent="#7fbbb3",
        ok="#a7c080", warn="#dbbc7f", danger="#e67e80")),

    ("kanagawa", "Kanagawa", "github.com/rebelot/kanagawa.nvim", "light", dict(
        bg="#f2ecbc", surface="#f7f1c8", line="#d5cea3", ink="#545464",
        muted="#716e61", faint="#8a8980", accent="#4d699b",
        ok="#6f894e", warn="#de9800", danger="#c84053")),
    ("kanagawa", "Kanagawa", "github.com/rebelot/kanagawa.nvim", "dark", dict(
        bg="#1f1f28", surface="#2a2a37", line="#363646", ink="#dcd7ba",
        muted="#c8c093", faint="#727169", accent="#7e9cd8",
        ok="#98bb6c", warn="#e6c384", danger="#e46876")),

    ("tokyo-night", "Tokyo Night", "github.com/folke/tokyonight.nvim", "light", dict(
        bg="#e1e2e7", surface="#eef0f5", line="#c4c8da", ink="#3760bf",
        muted="#6172b0", faint="#848cb5", accent="#2e7de9",
        ok="#587539", warn="#8c6c3e", danger="#f52a65")),
    ("tokyo-night", "Tokyo Night", "github.com/folke/tokyonight.nvim", "dark", dict(
        bg="#1a1b26", surface="#1f2335", line="#292e42", ink="#c0caf5",
        muted="#a9b1d6", faint="#565f89", accent="#7aa2f7",
        ok="#9ece6a", warn="#e0af68", danger="#f7768e")),

    ("flexoki", "Flexoki", "stephango.com/flexoki", "light", dict(
        bg="#fffcf0", surface="#f7f4e8", line="#dad8ce", ink="#100f0f",
        muted="#6f6e69", faint="#b7b5ac", accent="#24837b",
        ok="#66800b", warn="#ad8301", danger="#af3029")),
    ("flexoki", "Flexoki", "stephango.com/flexoki", "dark", dict(
        bg="#100f0f", surface="#1c1b1a", line="#343331", ink="#cecdc3",
        muted="#878580", faint="#575653", accent="#3aa99f",
        ok="#879a39", warn="#d0a215", danger="#d14d41")),
]


def build(t, bg=None, surface=None):
    """One mode of one theme. `bg`/`surface` are overridden for AMOLED."""
    bg = bg or t["bg"]
    surface = surface or t["surface"]
    ink = t["ink"]
    dark = lum(bg) < 0.22
    toward = "#ffffff" if dark else "#000000"

    # The elevation steps start from the SURFACE, not the background: derived from the background
    # they fell within 4 units of the surface and the three elevations stopped reading as three.
    # A surface that reads as the background is not a card: three themes ship a surface within
    # 4 % of their background, so the first step is enforced before it is used.
    if ratio(surface, bg) < 1.06:
        surface = push(surface, bg, 1.06)
    surface_alt = mix(surface, toward, 0.055 if dark else 0.035)

    # The bubble is a neutral elevation, never the accent: mixing the background with the accent
    # in a dark theme produces mud, which is read as dirt and not as a surface.
    bubble = mix(surface_alt, "#ffffff", 0.045) if dark else mix(surface, t["accent"], 0.11)
    # A bubble is a step: it has to detach from the thread (>= 1.10), and past 1.5 it stops being
    # a step and becomes a panel. The accent tint alone is not enough on a light background,
    # where 11 % of a violet is a tint nobody sees.
    if ratio(bubble, bg) < 1.10:
        bubble = push(bubble, bg, 1.10)
    if ratio(bubble, bg) > 1.45:
        bubble = pull(bubble, bg, 1.4)

    # ...and `surfaceRaised` is what is drawn *inside* a bubble (a chip, the location card), so it
    # has to be a step away from the bubble and not merely from the surface. The POC's own
    # surface-3 sat below the bubble in dark and the chip vanished.
    raised = mix(surface_alt, toward, 0.055 if dark else 0.035)
    for _ in range(80):
        if ratio(raised, bubble) >= 1.10:
            break
        raised = mix(raised, toward, 0.02)

    # Two greys, two jobs: `meta` is a timestamp and has to pass 4.5:1; `faint` is a hairline
    # label, a glyph or a disabled mark, and wants to stay quiet at ~3:1.
    meta = push(t["faint"], bg, 4.5)
    # ~3:1 both ways: some seeds ship a faint that is already under it (Catppuccin's is 2.6:1 on
    # its own background), so it is raised before it is capped.
    faint = push(t["faint"], bg, 3.0)
    if ratio(faint, bg) > 3.4:
        faint = pull(faint, bg, 3.4)
    muted = push(t["muted"], bg, 5.2)
    if ratio(meta, bg) > ratio(muted, bg) - 1.2:
        muted = push(mix(muted, "#ffffff" if dark else "#000000", 0.25), bg, ratio(meta, bg) + 1.2)

    accent = push(t["accent"], bg, 4.5)
    accent_ink = "#ffffff" if ratio("#ffffff", accent) >= 3.4 else "#100f0f"
    accent_ink = push(accent_ink, accent, 4.5)
    accent_soft = mix(surface, accent, 0.09 if not dark else 0.13)

    ok = push(t["ok"], bg, 4.5)
    warn = push(t["warn"], bg, 4.5)
    danger = push(t["danger"], bg, 4.5)
    # accent and danger must not be the same alert twice: Gruvbox light's own orange against its
    # red is 15.9 dE, which reads as one colour used twice.
    for _ in range(120):
        if delta_e(accent, danger) >= 25:
            break
        danger = mix(danger, "#ff2d78", 0.02)
    danger = push(danger, bg, 4.5)

    code_bg = mix(bg, toward, 0.045) if not dark else mix(bg, "#000000", 0.45)
    code_ink = push(ink, code_bg, 7.0)

    bubble_ink = push(ink, bubble, 8.5)

    # A diff line is a wash with an ink on it. The ink is not `ok` itself: a light green on a
    # green wash lands at 3:1 whatever the wash does, so `diffAdd`/`diffDel` are the *readable*
    # pair and `ok`/`danger` stay the marks drawn on the page.
    diff_add_bg = mix(bg, ok, 0.13)
    diff_del_bg = mix(bg, danger, 0.13)
    diff_add = push(ok, diff_add_bg, 4.5)
    diff_del = push(danger, diff_del_bg, 4.5)

    return {
        "bg": bg,
        "surface": surface,
        "surfaceAlt": surface_alt,
        "surfaceRaised": raised,
        "border": t["line"],
        "text": ink,
        "textMuted": muted,
        "textMeta": meta,
        "textFaint": faint,
        "accent": accent,
        "accentText": accent_ink,
        "accentSoft": accent_soft,
        "bubbleUserBg": bubble,
        "bubbleUserText": bubble_ink,
        "ok": ok,
        "warn": warn,
        "danger": danger,
        "diffAdd": diff_add,
        "diffDel": diff_del,
        "diffAddBg": diff_add_bg,
        "diffDelBg": diff_del_bg,
        "diffHunkBg": mix(bg, accent, 0.07),
        "overlay": "rgba(0,0,0,0.62)" if dark else "rgba(25,22,20,0.38)",
        "codeBg": code_bg,
        "codeText": code_ink,
        "focus": accent,
        "selection": accent,
    }


def amoled(t):
    """Pure black: the panel switches those pixels off, and three things do not survive it.

    - the surface, which disappears if it stays dark (it rises to #0d0d0d: enough for a card to
      detach, little enough not to light a large area);
    - the ink, which burns: white on pure black haloes and smears while scrolling, so it is
      capped at ~14:1;
    - the code background, which has to stay *under* the surface or the code blocks float above
      the cards.
    """
    out = build(t, bg="#000000", surface="#0d0d0d")
    ink = out["text"]
    for _ in range(120):
        if ratio(ink, "#000000") <= 14.0:
            break
        ink = mix(ink, "#000000", 0.02)
    ink = push(ink, "#000000", 7.0)

    out.update({
        "bg": "#000000",
        "surface": "#0d0d0d",
        "surfaceAlt": "#171717",
        "border": "#2e2e2e",
        "text": ink,
        "codeBg": "#070707",
        "bubbleUserBg": "#161616",
        "overlay": "rgba(0,0,0,0.78)",
    })
    out["codeText"] = push(out["codeText"], out["codeBg"], 7.0)
    out["bubbleUserText"] = push(ink, out["bubbleUserBg"], 10.0)
    out["textMeta"] = push(out["textMeta"], "#000000", 4.5)
    out["textMuted"] = push(out["textMuted"], "#000000", 5.2)
    out["textFaint"] = pull(out["textFaint"], "#000000", 3.2)
    # Tinted backgrounds restart from black: inherited from the dark set they kept that theme's
    # hue and drew brown bands on a background that has no colour left.
    out["diffAddBg"] = mix("#000000", out["ok"], 0.13)
    out["diffDelBg"] = mix("#000000", out["danger"], 0.13)
    out["diffAdd"] = push(out["ok"], out["diffAddBg"], 4.5)
    out["diffDel"] = push(out["danger"], out["diffDelBg"], 4.5)
    out["diffHunkBg"] = mix("#000000", out["accent"], 0.09)
    out["accentSoft"] = mix("#000000", out["accent"], 0.16)
    out["surfaceRaised"] = "#212121"
    out["focus"] = out["accent"]
    out["selection"] = out["accent"]
    return out


def ts(palette, indent="      "):
    lines = []
    for k, v in palette.items():
        lines.append(f'{indent}{k}: "{v}",')
    return "\n".join(lines)


def main():
    by_theme = {}
    order = []
    labels = {}
    sources = {}
    for name, label, source, mode, tokens in THEMES:
        if name not in by_theme:
            by_theme[name] = {}
            order.append(name)
        labels[name] = label
        sources[name] = source
        by_theme[name][mode] = tokens

    problems = []
    blocks = []
    for name in order:
        light = build(by_theme[name]["light"])
        dark = build(by_theme[name]["dark"])
        black = amoled(by_theme[name]["dark"])
        for mode, p in (("light", light), ("dark", dark), ("amoled", black)):
            for field in ("text", "textMuted", "textMeta", "textFaint", "accent", "ok", "warn", "danger"):
                if ratio(p[field], p["bg"]) < 4.5 and field != "textFaint":
                    problems.append(f"{name}/{mode}: {field} {p[field]} on {p['bg']} = {ratio(p[field], p['bg']):.2f}")
            if ratio(p["accentText"], p["accent"]) < 4.5:
                problems.append(f"{name}/{mode}: accentText on accent = {ratio(p['accentText'], p['accent']):.2f}")
            if ratio(p["bubbleUserText"], p["bubbleUserBg"]) < 8.5:
                problems.append(f"{name}/{mode}: bubbleUserText on bubble = {ratio(p['bubbleUserText'], p['bubbleUserBg']):.2f}")
            if ratio(p["codeText"], p["codeBg"]) < 7:
                problems.append(f"{name}/{mode}: codeText on codeBg = {ratio(p['codeText'], p['codeBg']):.2f}")
            if delta_e(p["accent"], p["danger"]) < 25:
                problems.append(f"{name}/{mode}: dE(accent, danger) = {delta_e(p['accent'], p['danger']):.1f}")
            for a, b in (("bg", "surface"), ("surface", "surfaceAlt"), ("surfaceAlt", "surfaceRaised")):
                if ratio(p[a], p[b]) < 1.05:
                    problems.append(f"{name}/{mode}: {a}->{b} = {ratio(p[a], p[b]):.2f}")
            if ratio(p["bubbleUserBg"], p["bg"]) > 1.55:
                problems.append(f"{name}/{mode}: bubble is a card ({ratio(p['bubbleUserBg'], p['bg']):.2f})")
        blocks.append(
            f'  "{name}": {{\n'
            f'    label: "{labels[name]}",\n'
            f'    source: "{sources[name]}",\n'
            f"    light: {{\n{ts(light)}\n    }},\n"
            f"    dark: {{\n{ts(dark)}\n    }},\n"
            f"    amoled: {{\n{ts(black)}\n    }},\n"
            f"  }},"
        )

    header = (
        "// Generated by scripts/generate-palettes.py -- do not edit by hand.\n"
        "// Ten themes, three modes each. The derivation and the invariants it enforces live in\n"
        "// that script; this file is its output, committed so the build never runs Python.\n"
        "import type { Palette } from './palettes';\n\n"
        "export interface GeneratedPaletteSet {\n"
        "  label: string;\n"
        "  /** Where the values came from, shown in Appearance. Never invented. */\n"
        "  source: string;\n"
        "  light: Palette;\n"
        "  dark: Palette;\n"
        "  amoled: Palette;\n"
        "}\n\n"
        "export type GeneratedThemeId =\n"
        + "\n".join(f"  | '{n}'" % () if False else f"  | '{n}'" for n in order)
        + ";\n\n"
        "export const generatedThemes: Record<GeneratedThemeId, GeneratedPaletteSet> = {\n"
    )
    OUT.write_text(header + "\n".join(blocks) + "\n};\n")

    print(f"{OUT.relative_to(ROOT)}: {len(order)} themes x 3 modes")
    if problems:
        print("\ninvariants not met:")
        for p in problems:
            print("  " + p)
        return 1
    print("all invariants met")
    return 0


if __name__ == "__main__":
    sys.exit(main())
