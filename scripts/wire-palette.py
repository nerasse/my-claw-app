#!/usr/bin/env python3
"""Puts `const { palette } = useTheme();` in the function that actually draws the icon.

Several pages are one file holding a screen and its rows, each with its own `useThemedStyles`
call. A palette read at the top of the wrong one compiles and then fails at run time on the first
row, so the hook goes in the nearest enclosing `function` of each unresolved use.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def enclosing_function(source: str, index: int) -> tuple[int, int, str] | None:
    """The `function` whose body contains `index`, with the indentation of its first statement."""
    header = None
    for match in re.finditer(r'^(?:export )?(?:default )?function \w+|^(?:export )?const \w+ =|^\s*function \w+', source[:index], re.M):
        header = match
    if header is None:
        return None
    line_start = source.rfind('\n', 0, header.start()) + 1
    line_end = source.find('\n', header.start())
    return line_start, line_end, source[line_start:line_end]


def fix(path: Path, write: bool) -> list[str]:
    source = path.read_text()
    if 'color={palette.' not in source and 'color={p.' not in source:
        return []
    notes = []
    out = source

    # A local alias (`const { palette: p } = useTheme()`-less files) resolves through `p`.
    for token in ('palette', 'p'):
        for match in list(re.finditer(rf'color=\{{{token}\.(\w+)\}}', out)):
            if token == 'palette' and re.search(r'const \{[^}]*\bpalette\b[^}]*\} = useTheme\(\)', out[:match.start()].split('\n')[-1] if False else out):
                continue
            position = match.start()
            before = out[:position]
            if token == 'palette' and re.search(r'\bconst \{[^}]*\bpalette\b[^}]*\} = useTheme\(\)', before):
                continue
            target = enclosing_function(out, position)
            if target is None:
                notes.append(f'{path.relative_to(ROOT)}: no enclosing function for {token}.{match.group(1)}')
                continue
            line_start, line_end, header = target
            body_start = out.find('{', line_end)
            if body_start == -1 or body_start > position:
                notes.append(f'{path.relative_to(ROOT)}: {header.strip()[:40]} has no body before the use')
                continue
            # Read the palette at the top of that body, once.
            segment = out[body_start:position]
            if re.search(r'const \{[^}]*\b' + token + r'\b[^}]*\} = useTheme\(\)', segment):
                continue
            first_line_end = out.find('\n', body_start)
            indent = re.match(r'\n(\s*)', out[first_line_end:]).group(1) if re.match(r'\n(\s*)', out[first_line_end:]) else '  '
            declaration = f'\n{indent}const {{ palette }} = useTheme();'
            out = out[:first_line_end] + declaration + out[first_line_end:]
            notes.append(f'{path.relative_to(ROOT)}: palette in {header.strip()[:50]}')

    if write and out != source:
        path.write_text(out)
    return notes


if __name__ == '__main__':
    write = '--write' in sys.argv
    for file in sorted((ROOT / 'src').rglob('*.tsx')):
        if '__tests__' in file.parts:
            continue
        for note in fix(file, write):
            print(note)
