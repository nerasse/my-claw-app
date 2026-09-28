import { menuPosition } from '../OverlayHost';

const window = { width: 1280, height: 800 };
const origin = { x: 0, y: 0 };

describe('menuPosition', () => {
  it('hangs under the arrow, its right edge on the arrow\'s', () => {
    expect(menuPosition({ x: 1000, y: 40, width: 36, height: 36 }, origin, window, 90)).toEqual({ left: 1036 - 240, top: 80 });
  });

  it('stays inside the window at either edge', () => {
    expect(menuPosition({ x: 10, y: 40, width: 36, height: 36 }, origin, window, 90).left).toBe(8);
    expect(menuPosition({ x: 1270, y: 40, width: 36, height: 36 }, origin, window, 90).left).toBe(1280 - 240 - 8);
  });

  it('opens upward when the room below is too short, and not past the top', () => {
    expect(menuPosition({ x: 1000, y: 740, width: 36, height: 36 }, origin, window, 90)).toEqual({ left: 796, top: 740 - 4 - 90 });
    // No room above either: it stays below, where it can at least be scrolled to.
    expect(menuPosition({ x: 1000, y: 60, width: 36, height: 36 }, origin, { width: 1280, height: 150 }, 90).top).toBe(100);
  });

  it('reads the arrow in the window and places the menu in the host, which may start lower', () => {
    expect(menuPosition({ x: 1000, y: 100, width: 36, height: 36 }, { x: 0, y: 24 }, window, 90).top).toBe(100 - 24 + 36 + 4);
  });
});
