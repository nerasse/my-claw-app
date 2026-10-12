/**
 * The wall's grid.
 *
 * It is where three complaints met: pictures stretched past their own size on a wide screen, tiles
 * as big as half a page, and a wall that stopped a third of the way down with the height unused.
 * Every case here is a pane somebody has: the 460pt column beside a conversation, a phone, and a
 * 2560x1440 desk window with the browser page to itself.
 */

import { wallLayout, DEFAULT_RATIO } from '../browser/wallLayout';

/** The page's shape inside a 1920x1080 window: the window's own chrome takes the rest. */
const VIEWPORT_RATIO = 1919 / 958;

describe('wallLayout', () => {
  it('gives a phone one column, at the size it draws, and starts at the top', () => {
    const layout = wallLayout({ count: 2, width: 393, room: 640, ratio: VIEWPORT_RATIO, pixelRatio: 2.75 });

    expect(layout.tileWidth).toBe(393);
    // 393pt at 2.75x is 1080 device pixels: the small preset would be drawn at 1.7x.
    expect(layout.quality).toBe('tile-large');
    // A pane taller than it is wide is a list of tiles: it starts under the fields, like any list.
    expect(layout.padTop).toBe(0);
  });

  it('fills a desk pane with two tiles, at the size they are drawn', () => {
    const layout = wallLayout({ count: 2, width: 2521, room: 1085, ratio: VIEWPORT_RATIO, pixelRatio: 1 });

    expect(layout.columns).toBe(2);
    expect(layout.tileWidth).toBe(Math.floor((2521 - 10) / 2));
    expect(layout.quality).toBe('tile-large');
    // 1255x678 of a 2521x1085 pane: the height cannot be filled by two 2:1 pages side by side
    // without cropping them, so the grid sits in the pane instead of hugging its top edge.
    const grid = (1255 / VIEWPORT_RATIO + 52) * 1;
    expect(layout.padTop).toBeCloseTo((1085 - grid) / 2);
  });

  it('never draws a tile past the picture that fills it', () => {
    const one = wallLayout({ count: 1, width: 2521, room: 1085, ratio: VIEWPORT_RATIO, pixelRatio: 1 });

    // The largest picture a tile is streamed at: past it a tile reads as a blur, not a window.
    expect(one.tileWidth).toBe(1280);
    expect(one.quality).toBe('tile-large');
    // Capped, the tile is narrower than the pane: the wall centres what is left over.
    expect(one.padTop).toBeGreaterThan(0);
  });

  it('stacks two tiles in the pane beside a conversation rather than thumbnailing them', () => {
    const tall = wallLayout({ count: 2, width: 460, room: 700, ratio: VIEWPORT_RATIO, pixelRatio: 1 });
    const short = wallLayout({ count: 2, width: 460, room: 400, ratio: VIEWPORT_RATIO, pixelRatio: 1 });

    // Room for both, one above the other, at 460pt wide: two columns here would be 225pt pictures.
    expect(tall.tileWidth).toBe(460);
    expect(tall.quality).toBe('tile');
    // No room for two rows of 460: a pane wider than it is tall is a screen, and its tiles shrink
    // to fit it rather than scroll. Two rows of 286 beat two columns of 225 (the 0.6.145 answer).
    expect(short.columns).toBe(1);
    expect(short.tileWidth).toBe(286);
  });

  // The old grid put every window in one row as long as the width took it: six windows on a desk
  // were six 411pt thumbnails with two thirds of the pane empty under them.
  it('uses the height of a wide pane: six windows take three columns, not six', () => {
    const six = wallLayout({ count: 6, width: 2521, room: 1085, ratio: VIEWPORT_RATIO, pixelRatio: 1 });
    const oneRow = wallLayout({ count: 6, width: 2521, room: 260, ratio: VIEWPORT_RATIO, pixelRatio: 1 });

    expect(six.columns).toBe(3);
    expect(six.tileWidth).toBe(Math.floor((2521 - 20) / 3));
    expect(oneRow.columns).toBe(6);
    expect(oneRow.tileWidth).toBe(Math.floor((2521 - 50) / 6));
  });

  // 4K, or a tablet held upright: the height is there for two rows, and the tiles would be a
  // couple of percent bigger for it.
  it('takes the shorter wall when a taller one is no bigger', () => {
    const tall = wallLayout({ count: 2, width: 2521, room: 2100, ratio: VIEWPORT_RATIO, pixelRatio: 1 });
    const portrait = wallLayout({ count: 2, width: 820, room: 1100, ratio: VIEWPORT_RATIO, pixelRatio: 2 });

    // 2% more tile is not worth a column of windows on a screen 2521 wide.
    expect(tall.tileWidth).toBe(Math.floor((2521 - 10) / 2));
    // Upright, the same choice goes the other way: 640pt stacked is 60% more picture than two
    // columns of 405.
    expect(portrait.tileWidth).toBe(640);
  });

  it('keeps the widest grid when nothing fits, which is the least scrolling', () => {
    const layout = wallLayout({ count: 12, width: 2521, room: 300, ratio: VIEWPORT_RATIO, pixelRatio: 1 });

    expect(layout.columns).toBe(11);
    expect(layout.tileWidth).toBe(Math.floor((2521 - 100) / 11));
    expect(layout.padTop).toBe(0);
  });

  it('gives one tile per row before the pane has been measured', () => {
    const layout = wallLayout({ count: 3, width: 0, room: 0, ratio: VIEWPORT_RATIO, pixelRatio: 2 });

    expect(layout).toEqual({ columns: 1, tileWidth: '100%', quality: 'tile', padTop: 0 });
  });

  it('has no tile to lay out with no window', () => {
    expect(wallLayout({ count: 0, width: 2521, room: 1085, ratio: VIEWPORT_RATIO, pixelRatio: 1 }).tileWidth).toBe('100%');
  });

  // The owner's screen, 2026-10-13: three windows were one row of 839pt with half the pane empty.
  it('fits the tiles to the height of a screen, not only its width', () => {
    const three = wallLayout({ count: 3, width: 2538, room: 1118, ratio: VIEWPORT_RATIO, pixelRatio: 1 });
    const four = wallLayout({ count: 4, width: 2538, room: 1118, ratio: VIEWPORT_RATIO, pixelRatio: 1 });

    // Two by two, each tile as tall as half the room allows: 1005pt, against 839 in one row.
    expect(three).toMatchObject({ columns: 2, tileWidth: 1005 });
    expect(four).toMatchObject({ columns: 2, tileWidth: 1005 });
    const height = 2 * (1005 / VIEWPORT_RATIO + 52) + 10;
    expect(height).toBeLessThanOrEqual(1118);
  });

  it('keeps a phone a list as wide as it is, and lets it scroll', () => {
    const five = wallLayout({ count: 5, width: 393, room: 640, ratio: VIEWPORT_RATIO, pixelRatio: 2.75 });

    // Five tiles fitted to 640pt would be 136pt pictures: a phone scrolls a list of full-width ones.
    expect(five).toMatchObject({ columns: 1, tileWidth: 393, padTop: 0 });
  });

  // Whole points: tiles that filled a 2507.7pt pane to the fraction wrapped once the browser
  // rounded them, and two windows meant to sit side by side were drawn in a column.
  it('never sizes a row past the pane it is drawn in', () => {
    for (const width of [2507.7, 1999.9, 2400.45, 1366.5]) {
      const layout = wallLayout({ count: 2, width, room: 1100, ratio: VIEWPORT_RATIO, pixelRatio: 1 });
      expect(Number.isInteger(layout.tileWidth)).toBe(true);
      expect(layout.columns * (layout.tileWidth as number) + (layout.columns - 1) * 10).toBeLessThanOrEqual(width);
    }
  });

  // A tile is the page's own viewport: a box assumed 16/9 draws every picture 13% too tall, which
  // is what the wall did from 0.6.112 to 0.6.144.
  it('sizes the grid from the page\'s own shape, not 16/9', () => {
    const wide = wallLayout({ count: 2, width: 2521, room: 1085, ratio: VIEWPORT_RATIO, pixelRatio: 1 });
    const assumed = wallLayout({ count: 2, width: 2521, room: 1085, ratio: DEFAULT_RATIO, pixelRatio: 1 });

    expect(wide.padTop).toBeGreaterThan(assumed.padTop);
  });
});
