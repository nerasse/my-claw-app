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
