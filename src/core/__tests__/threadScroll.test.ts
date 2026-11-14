/**
 * The two geometries of a thread, and the arithmetic both scroll handlers share.
 *
 * The bug this pins: the web list stopped being inverted (a browser selects text in DOM order, and
 * an inverted DOM runs backwards from what the reader sees, so a drag over several bubbles started
 * at the bottom of a frame and could snap to the whole thread). "Which end is the newest message"
 * is now a parameter, and three handlers ask it -- the scroll listener, the end of a gesture, and
 * the anchor a prepended page needs. Each of them with its own sign is how one end quietly stops
 * working, so they all read from here.
 */

import { NEAR_NEWEST_PX, nearNewest, prependShift } from '../threadScroll';

describe('nearNewest', () => {
  const INVERTED = true;
  const READING_ORDER = false;

  it('reads the newest message at offset 0 when the list is inverted', () => {
    expect(nearNewest({ offset: 0, viewport: 600, content: 4000 }, INVERTED)).toBe(true);
    expect(nearNewest({ offset: NEAR_NEWEST_PX, viewport: 600, content: 4000 }, INVERTED)).toBe(true);
    expect(nearNewest({ offset: NEAR_NEWEST_PX + 1, viewport: 600, content: 4000 }, INVERTED)).toBe(false);
  });

  it('reads it at the end of the range when the list runs in reading order', () => {
    const max = 4000 - 600;
    expect(nearNewest({ offset: max, viewport: 600, content: 4000 }, READING_ORDER)).toBe(true);
    expect(nearNewest({ offset: max - NEAR_NEWEST_PX, viewport: 600, content: 4000 }, READING_ORDER)).toBe(true);
    expect(nearNewest({ offset: max - NEAR_NEWEST_PX - 1, viewport: 600, content: 4000 }, READING_ORDER)).toBe(false);
  });

  it('calls a thread that does not fill the screen "at the newest message" either way', () => {
    // No scroll range: both ends are the same place, and the trim is allowed.
    expect(nearNewest({ offset: 0, viewport: 800, content: 300 }, INVERTED)).toBe(true);
    expect(nearNewest({ offset: 0, viewport: 800, content: 300 }, READING_ORDER)).toBe(true);
  });
});

describe('prependShift', () => {
  it('is the height a page added above the reader', () => {
    expect(prependShift(1200, 2400)).toBe(1200);
  });

  it('is zero when nothing arrived, so a stale anchor cannot move the list', () => {
    expect(prependShift(1200, 1200)).toBe(0);
    expect(prependShift(1200, 800)).toBe(0);
  });
});
