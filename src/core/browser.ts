import { useSyncExternalStore } from 'react';
import type { BrowserInfoResultFrame } from './protocol';

type Listener = () => void;

/**
 * The browser's connection details, as the server last described them. Held here rather than in
 * the screen's state so a reconnect that re-answers while the page is closed is not lost, and so
 * reopening the page shows the last known answer instead of an empty frame.
 *
 * `null` means never answered, which the page shows as loading. It is distinct from an answer
 * carrying no password, which the page states outright.
 */
class BrowserStoreImpl {
  private snapshot: BrowserInfoResultFrame | null = null;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): BrowserInfoResultFrame | null {
    return this.snapshot;
  }

  replace(frame: BrowserInfoResultFrame): void {
    this.snapshot = frame;
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** Test seam: the store is module-level and outlives one test. */
  reset(): void {
    this.snapshot = null;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const browserStore = new BrowserStoreImpl();

const subscribeToBrowser = (listener: Listener): (() => void) => browserStore.subscribe(listener);

export function useBrowserInfo(): BrowserInfoResultFrame | null {
  return useSyncExternalStore(subscribeToBrowser, () => browserStore.getSnapshot());
}
