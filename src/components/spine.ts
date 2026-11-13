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
 *
 * The slot is also the fold mark's box, and it starts at the group's own left edge -- the same x a
 * message's first letter takes, and the same x a reasoning line's chevron takes. Three left edges
 * used to sit within 4 pt of each other and read as three columns (owner, 2026-11-12).
 */

/** A row's fold mark. 13 is the chevron every foldable row draws, so a bar, a reasoning line, a
 * sub-agent and a tool row put their label on the same column. */
export const ROW_SLOT = 13;
/** The gap between a row's chevron slot and its label: `space.xs`, the aside's own. */
export const ROW_GAP = 4;
/** Where a row's label starts, from the row's own left edge. */
export const ROW_TEXT = ROW_SLOT + ROW_GAP;

/** A row's head line. The dot is centred on it. */
const HEAD = 27;
/** Where a child's content starts, from the group's left edge. The label column: a bar's count and
 * a child's name or aside label all start here, so the column has one text edge. */
const GUTTER = ROW_TEXT;
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
  /**
   * How far the group hangs back so its leftmost mark starts the prose column: the dot's inset.
   *
   * A dot is centred on the rail, so against a flush edge its 7 pt circle began 3 pt in, and the
   * chevron -- centred in a 13 pt slot, its ink starting at 7.8/24 of that box -- began 4.2 pt in.
   * Both therefore sat to the right of the column a message's first letter takes, which is the
   * offset reported four times (last: 2026-11-13, "les fleches, les points ... decales un peu sur
   * la droite par rapport au debut des phrases").
   *
   * The marks cannot be nudged one by one -- a chevron and a dot have to share the rail, and
   * centring each on it is what makes them agree -- so the group is pulled back by this instead.
   * The dot's left edge then lands exactly on the prose column, and the chevron's ink within a
   * point of it at normal scale. Every invariant here still holds; the column just starts where
   * the text does.
   */
  inset: number;
}

export function spine(scale: number): SpineGeometry {
  const slot = odd(ROW_SLOT * scale, ROW_SLOT);
  // The slot starts at the group's left edge, so its centre is the rail's: no inset, or the bar's
  // chevron sits a couple of points right of the message column it should start on.
  const railLeft = (slot - 1) / 2;
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
    inset: railCentre - dot / 2,
  };
}
