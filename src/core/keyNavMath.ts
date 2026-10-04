/**
 * Where a key moves the focus in a column of items -- the arithmetic of keyNav.web.ts, kept apart
 * so it is tested without a DOM. `index` is -1 when the focus is not in the column yet: the first
 * key then enters it, at the top going down and at the bottom going up.
 */
export function nextIndex(
  key: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End' | 'Tab',
  { count, index, wrap, shift = false }: { count: number; index: number; wrap: boolean; shift?: boolean },
): number {
  const last = count - 1;
  switch (key) {
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'Tab':
      if (index < 0) return shift ? last : 0;
      return (index + (shift ? -1 : 1) + count) % count;
    case 'ArrowDown':
    case 'ArrowUp': {
      const down = key === 'ArrowDown';
      if (index < 0) return down ? 0 : last;
      const next = index + (down ? 1 : -1);
      if (next >= 0 && next <= last) return next;
      // Past an end: a menu goes round, a page stays where it is.
      return wrap ? (next + count) % count : index;
    }
  }
}

/** The row a letter jumps to: the next one after the focus whose text starts with it, round. */
export function letterJump(texts: string[], index: number, letter: string): number {
  const lower = letter.toLowerCase();
  for (let step = 1; step <= texts.length; step++) {
    const i = (index + step + texts.length) % texts.length;
    if (texts[i]!.trim().toLowerCase().startsWith(lower)) return i;
  }
  return -1;
}
