import { useSyncExternalStore } from 'react';
import { prefs } from './prefs';
import type { FileKind } from './fileKind';
import type { SettingsPage } from '../app/settingsPages';

/**
 * The right-hand column: which page it holds, and the viewer over it -- one thing at a time.
 *
 * The shell used to hold a boolean per page (`settingsOpen`, `browserOpen`, `jobsOpen`, a viewer
 * per file type) and draw them in one chain of ternaries, while some of those pages mounted at the
 * root of the tree and covered the rest. Three bugs came out of that shape, all reported on
 * 2026-10-26:
 *
 * 1. **Two pages at once.** The chain order and the paint order were two different orders, so
 *    Settings opened while Jobs was up painted *under* Jobs: invisible, and still clickable behind
 *    it. Opening the browser from Settings left the browser drawn under the settings page.
 * 2. **A switch closed the pane.** `enterThread` cleared every page, because on a phone a page
 *    covers the conversation and would hide the tap. On a wide window it does not, and the file
 *    being read has to stay while the owner moves between conversations.
 * 3. **A reload lost it.** Nothing was written down, so a refresh on the desk came back empty.
 *
 * So there is one value: which page the column holds. Opening a page replaces whatever it held,
 * which makes "one thing at a time" a property of the model instead of a rule every call site has
 * to remember. It is written to the device bag (never to the server: a phone and a desk arrange
 * the same conversations differently) and it survives a conversation switch -- a page *about* the
 * conversation (its files, its status) is re-read for the thread now on screen, while a page about
 * the install (settings, statistics) is simply still there.
 */

/** The pages that live in the column. */
export type PaneKind = 'none' | 'settings' | 'files' | 'system-files' | 'status' | 'stats' | 'archives' | 'instructions' | 'browser';

/** The pages that take the whole window: they are not a column, and they cover it. */
export type WindowKind = 'jobs' | 'agents' | 'agents-global';

export interface RightPaneState {
  /** The page in the column, or `none`. */
  page: PaneKind;
  /** A page that covers the window instead (jobs, the agent rosters). Exclusive with `page`. */
  window: WindowKind | null;
  /** A viewer over the column page: a file, a picture, a film. Closing it brings the page back. */
  viewer: ViewerState | null;
  /** The viewer asked for the whole window instead of the column. */
  expanded: boolean;
  /**
   * Where the settings stack stands, when settings is the page. Kept here rather than only in the
   * shell because it is what a reload has to come back to: reopening the index every time meant
   * walking three levels again to reach the screen being worked in.
   */
  settingsPage: SettingsPage;
}

/** The viewer kinds, one at a time: opening a second closes the first. */
export type ViewerKind =
  | 'image'
  | 'text'
  | 'video'
  | 'svg'
  | 'pdf'
  | 'html'
  | 'office'
  | 'archive'
  | 'file'
  | 'skill';

/** One picture of a gallery, as a viewer holds it (the shape `MediaCarousel` already speaks). */
export interface ViewerImage {
  url: string;
  filename: string;
  sizeBytes?: number;
  poster?: string;
  video?: boolean;
}

/**
 * What a viewer is showing, payload included.
 *
 * One union rather than ten `useState`: a viewer is one slot, so opening a film while a PDF is up
 * replaces it. That was already the rule, but it was ten setters every opener had to call in the
 * right order; here it is the shape of the value. It is also what makes "a file was open"
 * something a reload can come back to -- the payload travels with the page.
 */
export type ViewerState =
  | { kind: 'image'; images: ViewerImage[]; index: number }
  | { kind: 'text'; url: string; filename: string; file?: FileKind }
  | { kind: 'video'; url: string; filename: string }
  | { kind: 'svg'; url: string; filename: string }
  | { kind: 'pdf'; url: string; filename: string }
  | { kind: 'html'; url: string; filename: string }
  | { kind: 'office'; url: string; filename: string }
  | { kind: 'archive'; url: string; filename: string }
  | { kind: 'file'; url: string; filename: string; sizeBytes?: number }
  | { kind: 'skill'; url: string; skill: unknown };

