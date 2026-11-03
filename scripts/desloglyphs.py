#!/usr/bin/env python3
"""Replaces the text glyphs in the chrome with the vectors from components/icons.tsx.

The glyphs carried font metrics: a chevron's optical centre sits off the middle of its em box, a
cross's stroke differs from a path's, and a colour emoji falls back to a font tall enough to be
clipped. A path has no metrics to disagree with, so it lands where the box centres it at any size.

The colour is read from the style the glyph used, so a faint chevron stays faint. A style it
cannot resolve is reported and left alone: guessing a colour would silently recolour chrome.

  python3 scripts/desloglyphs.py            # dry pass, prints what it would do
  python3 scripts/desloglyphs.py --write    # applies it
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# (pattern, icon, direction, size, label)
RULES = [
    (r'<Text style=\{styles\.(backGlyph|backArrow|navGlyph|closeGlyph)\}>‹</Text>', 'ChevronIcon', 'left', 22, 'back'),
    (r'<Text style=\{styles\.(linkGlyph|chevron|rowGlyph|footerGlyph)\}>›</Text>', 'ChevronIcon', 'right', 16, 'link'),
    (r'<Text style=\{styles\.(closeGlyph|closeGlyphText|navGlyph)\}>✕</Text>', 'CloseIcon', None, 18, 'close'),
    (r'<Text style=\{styles\.(chipRemove|filterChipGlyph|addTextActive)\}>✕</Text>', 'CloseIcon', None, 16, 'close'),
    (r'<Text style=\{styles\.(check|checkmark|glyph)\}>✓</Text>', 'CheckIcon', None, 16, 'check'),
    (r'<Text style=\{styles\.(\w+)\}>\{([^}]*?) \? \'▾\' : \'▸\'\}</Text>', 'ChevronIcon', 'fold', 14, 'fold'),
    (r'<Text style=\{styles\.(\w+)\}>\{([^}]*?) \? \'▸\' : \'▾\'\}</Text>', 'ChevronIcon', 'fold', 14, 'fold'),
    (r'<Text style=\{styles\.(\w+)\}>\{([^}]*?) \? \'⌄\' : \'›\'\}</Text>', 'ChevronIcon', 'fold', 14, 'fold'),
]

# The colour a glyph style declared: a palette role, a local palette alias, or a literal.
COLOR = re.compile(r"(\w+):\s*\{[^}]*color:\s*(palette\.\w+|p\.\w+|'#[0-9a-fA-F]{3,8}')")


def style_colors(source: str) -> dict[str, str]:
    colors = {name: color for name, color in COLOR.findall(source)}
    # A literal has to reach the icon as a string expression, not as bare CSS.
    return {name: color if not color.startswith("'") else f'"{color.strip(chr(39))}"'
            for name, color in colors.items()}


def icon(spec, direction, size, color, conditional):
    if spec == 'ChevronIcon':
        if direction == 'fold':
            return (f'<ChevronIcon direction={{{conditional} ? \'down\' : \'right\'}} '
                    f'size={{{size}}} color={{{color}}} />')
        return f'<ChevronIcon direction="{direction}" size={{{size}}} color={{{color}}} />'
    return f'<{spec} size={{{size}}} color={{{color}}} />'


def rewrite(path: Path, write: bool) -> tuple[int, list[str]]:
    source = path.read_text()
    colors = style_colors(source)
    out = source
    count = 0
    problems = []
    for pattern, spec, direction, size, label in RULES:
        for match in re.finditer(pattern, source):
            style = match.group(1)
            color = colors.get(style)
            if color is None:
                problems.append(f'{path.relative_to(ROOT)}: {label} style `{style}` has no colour')
                continue
            conditional = match.group(2) if match.lastindex and match.lastindex >= 2 else None
            replacement = icon(spec, direction, size, color, conditional)
            out = out.replace(match.group(0), replacement)
            count += 1
    if write and count:
        path.write_text(out)
    return count, problems


if __name__ == '__main__':
    write = '--write' in sys.argv
    total = 0
    all_problems = []
    for file in sorted((ROOT / 'src').rglob('*.tsx')):
        if '__tests__' in file.parts:
            continue
        count, problems = rewrite(file, write)
        total += count
        all_problems.extend(problems)
    print(f'{total} rewrite(s)' + ('' if write else ' (dry pass)'))
    for problem in all_problems:
        print('SKIP', problem)
