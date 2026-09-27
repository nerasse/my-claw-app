/**
 * The geometry between a finger on the picture and a point on the page. Pure, so the one part of
 * the live view that has to be exact is tested without a device.
 */

/** The picture's zoom: scaled around its top left corner, then moved. */
export interface View2D {
  scale: number;
  tx: number;
  ty: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Where a point of the box falls on the page, as fractions of it; undefined off the picture. */
export function contentPoint(p: { x: number; y: number }, view: View2D, box: Size): { x: number; y: number } | undefined {
  if (box.width <= 0 || box.height <= 0) return undefined;
  const x = (p.x - view.tx) / view.scale / box.width;
  const y = (p.y - view.ty) / view.scale / box.height;
  if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return undefined;
  return { x, y };
}

/**
 * A finger's move, as the wheel that scrolls the page the same way: the page follows the finger
 * (a finger going up scrolls down), by as many page pixels as the finger crossed on the picture.
 */
export function wheelDelta(dx: number, dy: number, scale: number, box: Size, page: Size): { dx: number; dy: number } {
  if (box.width <= 0 || page.width <= 0) return { dx: 0, dy: 0 };
  const k = page.width / (box.width * scale);
  return { dx: -dx * k, dy: -dy * k };
}

/** A zoomed picture never leaves an empty edge inside the box. */
export function clampView(view: View2D, box: Size): View2D {
  const scale = Math.max(1, view.scale);
  const minX = box.width * (1 - scale);
  const minY = box.height * (1 - scale);
  return { scale, tx: Math.min(0, Math.max(minX, view.tx)), ty: Math.min(0, Math.max(minY, view.ty)) };
}

/** A DOM keyboard event, as the page should get it: text, a named key with its modifiers, or nothing. */
export function keyInput(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}):
  | { kind: 'text'; text: string }
  | { kind: 'key'; key: string; modifiers?: Array<'Alt' | 'Control' | 'Meta' | 'Shift'> }
  | undefined {
  if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Alt' || e.key === 'Shift' || e.key === 'Dead' || e.key === 'Unidentified') {
    return undefined;
  }
  const chord = e.ctrlKey || e.metaKey || e.altKey;
  // A printable character typed alone, accents and AltGr included, is text: the page's field gets
  // it as the character, whatever keyboard layout the owner has.
  if (e.key.length === 1 && !chord) return { kind: 'text', text: e.key };
  // AltGr: Windows reports it as Control+Alt, macOS as Alt. Either way the key is the character
  // it produced ("@" on a French layout), not a shortcut.
  if (e.key.length === 1 && e.altKey && !e.metaKey) return { kind: 'text', text: e.key };
  const modifiers: Array<'Alt' | 'Control' | 'Meta' | 'Shift'> = [];
  if (e.ctrlKey) modifiers.push('Control');
  if (e.metaKey) modifiers.push('Meta');
  if (e.altKey) modifiers.push('Alt');
  if (e.shiftKey && (e.key.length > 1 || chord)) modifiers.push('Shift');
  const key = e.key === ' ' ? 'Space' : e.key;
  if (!/^[A-Za-z0-9]{1,12}$|^[!-~]$/.test(key)) return undefined;
  return modifiers.length ? { kind: 'key', key, modifiers } : { kind: 'key', key };
}

/**
 * What a native text field's change means for the page: the characters that went, then the ones
 * that came. A keyboard's autocorrect rewrites a word in one change, so the common start is kept
 * and only the rest replayed.
 */
export function textEdit(before: string, after: string): { erase: number; insert: string } {
  let same = 0;
  while (same < before.length && same < after.length && before[same] === after[same]) same++;
  return { erase: before.length - same, insert: after.slice(same) };
}
