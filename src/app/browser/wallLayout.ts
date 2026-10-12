import { space } from '../../theme';

/**
 * The grid a wall of live tiles takes in the pane it was given -- docs/browser-live.md in the
 * server repo.
 *
 * A tile is the page's own viewport, so its shape is the browser's and not 16/9: the page inside a
 * 1920x1080 window is 1919x958 (the window's chrome takes the rest), and a tile box assumed 16/9
 * draws every picture 13% taller than the page it shows. Faces, circles and text all lean over.
 */

/** A tile narrower than this is a thumbnail: the wall takes one column fewer instead. */
const TILE_MIN_WIDTH = 210;
/**
 * A tile is never drawn wider than the picture that fills it: the browser sends 640 px tiles and
 * 1280 px ones (`CAST_PRESETS`), and a picture stretched past its own size reads as a blurry tile,
 * which is worse than a smaller one. In device pixels, so the wall is the same on a 3x phone.
 */
const TILE_MAX_PIXELS = 1280;
/** Where a tile's picture stops and its caption starts: two lines at `font.small` and padding. */
const CAPTION_HEIGHT = 52;
/** Past this many device pixels a tile asks for the large preset rather than the small one. */
const TILE_LARGE_PIXELS = 640;
/**
 * Two grids whose tiles are within this of each other are the same size to the eye, and the wall
 * takes the shorter one. Without it a 4K screen stacks two windows in a column for 2% more tile.
 */
const TILE_SIZE_SLACK = 0.1;
/** A pane whose browser has not sent a picture yet: a desktop page, roughly. */
export const DEFAULT_RATIO = 16 / 9;

export interface WallLayout {
  /** A tile's width in points, or '100%' before the pane has been measured. */
  tileWidth: number | '100%';
  /** The picture size a tile asks the server for: never one drawn past its own size. */
  quality: 'tile' | 'tile-large';
  /** Room above the grid, so a wall that fits a screen-sized pane sits in it. */
  padTop: number;
}

/**
 * The columns, the tile width and the room to leave above, for `count` tiles in a pane.
 *
 * A tile is watched, so a wall takes the biggest tiles that fit the room: that is what makes six
 * windows on a desk take three columns and two rows instead of one row of thumbnails with two
 * thirds of the pane empty under them. Among the grids whose tiles are that big within a tenth,
 * the fewest rows win: a 4K screen has room to stack two windows in a column, which is 2% more
 * tile and a wall nobody expects. No grid fits: the widest, which is the least scrolling.
 */
export function wallLayout(input: {
  /** How many windows the wall shows. */
  count: number;
  /** The pane's width, in points. */
  width: number;
  /** The room from the top of the wall to the bottom of the pane, in points. */
  room: number;
  /** The page's shape, as the browser's own pictures state it. */
  ratio: number;
  /** The device's pixel ratio: a tile's picture is asked for in device pixels. */
  pixelRatio: number;
}): WallLayout {
  const { count, width, room, ratio, pixelRatio } = input;
  // Before the pane is measured: one tile per row, at the size a device is given anyway.
  if (count <= 0 || width <= 0) return { tileWidth: '100%', quality: 'tile', padTop: 0 };

  const maxWidth = TILE_MAX_PIXELS / pixelRatio;
  const grid = (columns: number): { tileWidth: number; rows: number; height: number } => {
    const tileWidth = Math.min((width - space.md * (columns - 1)) / columns, maxWidth);
    const rows = Math.ceil(count / columns);
    return { tileWidth, rows, height: rows * (tileWidth / ratio + CAPTION_HEIGHT) + space.md * (rows - 1) };
  };

  const most = Math.max(1, Math.min(count, Math.floor((width + space.md) / (TILE_MIN_WIDTH + space.md))));
  const grids = Array.from({ length: most }, (_, i) => grid(most - i)).filter(g => g.height <= room);
  const widest = grids.reduce((best, g) => (g.tileWidth > best.tileWidth ? g : best), grid(most));
  const chosen = grids
    .filter(g => g.tileWidth >= widest.tileWidth * (1 - TILE_SIZE_SLACK))
    .reduce((best, g) => (g.rows < best.rows || (g.rows === best.rows && g.tileWidth > best.tileWidth) ? g : best), widest);

  return {
    tileWidth: chosen.tileWidth,
    quality: chosen.tileWidth * pixelRatio > TILE_LARGE_PIXELS ? 'tile-large' : 'tile',
    // A pane wider than it is tall is a screen for a wall, which sits in it rather than hugging the
    // top edge with a hole under it. A tall pane is a phone's list of tiles: it starts at the top.
    padTop: width > room ? Math.max(0, (room - chosen.height) / 2) : 0,
  };
}
