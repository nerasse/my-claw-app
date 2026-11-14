/**
 * Where the newest message sits, in the coordinates of a thread list.
 *
 * One thread, two geometries. On a phone the list is inverted: `offset 0` is the bottom and the
 * newest message, which is what makes a conversation open on its last message with no scrolling
 * and no content height to estimate. A browser cannot do that. An inverted list there is a DOM
 * order that runs backwards from the visual one -- newest first, drawn from the bottom under a
 * `scaleY(-1)` -- and a browser selects text in DOM order, so a drag over several bubbles starts
 * at the wrong end, arcs the wrong way, and can snap to the whole thread. The web keeps the
 * document in reading order and anchors itself on the other end instead (`ChatScreen`, `pinned`).
 *
 * Every question of the form "is the reader at the newest message" goes through this module, so
 * the two geometries cannot drift apart in three different scroll handlers.
 */

/** How close to the newest message counts as "following it". The jump pill and the trim share it. */
export const NEAR_NEWEST_PX = 120;

export interface ScrollGeometry {
  offset: number;
  viewport: number;
  content: number;
}

/**
 * Whether the reader is close enough to the newest message to be following it.
 *
 * Inverted, the newest message is offset 0 and the reader approaches it from above. The other way
 * round, it is the end of the range: the last screenful counts, and the content still growing
 * below a reader parked at the bottom is not a reason to say they left.
 */
export function nearNewest(geometry: ScrollGeometry, inverted: boolean, slack = NEAR_NEWEST_PX): boolean {
  return inverted
    ? geometry.offset <= slack
    : geometry.offset + geometry.viewport >= geometry.content - slack;
}

/**
 * How far a page of older messages, inserted above the reader, moved the rows already on screen.
 *
 * The inverted list hands this job to `maintainVisibleContentPosition`, which is native. Without
 * the inversion the page lands above everything visible, so the offset has to absorb its height or
 * the reader is thrown one page away from where they were reading.
 */
export function prependShift(contentBefore: number, contentAfter: number): number {
  return Math.max(contentAfter - contentBefore, 0);
}
