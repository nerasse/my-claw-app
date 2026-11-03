import { READING_WIDTH, TOOL_WIDTH, conversationColumn, isDrawerSwipe } from '../layout';

/**
 * The thread and the composer are one column.
 *
 * They were two numbers once: the rows capped at one width, the input at another, and the input
 * sat a few points off-centre on every wide window. Nothing failed, because no test measured
 * both -- so the invariant is a function now, and this is what runs on it.
 */
const WIDTHS = [360, 400, 720, 1080, 1280, 1440, 1920, 2560];

describe('the conversation column', () => {
  test.each(WIDTHS)('is one width for the rows and the composer at %ipt', width => {
    const rows = conversationColumn(Math.min(width, READING_WIDTH));
    const composer = conversationColumn(Math.min(width, READING_WIDTH));
    expect(composer).toEqual(rows);
    expect(rows.maxWidth).toBeLessThanOrEqual(width);
    expect(rows.alignSelf).toBe('center');
  });

  test('a phone gets the pane, a desktop gets the measure', () => {
    expect(conversationColumn(Math.min(400, READING_WIDTH)).maxWidth).toBe(400);
    expect(conversationColumn(Math.min(1920, READING_WIDTH)).maxWidth).toBe(READING_WIDTH);
  });

  test('there is one row width, not two', () => {
    // A card and a bubble start at the same x. Two caps put their edges 60 pt apart and a thread
    // read as misaligned -- the plan's "cards are data, give them room" measured the wrong pair.
    expect(TOOL_WIDTH).toBe(READING_WIDTH);
    // ...and still not a 1160 column defended as a reading decision.
    expect(READING_WIDTH).toBeLessThan(1200);
  });
});

describe('the swipe that opens the conversation list', () => {
  test('a rightward, mostly horizontal drag opens it', () => {
    expect(isDrawerSwipe(120, 10, false)).toBe(true);
  });

  test('a thumb resting or scrolling does not', () => {
    expect(isDrawerSwipe(20, 4, false)).toBe(false);
    // A vertical scroll that drifts: the thread must keep it.
    expect(isDrawerSwipe(70, 90, false)).toBe(false);
    // ...and the other way is not a gesture at all.
    expect(isDrawerSwipe(-120, 10, false)).toBe(false);
  });

  test('the list is already a column on a desktop: a swipe there is a selection', () => {
    expect(isDrawerSwipe(200, 5, true)).toBe(false);
  });
});