const EMPTY: RightPaneState = { page: 'none', window: null, viewer: null, expanded: false, settingsPage: 'index' };
const COLUMN_KINDS: readonly PaneKind[] = ['settings', 'files', 'system-files', 'status', 'stats', 'archives', 'instructions', 'browser'];
const VIEWER_KINDS: readonly ViewerKind[] = ['image', 'text', 'video', 'svg', 'pdf', 'html', 'office', 'archive', 'file', 'skill'];

let state: RightPaneState = EMPTY;
const listeners = new Set<() => void>();

function set(next: RightPaneState): void {
  if (
    next.page === state.page &&
    next.window === state.window &&
    next.viewer === state.viewer &&
    next.expanded === state.expanded &&
    next.settingsPage === state.settingsPage
  ) {
    return;
  }
  state = next;
  for (const listener of listeners) listener();
  remember();
}

/**
 * What survives a reload: the page and the viewer. The viewer's URL carries the device's media
 * ticket, minted in twelve-hour buckets with three buckets of headroom (`media-ticket.ts`), so a
 * file opened before a reload still answers after it; one that cannot be fetched any more shows
 * its own error and closes with the cross, like any stale URL.
 */
function remember(): void {
  const viewer = state.viewer;
  if (state.page === 'none' && !viewer) {
    prefs.set('rightPane', '');
    return;
  }
  prefs.set(
    'rightPane',
    JSON.stringify({
      page: state.page,
      ...(state.page === 'settings' ? { settingsPage: state.settingsPage } : {}),
      ...(viewer ? { viewer } : {}),
    }),
  );
}

/** Reads back what the column held last time, once the device bag is hydrated. */
export function readRightPane(raw: string | undefined): {
  page: PaneKind;
  settingsPage: SettingsPage;
  viewer: ViewerState | null;
} {
  const empty = { page: 'none' as PaneKind, settingsPage: 'index' as SettingsPage, viewer: null };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as { page?: string; settingsPage?: string; viewer?: ViewerState };
    return {
      page: COLUMN_KINDS.includes(parsed.page as PaneKind) ? (parsed.page as PaneKind) : 'none',
      settingsPage: (parsed.settingsPage ?? 'index') as SettingsPage,
      viewer: parsed.viewer && VIEWER_KINDS.includes(parsed.viewer.kind) ? parsed.viewer : null,
    };
  } catch {
    return empty;
  }
}

export const rightPane = {
  get: (): RightPaneState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Puts a page in the column, replacing whatever it held -- a viewer on top goes with it. */
  show: (page: PaneKind): void => {
    set({ ...state, page, window: null, viewer: null, expanded: false });
  },
  /** The settings stack moved a level: the column still holds settings, standing there. */
  setSettingsPage(next: SettingsPage | ((current: SettingsPage) => SettingsPage)): void {
    const settingsPage = typeof next === 'function' ? next(state.settingsPage) : next;
    set({ ...state, settingsPage });
  },
  /** Closes a page, but only if it is still the one on screen. */
  closeIf(page: PaneKind): void {
    // The settings level survives the page closing: it is where the owner was, and reopening
    // Settings has to land there rather than on the index (the whole point of keeping it).
    if (state.page === page) set({ page: 'none', window: null, viewer: null, expanded: false, settingsPage: state.settingsPage });
  },
  closeIfWindow(window: WindowKind): void {
    if (state.window === window) set({ ...state, window: null });
  },
  /** Closes whichever window page is up, if any. */
  closeWindow(): void {
    if (state.window !== null) set({ ...state, window: null });
  },
  /** A page that takes the whole window: it replaces the column rather than stacking over it. */
  showWindow(window: WindowKind | null): void {
    set({ ...state, page: window ? 'none' : state.page, window, viewer: null, expanded: false });
  },
  openViewer(viewer: ViewerState): void {
    set({ ...state, viewer, expanded: false });
  },
  closeViewer(): void {
    set({ ...state, viewer: null, expanded: false });
  },
  setExpanded(expanded: boolean): void {
    set({ ...state, expanded });
  },
  /** Closes the column page, and the viewer over it. */
  close(): void {
    set({ page: 'none', window: null, viewer: null, expanded: false, settingsPage: state.settingsPage });
  },
  hydrate(stored: { page: PaneKind; settingsPage: SettingsPage; viewer: ViewerState | null }): void {
    if (stored.page === 'none' && !stored.viewer) return;
    set({ page: stored.page, settingsPage: stored.settingsPage, window: null, viewer: stored.viewer, expanded: false });
  },
  /** Tests only: the store outlives a test, the default must not depend on the order. */
  reset(): void {
    state = EMPTY;
    for (const listener of listeners) listener();
  },
};

