import { useSyncExternalStore } from 'react';
import { DRAWER_WIDTH } from '../theme/palettes';

/**
 * How wide the desktop columns are: the conversation list, and the page beside the conversation.
 *
 * The owner drags them wider or narrower, and folds the list away, for the session only. Nothing
 * is saved: a fresh load opens on the default sizes, which is the point (owner, 2026-09-29: "garde
 * les tailles actuelles par défaut quand on ouvre une page, pas de save position"). Held outside
 * the shell so a drag re-renders the two columns that read it, not the 5000-line shell and every
 * bubble under it.
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

export interface Panes {
  drawerWidth: number;
  drawerCollapsed: boolean;
  pagePaneWidth: number;
}

const DEFAULTS: Panes = { drawerWidth: DRAWER_DEFAULT, drawerCollapsed: false, pagePaneWidth: PAGE_PANE_DEFAULT };

let state: Panes = DEFAULTS;
const listeners = new Set<() => void>();

function set(next: Partial<Panes>): void {
  const merged = { ...state, ...next };
  if (merged.drawerWidth === state.drawerWidth && merged.drawerCollapsed === state.drawerCollapsed && merged.pagePaneWidth === state.pagePaneWidth) return;
  state = merged;
  for (const listener of listeners) listener();
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
  /** Tests only: the store outlives a test, the defaults must not depend on the order. */
  reset: () => set(DEFAULTS),
};

/** One field of the panes: a component re-renders when that field changes, and only then. */
export function usePanes<T>(select: (p: Panes) => T): T {
  return useSyncExternalStore(panes.subscribe, () => select(state), () => select(DEFAULTS));
}
