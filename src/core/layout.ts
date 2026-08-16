import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { pointerFine } from './platform';

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
    };
  }, [width, height]);
}