/**
 * The openers and closers, as one line each.
 *
 * Every one is a write on the same value, so they cannot disagree: opening Settings while Jobs is
 * up replaces Jobs instead of stacking a second page under it. A `false` only closes its own page,
 * so a late unmount cannot close a page somebody opened after it. Module functions, because they
 * hold no component state -- a closure that captures one never goes stale either.
 */
export const setSettingsOpen = (open: boolean): void => {
  if (open) rightPane.show('settings');
  else rightPane.closeIf('settings');
};
export const setArchivesOpen = (open: boolean): void => {
  if (open) rightPane.show('archives');
  else rightPane.closeIf('archives');
};
export const setBrowserOpen = (open: boolean): void => {
  if (open) rightPane.show('browser');
  else rightPane.closeIf('browser');
};
export const setFilesOpen = (open: boolean): void => {
  if (open) rightPane.show('files');
  else rightPane.closeIf('files');
};
export const setStatusOpen = (open: boolean): void => {
  if (open) rightPane.show('status');
  else rightPane.closeIf('status');
};
export const setStatsOpen = (open: boolean): void => {
  if (open) rightPane.show('stats');
  else rightPane.closeIf('stats');
};
export const setSystemFilesOpen = (open: boolean): void => {
  if (open) rightPane.show('system-files');
  else rightPane.closeIf('system-files');
};
export const setInstructionsPageOpen = (open: boolean): void => {
  if (open) rightPane.show('instructions');
  else rightPane.closeIf('instructions');
};
export const setJobsOpen = (open: boolean): void => {
  if (open) rightPane.showWindow('jobs');
  else rightPane.closeIfWindow('jobs');
};
export const setAgentsOpen = (open: boolean): void => {
  if (open) rightPane.showWindow('agents');
  else rightPane.closeIfWindow('agents');
};
export const setAgentsGlobalOpen = (open: boolean): void => {
  if (open) rightPane.showWindow('agents-global');
  else rightPane.closeIfWindow('agents-global');
};

/** The settings stack moved a level: the column still holds settings, standing there. */
export const setSettingsPage = (next: SettingsPage | ((current: SettingsPage) => SettingsPage)): void => {
  rightPane.setSettingsPage(next);
};

/** Closes whatever viewer is up: the cross of a viewer, the back key, a conversation switch. */
export const closeViewer = (): void => rightPane.closeViewer();

export function useRightPane(): RightPaneState {
  return useSyncExternalStore(rightPane.subscribe, () => state, () => EMPTY);
}

/**
 * One page of the column as a `[open, setOpen]` pair, so a call site reads the way it did when
 * this was a `useState`: `setOpen(true)` replaces whatever was showing, `setOpen(false)` closes
 * this page if it is still the one on screen.
 */
export function usePaneFlag(kind: PaneKind): [boolean, (open: boolean) => void] {
  const pane = useRightPane();
  return [pane.page === kind, (open: boolean) => (open ? rightPane.show(kind) : pane.page === kind ? rightPane.close() : undefined)];
}

export function useWindowFlag(kind: WindowKind): [boolean, (open: boolean) => void] {
  const pane = useRightPane();
  return [pane.window === kind, (open: boolean) => (open ? rightPane.showWindow(kind) : pane.window === kind ? rightPane.showWindow(null) : undefined)];
}
