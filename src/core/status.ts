import { useSyncExternalStore } from 'react';
import type { StatusPayload, StatusResultFrame } from './protocol';

type Listener = () => void;

export type StatusFetchState = 'closed' | 'loading' | 'ready' | 'error';

export interface StatusState {
  /** The thread whose report is on screen; null while the page is closed. */
  threadId: string | null;
  /** `loading` until the first report lands; the server pushes the ones after it. */
  fetch: StatusFetchState;
  payload: StatusPayload | null;
  /** When the last report landed, so the page can say how fresh it is. */
  receivedAt: number | null;
  error: string | null;
}

const EMPTY: StatusState = { threadId: null, fetch: 'closed', payload: null, receivedAt: null, error: null };

/**
 * The status report of one conversation, as the server pushes it. The page is watched server
 * side from `open` to `close` (`status.watch` / `status.unwatch`): every report that lands for
 * the open thread replaces the one on screen, and the page never asks. A request that never
 * lands (old server) shows as an error instead of spinning forever.
 */
class StatusStoreImpl {
  private state: StatusState = EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): StatusState {
    return this.state;
  }

  /** Only tests need it: the store outlives a screen, on purpose. */
  reset(): void {
    this.state = EMPTY;
    this.emit();
  }

  open(threadId: string): void {
    this.state = { threadId, fetch: 'loading', payload: null, receivedAt: null, error: null };
    this.emit();
  }

  /** A report for the open thread lands; one for any other thread is not this page's business. */
  receive(frame: StatusResultFrame): boolean {
    if (this.state.threadId !== frame.threadId) return false;
    this.state = {
      threadId: frame.threadId,
      fetch: 'ready',
      payload: frame.status,
      receivedAt: Date.now(),
      error: null,
    };
    this.emit();
    return true;
  }

  fail(message: string): void {
    if (this.state.threadId === null) return;
    this.state = { ...this.state, fetch: 'error', error: message };
    this.emit();
  }

  close(): void {
    this.state = EMPTY;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const statusStore = new StatusStoreImpl();

const subscribeToStatus = (listener: Listener): (() => void) => statusStore.subscribe(listener);

export function useStatus(): StatusState {
  return useSyncExternalStore(subscribeToStatus, () => statusStore.getSnapshot());
}
