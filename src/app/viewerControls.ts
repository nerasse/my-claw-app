/**
 * The bars a full-screen viewer shows over a picture, and what brings them back.
 *
 * They were tap-to-toggle only, which is the phone's convention: a tap on the picture flips the
 * chrome, and on a touch screen there is no other pointer to ask. On a desktop it left the bars
 * gone for good -- the click that *could* bring them back is also the click that zooms or starts a
 * pan, and moving the mouse over the screen, the one gesture every lightbox answers to, did
 * nothing (owner, 2026-09-17). So they now follow a single rule, on both platforms: anything that
 * says somebody is there reveals them, and only idleness hides them.
 *
 * A decision function rather than a reducer, and that is deliberate: a mouse crossing the screen
 * fires dozens of events a second, and a state update per event would re-render the zoomable
 * picture dozens of times a second. The viewer keeps the last activity in a ref (no render) and
 * asks this function on a one-second tick whether the bars should still be up.
 *
 * Kept out of the component so it is testable without a DOM: the web build, the native one and
 * the tests all read the same rule from here.
 */

/** How long the bars stay once nothing happens to them. */
export const VIEWER_IDLE_MS = 5000;

/** The tick the viewer's timer runs on. */
export const VIEWER_TICK_MS = 1000;

export interface ViewerControlsState {
  /** Whether the bars are up right now. */
  visible: boolean;
  /**
   * A pointer resting on the bars themselves. They hold while it is there: hiding the close
   * button from under a mouse that is about to press it is worse than staying open.
   */
  hovering: boolean;
  /** When the last activity was, read from a ref so dense moves cost no render. */
  lastActivityAt: number;
}

/**
 * What the bars should be, at `now`.
 *
 * Hovering wins over everything; a hidden set stays hidden until something reveals it (a tap, a
 * move, a key -- the viewer decides what counts and calls it activity); a visible set falls only
 * once the idle window has passed with nothing going on.
 */
export function viewerControlsVisible(state: ViewerControlsState, now: number): boolean {
  if (state.hovering) return true;
  if (!state.visible) return false;
  return now - state.lastActivityAt < VIEWER_IDLE_MS;
}
