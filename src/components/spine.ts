/**
 * The column a run's work hangs from, derived once.
 *
 * Every number the group and its children need comes from here, because they were three separate
 * `Math.round`s and a font scale was enough to make them disagree: the rail's centre landed on a
 * half pixel one way, the dot's edges rounded another, and the dots read as "a few pixels to the
 * left, then to the right" depending on the scale set on the device.
 *
 * Two invariants carry the whole thing:
 *
 * 1. **The rail is one device pixel**, so its centre is at `x + 0.5`.
 * 2. **The slot and the dot are odd**, so their centre is `left + n + 0.5` for an integer `left`.
 *
 * With both, a dot's centre equals the rail's centre exactly, at any scale, and the arithmetic
 * stays in integers: no half-pixel ever reaches the compositor, which is what used to snap a dot
 * half a pixel off and read as a misalignment.
 */

/** The header's own left inset, before the chevron slot. Not scaled: it is a hairline of air. */
const HEADER_PAD = 2;
/** A row's chevron slot. 14 is `CollapsibleAside`'s chevron, so a tool row and a reasoning line
 * put their label on the same column. */
export const ROW_SLOT = 14;
/** The gap between a row's chevron slot and its label: `space.xs`, the aside's own. */
export const ROW_GAP = 4;
/** Where a row's label starts, from the row's own left edge. */
export const ROW_TEXT = ROW_SLOT + ROW_GAP;

/** A row's head line. The dot is centred on it. */
const HEAD = 27;
/** Where a child's content starts, from the group's left edge. */
const GUTTER = 28;
/** The dot's nominal diameter, before rounding to the nearest odd. */
const DOT = 7;

/** The nearest odd integer to `n`, at least `min`: an odd width has an integer left edge when it
 * is centred on `x.5`. */
const odd = (n: number, min: number): number => {
  const rounded = Math.max(min, Math.round(n));
  return rounded % 2 === 0 ? rounded - 1 : rounded;
};

export interface SpineGeometry {
  /** The header's chevron slot, odd so its centre is on a half pixel. */
  slot: number;
  /** The rail's left edge: an integer, its centre being `railLeft + 0.5`. */
  railLeft: number;
  /** The axis everything sits on. */
  railCentre: number;
  dot: number;
  dotLeft: number;
  dotTop: number;
  head: number;
  gutter: number;
}

export function spine(scale: number): SpineGeometry {
  const slot = odd(13 * scale, 7);
  // An odd slot in an even padding keeps the centre on a half pixel, which is where the 1 pt rail
  // can actually be drawn.
  const railLeft = HEADER_PAD + (slot - 1) / 2;
  const railCentre = railLeft + 0.5;
  const dot = odd(DOT * scale, 5);
  const head = Math.round(HEAD * scale);
  return {
    slot,
    railLeft,
    railCentre,
    dot,
    // dot / 2 is a half integer for an odd dot, so this is an integer: the dot's edges land on
    // device pixels and its centre on the rail's.
    dotLeft: railCentre - dot / 2,
    dotTop: Math.round((head - dot) / 2),
    head,
    gutter: Math.round(GUTTER * scale),
  };
}
