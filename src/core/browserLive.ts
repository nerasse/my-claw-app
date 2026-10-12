import { useCallback, useSyncExternalStore } from 'react';
import type {
  BrowserControlResultFrame,
  BrowserFrameFrame,
  BrowserLiveWindow,
  BrowserWindowsResultFrame,
} from './protocol';

type Listener = () => void;

/** A tab's latest picture, as a data URI ready for an image, with the viewport it shows. */
export interface LiveFrame {
  uri: string;
  seq: number;
  width: number;
  height: number;
}

export interface LiveWindowsSnapshot {
  /** `null` until the server first answered. */
  windows: BrowserLiveWindow[] | null;
  error?: string;
}

/**
 * The live view's state -- docs/browser-live.md in the server repo.
 *
 * Pictures are kept per tab and listened to per tab: a wall of tiles re-renders the one tile whose
 * picture changed, never the whole wall. Only the latest picture of a tab is kept.
 */
class BrowserLiveStore {
  private windows: LiveWindowsSnapshot = { windows: null };
  private windowListeners = new Set<Listener>();
  private frames = new Map<string, LiveFrame | 'gone'>();
  private frameListeners = new Map<string, Set<Listener>>();
  private notice: string | null = null;
  private noticeListeners = new Set<Listener>();

  subscribeWindows(listener: Listener): () => void {
    this.windowListeners.add(listener);
    return () => {
      this.windowListeners.delete(listener);
    };
  }

  getWindows(): LiveWindowsSnapshot {
    return this.windows;
  }

  receiveWindows(frame: BrowserWindowsResultFrame): void {
    this.windows = { windows: frame.windows, ...(frame.error ? { error: frame.error } : {}) };
    for (const listener of this.windowListeners) listener();
  }

  subscribeFrame(pageId: string, listener: Listener): () => void {
    let set = this.frameListeners.get(pageId);
    if (!set) {
      set = new Set();
      this.frameListeners.set(pageId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.frameListeners.delete(pageId);
    };
  }

  getFrame(pageId: string): LiveFrame | 'gone' | undefined {
    return this.frames.get(pageId);
  }

  receiveFrame(frame: BrowserFrameFrame): void {
    const known = this.frames.get(frame.pageId);
    // Frames can cross on the wire after a watch changed: an older one never replaces a newer one.
    if (known && known !== 'gone' && known.seq >= frame.seq) return;
    this.frames.set(frame.pageId, {
      uri: `data:image/jpeg;base64,${frame.data}`,
      seq: frame.seq,
      width: frame.width,
      height: frame.height,
    });
    this.notifyFrame(frame.pageId);
  }

  receiveGone(pageId: string): void {
    this.frames.set(pageId, 'gone');
    this.notifyFrame(pageId);
  }

  /** Pictures of tabs nobody shows any more are dropped: they are the heaviest thing held here. */
  keepFrames(pageIds: Iterable<string>): void {
    const keep = new Set(pageIds);
    for (const pageId of [...this.frames.keys()]) if (!keep.has(pageId)) this.frames.delete(pageId);
  }

  subscribeNotice(listener: Listener): () => void {
    this.noticeListeners.add(listener);
    return () => {
      this.noticeListeners.delete(listener);
    };
  }

  getNotice(): string | null {
    return this.notice;
  }

  receiveControl(frame: BrowserControlResultFrame): void {
    this.setNotice(frame.ok ? null : (frame.error ?? 'the browser refused that'));
  }

  setNotice(notice: string | null): void {
    if (notice === this.notice) return;
    this.notice = notice;
    for (const listener of this.noticeListeners) listener();
  }

  private notifyFrame(pageId: string): void {
    for (const listener of this.frameListeners.get(pageId) ?? []) listener();
  }

  /** Test seam: the store is module-level and outlives one test. */
  reset(): void {
    this.windows = { windows: null };
    this.frames.clear();
    this.notice = null;
    for (const listener of this.windowListeners) listener();
    for (const listener of this.noticeListeners) listener();
    for (const set of this.frameListeners.values()) for (const listener of set) listener();
  }
}

export const browserLiveStore = new BrowserLiveStore();

const subscribeWindows = (listener: Listener): (() => void) => browserLiveStore.subscribeWindows(listener);
const subscribeNotice = (listener: Listener): (() => void) => browserLiveStore.subscribeNotice(listener);

export function useLiveWindows(): LiveWindowsSnapshot {
  return useSyncExternalStore(subscribeWindows, () => browserLiveStore.getWindows());
}

export function useLiveFrame(pageId: string | undefined): LiveFrame | 'gone' | undefined {
  const subscribe = useCallback(
    (listener: Listener) => (pageId ? browserLiveStore.subscribeFrame(pageId, listener) : () => {}),
    [pageId],
  );
  return useSyncExternalStore(subscribe, () => (pageId ? browserLiveStore.getFrame(pageId) : undefined));
}

export function useLiveNotice(): string | null {
  return useSyncExternalStore(subscribeNotice, () => browserLiveStore.getNotice());
}

/**
 * A web tab opened on one window (`#browser-window=<id>`): the owner pops windows out onto other
 * screens, one per screen. Nothing on native.
 */
export function windowFromLocation(): number | null {
  return browserFromLocation()?.window ?? null;
}

/** The hash of a tab opened on the browser page: every window (`#browser`), or one. */
export const BROWSER_HASH = '#browser';

/**
 * A web tab opened on the browser page, full screen: on every window (`#browser`), or on one
 * (`#browser-window=<id>`). Null for any other tab, which opens the app as usual.
 */
export function browserFromLocation(): { window: number | null } | null {
  const hash = (globalThis as { location?: { hash?: string } }).location?.hash ?? '';
  if (hash === BROWSER_HASH) return { window: null };
  const match = /^#browser-window=(\d+)$/.exec(hash);
  return match ? { window: Number(match[1]) } : null;
}

/**
 * A window shown large closes before the page around it: Escape and the back keys return to the
 * wall first. The live pane says how while one is shown; nothing is registered otherwise.
 */
let closeShown: (() => void) | null = null;

export function setShownWindowCloser(close: (() => void) | null): void {
  closeShown = close;
}

/** Back to the wall, if a window was shown large; false when there was none. */
export function closeShownWindow(): boolean {
  if (!closeShown) return false;
  closeShown();
  return true;
}

/** The tab a window shows, which is the one its tile and its full view draw. */
export function shownTab(window: BrowserLiveWindow): BrowserLiveWindow['tabs'][number] | undefined {
  return window.tabs.find(t => t.active) ?? window.tabs[window.tabs.length - 1];
}
