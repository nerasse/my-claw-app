import { useSyncExternalStore } from 'react';
import type { SessionInstructionsPayload, SessionInstructionsResultFrame } from './protocol';

type Listener = () => void;

export type SessionInstructionsFetch = 'closed' | 'loading' | 'ready' | 'error';

export interface SessionInstructionsState {
  /** The thread whose report is on screen; null while the page is closed. */
  threadId: string | null;
  fetch: SessionInstructionsFetch;
  payload: SessionInstructionsPayload | null;
  error: string | null;
}

const EMPTY: SessionInstructionsState = { threadId: null, fetch: 'closed', payload: null, error: null };

/**
 * What one conversation is loaded with, as the server composes it. Same shape as the status
 * store, for the same reason: the server owns the truth, the page only draws the last frame, and
 * a request that never lands (older server) shows as an error instead of spinning forever.
 */
class SessionInstructionsStoreImpl {
  private state: SessionInstructionsState = EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): SessionInstructionsState {
    return this.state;
  }

  /** Only tests need it: the store outlives a screen, on purpose. */
  reset(): void {
    this.state = EMPTY;
    this.emit();
  }

  open(threadId: string): void {
    this.state = { threadId, fetch: 'loading', payload: null, error: null };
    this.emit();
  }

  receive(frame: SessionInstructionsResultFrame): void {
    this.state = { threadId: frame.threadId, fetch: 'ready', payload: frame.instructions, error: null };
    this.emit();
  }

  /**
   * The page sent a control and is waiting for the server's fresh report.
   * The previous payload stays on screen: a control must never flash the page into
   * "asking the server…" (which would unmount the scroll view and reset its position).
   * Only the very first open starts from an empty payload.
   */
  pending(): void {
    if (this.state.fetch !== 'ready' && this.state.fetch !== 'loading') return;
    this.state = { ...this.state, fetch: 'loading', error: null };
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

export const sessionInstructionsStore = new SessionInstructionsStoreImpl();

export function useSessionInstructions(): SessionInstructionsState {
  return useSyncExternalStore(
    listener => sessionInstructionsStore.subscribe(listener),
    () => sessionInstructionsStore.getSnapshot(),
  );
}
