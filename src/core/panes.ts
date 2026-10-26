import { useSyncExternalStore } from 'react';
import { DRAWER_WIDTH } from '../theme/palettes';
import { prefs } from './prefs';

/**
 * How wide the desktop columns are: the conversation list, and the page beside the conversation.
 *
 * The owner drags them wider or narrower, and folds the list away. What he arranges he expects to
 * find again: on the next session, and after a reload (owner, 2026-10-26: "tu enregistres tout, tu
 * gardes tout en mémoire, si c'est resize quel truc est ouvert"). Kept on the device, not on the
 * server -- a phone and a desk arrange the same conversations differently, and this is the desk's
 * own furniture (the rule `collapsedFolders` already follows).
 *
 * Held outside the shell so a drag re-renders the two columns that read it, not the 5000-line shell
 * and every bubble under it.
 */

export const DRAWER_DEFAULT = DRAWER_WIDTH;
export const DRAWER_MIN = 220;
export const DRAWER_MAX = 520;
/** The folded list: a strip with the way back, a new conversation and the settings. */
export const RAIL_WIDTH = 56;

export const PAGE_PANE_DEFAULT = 460;
export const PAGE_PANE_MIN = 340;
/** What a page beside it must leave the conversation: below this its lines wrap every few words. */
export const CHAT_MIN = 440;

/**
 * A drag fires on every pointer move. Writing the device bag at that rate is a write storm for a
 * number the owner stopped caring about the moment he let go of the handle, so the write waits for
 * the hand: 400 ms after the last change.
 */
const PERSIST_MS = 400;

export interface Panes {
  drawerWidth: number;
  drawerCollapsed: boolean;
  pagePaneWidth: number;
}

const DEFAULTS: Panes = { drawerWidth: DRAWER_DEFAULT, drawerCollapsed: false, pagePaneWidth: PAGE_PANE_DEFAULT };

let state: Panes = DEFAULTS;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function write(): void {
  persistTimer = null;
  prefs.set(
    'panes',
    JSON.stringify({ drawerWidth: state.drawerWidth, drawerCollapsed: state.drawerCollapsed, pagePaneWidth: state.pagePaneWidth }),
  );
}

function set(next: Partial<Panes>): void {
  const merged = { ...state, ...next };
  if (merged.drawerWidth === state.drawerWidth && merged.drawerCollapsed === state.drawerCollapsed && merged.pagePaneWidth === state.pagePaneWidth) return;
  state = merged;
  for (const listener of listeners) listener();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(write, PERSIST_MS);
}

export function clampDrawer(width: number): number {
  return Math.round(Math.min(DRAWER_MAX, Math.max(DRAWER_MIN, width)));
}

/** The widest the page may grow in this window, beside a list this wide. Never under its minimum. */
export function pagePaneMax(windowWidth: number, drawerColumn: number): number {
  return Math.max(PAGE_PANE_MIN, windowWidth - drawerColumn - CHAT_MIN);
}

export function clampPagePane(width: number, windowWidth: number, drawerColumn: number): number {
  return Math.round(Math.min(pagePaneMax(windowWidth, drawerColumn), Math.max(PAGE_PANE_MIN, width)));
}

/** The room the pinned list takes: its width, or the rail's when folded. */
export function drawerColumnOf(panes: Panes): number {
  return panes.drawerCollapsed ? RAIL_WIDTH : panes.drawerWidth;
}

/**
 * What was arranged last time, read back from the device bag. Called once the bag is hydrated: a
 * value that is absent, or not a number, keeps the default rather than a NaN width.
 */
export function readPanes(raw: string | undefined): Panes {
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw) as Partial<Panes>;
    return {
      drawerWidth: typeof parsed.drawerWidth === 'number' && Number.isFinite(parsed.drawerWidth) ? clampDrawer(parsed.drawerWidth) : DEFAULTS.drawerWidth,
      drawerCollapsed: parsed.drawerCollapsed === true,
      pagePaneWidth:
        typeof parsed.pagePaneWidth === 'number' && Number.isFinite(parsed.pagePaneWidth)
          ? Math.max(PAGE_PANE_MIN, Math.round(parsed.pagePaneWidth))
          : DEFAULTS.pagePaneWidth,
    };
  } catch {
    return DEFAULTS;
  }
}

export const panes = {
  get: (): Panes => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  resizeDrawer: (width: number) => set({ drawerWidth: clampDrawer(width) }),
  resizePagePane: (width: number, windowWidth: number) =>
    set({ pagePaneWidth: clampPagePane(width, windowWidth, drawerColumnOf(state)) }),
  setDrawerCollapsed: (collapsed: boolean) => set({ drawerCollapsed: collapsed }),
  toggleDrawer: () => set({ drawerCollapsed: !state.drawerCollapsed }),
  resetDrawer: () => set({ drawerWidth: DRAWER_DEFAULT }),
  resetPagePane: () => set({ pagePaneWidth: PAGE_PANE_DEFAULT }),
  /** The stored arrangement, applied once the prefs bag has been read. */
  hydrate: (stored: Panes) => set(stored),
  /** Writes what is arranged right now, without waiting for the debounce (a page going away). */
  flush: (): void => {
    if (!persistTimer) return;
    clearTimeout(persistTimer);
    write();
  },
  /** Tests only: the store outlives a test, the defaults must not depend on the order. */
  reset: () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    state = DEFAULTS;
    for (const listener of listeners) listener();
  },
};

/** One field of the panes: a component re-renders when that field changes, and only then. */
export function usePanes<T>(select: (p: Panes) => T): T {
  return useSyncExternalStore(panes.subscribe, () => select(state), () => select(DEFAULTS));
}
