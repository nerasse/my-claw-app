/**
 * The column: one rail, one axis, at every font scale.
 *
 * The dots were reported off-centre three times, twice to the right and once to the left, and each
 * time the numbers looked right at scale 1. They were three independent `Math.round`s: the rail's
 * centre landed on a half pixel one way and an even dot's edges rounded another, so the dot was
 * snapped half a device pixel off. These are the invariants that make that impossible.
 */

import { spine, ROW_GAP, ROW_SLOT, ROW_TEXT } from '../spine';

describe('the spine geometry', () => {
  const scales = Array.from({ length: 111 }, (_, i) => 0.7 + i * 0.01);

  it('centres the dot on the rail exactly, at every font scale', () => {
    for (const scale of scales) {
      const g = spine(scale);
      expect(g.dotLeft + g.dot / 2).toBe(g.railCentre);
    }
  });

  it('never puts a dot edge or the rail on a half pixel', () => {
    for (const scale of scales) {
      const g = spine(scale);
      expect(Number.isInteger(g.dotLeft)).toBe(true);
      expect(Number.isInteger(g.dot)).toBe(true);
      expect(Number.isInteger(g.railLeft)).toBe(true);
    }
  });

  it('keeps the dot and the header slot odd, which is what holds the half pixel', () => {
    for (const scale of scales) {
      const g = spine(scale);
      expect(g.dot % 2).toBe(1);
      expect(g.slot % 2).toBe(1);
    }
  });

  it('centres the header chevron on the rail as well', () => {
    for (const scale of scales) {
      const g = spine(scale);
      // The slot is flush with the group's left edge, so it has no inset of its own.
      expect(g.slot / 2).toBe(g.railCentre);
    }
  });

  it('centres the dot vertically on the row it belongs to', () => {
    for (const scale of scales) {
      const g = spine(scale);
      const centre = g.dotTop + g.dot / 2;
      expect(Math.abs(centre - g.head / 2)).toBeLessThanOrEqual(0.5);
    }
  });

  it('puts a row label, and the output under it, on one column', () => {
    // The aside's chevron is the slot, plus a 4 pt gap; a dense row reuses both, so the two kinds of
    // child start their text at the same place instead of a few points apart.
    expect(ROW_TEXT).toBe(ROW_SLOT + ROW_GAP);
    expect(spine(1).slot).toBe(ROW_SLOT);
  });

  /**
   * The group starts where a message's first letter starts.
   *
   * Reported four times as "the dots are a few pixels to the right of the start of the sentences".
   * The cause was not rounding: a dot is centred on the rail, so with the group flush against the
   * column its 7 pt circle began 3 pt in, and the chevron -- centred in a 13 pt slot, its ink
   * starting at 7.8/24 of that box -- began 4.2 pt in. The group now reaches back by the dot's own
   * inset, which puts the dot's left edge -- the leftmost ink of a row, and one per row -- exactly
   * on the prose column.
   */
  it('puts the dot exactly on the prose column, at every scale', () => {
    for (const scale of scales) {
      const g = spine(scale);
      expect(g.inset).toBe(g.dotLeft);
      // In the thread's coordinates, after the group's pull.
      expect(g.dotLeft - g.inset).toBe(0);
    }
  });

  /**
   * The chevron sits right behind it, and cannot be brought to zero.
   *
   * It is centred in its slot so that its centre shares the rail with the dots, and its ink starts
   * at 7.8/24 of the box: pulling the whole group by that instead would push the dot to a negative
   * offset, outside the row. Two and a half points at the largest scale is inside the stroke's own
   * width, and it is a third of the 4.2 the owner was seeing before the pull.
   */
  it('leaves the chevron within 2.5 pt of that column, never at a negative offset', () => {
    for (const scale of scales) {
      const g = spine(scale);
      const chevronInk = (g.slot * 7.8) / 24 - g.inset;
      expect(chevronInk).toBeGreaterThanOrEqual(0);
      expect(chevronInk).toBeLessThanOrEqual(2.5);
    }
  });

  it('keeps the whole column reachable at a negative margin, never a lie about its width', () => {
    // `inset` is a pull, not a padding: the group's right edge must not move with it.
    for (const scale of scales) expect(spine(scale).inset).toBeGreaterThanOrEqual(0);
  });

  it('starts a child of a run on the label column, not past it', () => {
    // A bar's count and a child's name sit on the same x: the gutter is the label column, and the
    // dot's rail is what the fold marks are centred on (owner, 2026-11-13).
    for (const scale of [1, 1.2, 0.9]) expect(spine(scale).gutter).toBe(Math.round(ROW_TEXT * scale));
  });

  it('does not drift with the scale it is read at', () => {
    // Two neighbouring scales used to give dot centres half a pixel apart; the column must not
    // depend on where the slider sits.
    const a = spine(1);
    const b = spine(1.01);
    expect(a.railCentre - a.dotLeft - a.dot / 2).toBe(0);
    expect(b.railCentre - b.dotLeft - b.dot / 2).toBe(0);
  });
});
