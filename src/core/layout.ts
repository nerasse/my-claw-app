import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { pointerFine } from './platform';
import { drawerColumnOf, usePanes } from './panes';

/**
 * How much room the window gives, expressed as decisions rather than pixels.
 *
 * The app was written phone-first: one screen at a time, everything else behind a drawer. That
 * shape is right at 400pt and wrong at 1600, where the same layout draws 200-character lines and
 * hides the conversation list behind a button on an empty half of the screen. Every widening is
 * driven from here so the rules live in one place, and keyed on the window rather than the
 * platform: a tablet in landscape is a small desktop, and a browser window dragged narrow is a
 * phone.
 */

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

/** Below this the phone layout is the only one that fits. */
const TABLET_MIN = 720;
/** A pinned drawer takes 360pt: under this the conversation would be squeezed to nothing. */
const DESKTOP_MIN = 1080;
/** A side pane costs another 420pt on top of the drawer and a readable conversation. */
const WIDE_MIN = 1440;

/**
 * A line of text stops being readable somewhere past 90 characters, whatever the window does.
 * The conversation is centred inside this instead of filling the pane.
 *
 * 1100, not 860: at 1920 the old cap filled 73 % of the pane and left a dead half, and at 15 pt
 * 1100 is still inside a comfortable measure. The cards (`TOOL_WIDTH`) stay at 980 -- the number
 * the POC argued for measures prose against the window, and mixing the two is how a 1160 column
 * was defended as a reading decision.
 */
export const READING_WIDTH = 1100;

/**
 * Does this drag open the conversation list?
 *
 * Rightwards, mostly horizontal, past a margin a thumb cannot hit by accident. The list only
 * opens this way where it is not already a column: on a desktop it is pinned, and a swipe there
 * would fight the text selection the same drag is for.
 *
 * Bubbling and not capture: a code block or a picture that scrolls sideways claims the gesture
 * first, which is what the reader of a wrapped diff means by dragging on it.
 */
export function isDrawerSwipe(dx: number, dy: number, pinnedDrawer: boolean): boolean {
  if (pinnedDrawer) return false;
  if (dx < 56) return false;
  // A vertical scroll that drifts right is a scroll, not a swipe.
  return Math.abs(dx) > Math.abs(dy) * 1.6;
}

/**
 * The one column a conversation is drawn in: its header, its rows and its composer.
 *
 * A function rather than a constant because the failure it prevents is two numbers drifting
 * apart -- the thread capped at one width and the composer at another, which reads as the input
 * being off-centre by a few points and is invisible in any single screen's test.
 */
export function conversationColumn(readingWidth: number): {
  maxWidth: number;
  width: '100%';
  alignSelf: 'center';
} {
  return { maxWidth: readingWidth, width: '100%', alignSelf: 'center' };
}

/**
 * Cap for a page of controls (settings, files, jobs). Wider than prose, because a row here is a
 * label and a value at opposite ends rather than a sentence, and narrower than the window,
 * because a 1600pt row makes the two ends unrelatable.
 */
export const PAGE_WIDTH = 980;

/**
 * Cap for a tool card, and for every row of a conversation.
 *
 * It used to be 980 against prose's 860: cards wider than bubbles, which put their left edges
 * 60 pt apart and made a thread look misaligned. A row is a row -- a bubble, a card, a question
 * and a sub-agent all start at the same x -- so the two are one number now, and it is the
 * reading one. A diff inside it keeps its own horizontal scroll.
 */
export const TOOL_WIDTH = READING_WIDTH;

export interface Layout {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  /** The conversation list can stand as a column of its own. */
  pinnedDrawer: boolean;
  /** Menus are centred dialogs instead of bottom sheets. */
  dialogs: boolean;
  /** A layer (files, status, instructions) opens beside the conversation, not over it. */
  sidePane: boolean;
  /** Mouse-sized targets: 44pt tap areas are wasted on a pointer, and cost a third of the rows. */
  dense: boolean;
  /** Cap for a column of prose. */
  readingWidth: number;
  /** Cap for a page of controls. */
  pageWidth: number;
  /** Cap for a tool card: data, so wider than the prose column it sits among. */
  toolWidth: number;
}

/**
 * Where a full-screen layer (jobs, the agent roster) starts.
 *
 * Those pages cover the window, which on a desktop means covering the conversation list too: a
 * column of the layout, not something to paint over. They begin where it ends instead.
 *
 * Only for a page mounted at the shell root, over everything. A page the shell opens *inside* its
 * own column (settings, files, the archives, the browser, status, instructions) is already past the list, and offsetting
 * it again takes the width out of the pane it was given: on a wide window that pane is 460pt, so
 * the browser page drew its cards in the 150pt that were left and wrapped its own title one
 * letter per line.
 */
export function useLayerFrame(): { left: number } {
  const left = useDrawerColumn();
  return useMemo(() => ({ left }), [left]);
}

/** The width the pinned conversation list takes right now (dragged, or folded), 0 when it is not pinned. */
export function useDrawerColumn(): number {
  const { pinnedDrawer } = useLayout();
  const column = usePanes(drawerColumnOf);
  return pinnedDrawer ? column : 0;
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const breakpoint: Breakpoint =
      width >= DESKTOP_MIN ? 'desktop' : width >= TABLET_MIN ? 'tablet' : 'phone';
    const desktop = breakpoint === 'desktop';
    return {
      width,
      height,
      breakpoint,
      pinnedDrawer: desktop,
      dialogs: desktop,
      sidePane: width >= WIDE_MIN,
      dense: desktop && pointerFine,
      // Never wider than the pane either: a 400 pt phone would otherwise claim a 1100 pt column.
      readingWidth: Math.min(width, READING_WIDTH),
      pageWidth: PAGE_WIDTH,
      // Never wider than the pane: on a phone the cap is the window, and the card fills it.
      toolWidth: Math.min(width, TOOL_WIDTH),
    };
  }, [width, height]);
}
