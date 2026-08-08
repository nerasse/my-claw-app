import { useSyncExternalStore } from 'react';
import type { StatusPayload, StatusResultFrame } from './protocol';

type Listener = () => void;

export type StatusFetchState = 'closed' | 'loading' | 'ready' | 'error';

export interface StatusState {
  /** The thread whose report is on screen; null while the page is closed. */
  threadId: string | null;
  fetch: StatusFetchState;
  payload: StatusPayload | null;
  /** The same report as text, kept for the parity footer of the page. */
  text: string;
  error: string | null;
}

const EMPTY: StatusState = { threadId: null, fetch: 'closed', payload: null, text: '', error: null };

/**
 * The fullscreen `/status` report of one conversation. The server owns the truth: the page only
 * renders what `status.result` frames say, and a request that never lands (old server) shows as
 * an error instead of spinning forever.
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
    this.state = { threadId, fetch: 'loading', payload: null, text: '', error: null };
    this.emit();
  }

  receive(frame: StatusResultFrame): void {
    this.state = {
      threadId: frame.threadId,
      fetch: 'ready',
      payload: frame.status,
      text: frame.text,
      error: null,
    };
    this.emit();
  }

  fail(message: string): void {
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
