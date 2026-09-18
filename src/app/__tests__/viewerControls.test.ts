/**
 * The bars over a full-screen picture, on a desktop.
 *
 * They were tap-to-toggle only, so on web they vanished five seconds in and nothing short of a
 * click -- which on a zoomable picture is also a zoom -- brought them back. The rule is now the
 * lightbox one: activity reveals, idleness hides, and a pointer resting on the bars holds them.
 */

import { viewerControlsVisible, VIEWER_IDLE_MS } from '../viewerControls';

const base = { visible: true, hovering: false, lastActivityAt: 10_000 };

describe('viewer controls', () => {
  it('keeps the bars up while the idle window has not passed', () => {
    expect(viewerControlsVisible(base, 10_000)).toBe(true);
    expect(viewerControlsVisible(base, 10_000 + VIEWER_IDLE_MS - 1)).toBe(true);
  });

  it('hides them once nothing has happened for the whole window', () => {
    expect(viewerControlsVisible(base, 10_000 + VIEWER_IDLE_MS)).toBe(false);
    expect(viewerControlsVisible(base, 60_000)).toBe(false);
  });

  it('stays hidden until something reveals them, however long the mouse waits', () => {
    const hidden = { ...base, visible: false };
    expect(viewerControlsVisible(hidden, 60_000)).toBe(false);
  });

  it('shows them for a pointer that arrived on the bars, even after a long idle', () => {
    expect(viewerControlsVisible({ visible: false, hovering: true, lastActivityAt: 0 }, 600_000)).toBe(true);
    expect(viewerControlsVisible({ visible: true, hovering: true, lastActivityAt: 0 }, 600_000)).toBe(true);
  });

  it('counts activity from the last move, not the first', () => {
    // A mouse that crosses the screen keeps pushing the deadline: the bars are still up at
    // twenty seconds because the last movement was one tick ago.
    const moved = { ...base, lastActivityAt: 20_000 };
    expect(viewerControlsVisible(moved, 20_500)).toBe(true);
    expect(viewerControlsVisible(moved, 20_000 + VIEWER_IDLE_MS)).toBe(false);
  });
});
