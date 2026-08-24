import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { pointerFine } from './platform';
import { DRAWER_WIDTH } from '../theme/palettes';

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
/** A pinned drawer takes 288pt: under this the conversation would be squeezed to nothing. */
const DESKTOP_MIN = 1080;
/** A side pane costs another 420pt on top of the drawer and a readable conversation. */
const WIDE_MIN = 1440;

/**
 * A line of text stops being readable somewhere past 90 characters, whatever the window does.
 * The conversation is centred inside this instead of filling the pane.
 */
export const READING_WIDTH = 860;

/**
 * Cap for a page of controls (settings, files, jobs). Wider than prose, because a row here is a
 * label and a value at opposite ends rather than a sentence, and narrower than the window,
 * because a 1600pt row makes the two ends unrelatable.
 */
export const PAGE_WIDTH = 980;

/**
 * Cap for a tool card. Wider than prose on purpose: a diff, an argument list and a log are data,
 * not sentences. They have columns of their own, and squeezing them into a reading column does
 * not make them readable, it wraps every line.
 *
 * Not much wider, though. At 1280 the cards overran the header and every other page by 200pt on
 * each side, and a row that starts outside everything else on screen reads as a layout bug
 * rather than as a wider column. Aligned with a page of controls instead: the widest thing the
 * app already draws.
 */
export const TOOL_WIDTH = PAGE_WIDTH;

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
 * Where a full-screen layer (jobs, the agent roster, a report) starts.
 *
 * Those pages cover the window, which on a desktop means covering the conversation list too: a
 * column of the layout, not something to paint over. They begin where it ends instead.
 */
export function useLayerFrame(): { left: number } {
  const { pinnedDrawer } = useLayout();
  return useMemo(() => ({ left: pinnedDrawer ? DRAWER_WIDTH : 0 }), [pinnedDrawer]);
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
      readingWidth: READING_WIDTH,
      pageWidth: PAGE_WIDTH,
      // Never wider than the pane: on a phone the cap is the window, and the card fills it.
      toolWidth: Math.min(width, TOOL_WIDTH),
    };
  }, [width, height]);
}
