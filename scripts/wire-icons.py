#!/usr/bin/env python3
"""Wires the icons the glyph pass introduced: the import, and the palette the colour needs.

`components/icons.tsx` is one module; a file that now draws a vector needs it imported, and a file
that passes `palette.textFaint` needs the palette in scope. Both are read from what the file already
uses (`useThemedStyles`), never guessed.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = {'ChevronIcon', 'CloseIcon', 'CheckIcon', 'MenuIcon', 'MoreIcon', 'PlusIcon'}


def relative_icons(path: Path) -> str:
    depth = len(path.relative_to(ROOT / 'src').parts) - 1
    return '../' * (depth + 1) * 0 + ('../components/icons' if depth == 0 else '../' * depth + 'components/icons')


def fix(path: Path, write: bool) -> list[str]:
    source = path.read_text()
    used = {name for name in ICONS if f'<{name} ' in source}
    if not used:
        return []
    notes = []
    out = source

    has_import = re.search(r"from '([./]*)components/icons'", out)
    if not has_import:
        existing = re.search(r"^import \{([^}]*)\} from '([./]*(?:\.\./)*components)/(\w+)';$", out, re.M)
        target = relative_icons(path)
        names = ', '.join(sorted(used))
        out = f"import {{ {names} }} from '{target}';\n" + out
        notes.append(f'{path.relative_to(ROOT)}: import {names} from {target}')
    else:
        clause = re.search(r"import \{([^}]*)\} from '([./]*(?:\.\./)*components)/icons';", out)
        current = {n.strip() for n in clause.group(1).split(',') if n.strip()}
        missing = used - current
        if missing:
            merged = ', '.join(sorted(current | used))
            out = out.replace(clause.group(0), f"import {{ {merged} }} from '{clause.group(2)}/icons';")
            notes.append(f'{path.relative_to(ROOT)}: +{", ".join(sorted(missing))} to the icons import')

    # A file that passes a palette role needs the palette in scope.
    if re.search(r'color=\{palette\.', out) and not re.search(r'\bconst \{[^}]*palette[^}]*\} = useTheme\(\)', out):
        if 'useThemedStyles' not in out:
            notes.append(f'{path.relative_to(ROOT)}: NO useThemedStyles, palette unresolved')
        else:
            theme_import = re.search(r"import \{([^}]*)\} from '([./]*(?:\.\./)*theme)';", out)
            names = {n.strip() for n in theme_import.group(1).split(',') if n.strip()}
            if 'useTheme' not in names:
                merged = ', '.join(sorted(names | {'useTheme'}))
                out = out.replace(theme_import.group(0), f"import {{ {merged} }} from '{theme_import.group(2)}';")
                notes.append(f'{path.relative_to(ROOT)}: +useTheme')
            # Read it once, at the top of the component that draws the page.
            anchor = re.search(r'^(\s*)const styles = useThemedStyles\(createStyles\);\n', out, re.M)
            if anchor is None:
                notes.append(f'{path.relative_to(ROOT)}: NO useThemedStyles call, palette unresolved')
            else:
                indent = anchor.group(1)
                out = out.replace(anchor.group(0), f'{anchor.group(0)}{indent}const {{ palette }} = useTheme();\n', 1)
                notes.append(f'{path.relative_to(ROOT)}: palette read from useTheme')

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
