import { useSyncExternalStore } from 'react';
import type { AgentsConfigResultFrame } from './protocol';

type Listener = () => void;

export type AgentsStatus = 'unknown' | 'ready' | 'unsupported';

interface AgentsState {
  status: AgentsStatus;
  config: AgentsConfigResultFrame | null;
  error: string | null;
}

const EMPTY: AgentsState = { status: 'unknown', config: null, error: null };

/**
 * Agent defaults of the server, mirrored like the model store: the server owns the truth, this
 * store only renders what `agents.config.result` frames say. `unsupported` means the server never
 * answered (a pre-0.1.168 server drops unknown frames silently), so the page can say so instead
 * of spinning forever.
 */
class AgentsStoreImpl {
  private state: AgentsState = EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): AgentsState {
    return this.state;
  }

  /** Drops everything. Only tests need it: the store outlives a screen, on purpose. */
  reset(): void {
    this.state = EMPTY;
    this.emit();
  }

  request(): void {
    this.state = { ...this.state, status: 'unknown', error: null };
    this.emit();
  }

  receive(frame: AgentsConfigResultFrame): void {
    this.state = { status: 'ready', config: frame, error: null };
    this.emit();
  }

  markUnsupported(): void {
    if (this.state.status === 'ready') return;
    this.state = { status: 'unsupported', config: null, error: null };
    this.emit();
  }

  fail(message: string): void {
    this.state = { ...this.state, error: message };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const agentsStore = new AgentsStoreImpl();

const subscribeToAgents = (listener: Listener): (() => void) => agentsStore.subscribe(listener);

export function useAgentsConfig(): AgentsState {
  return useSyncExternalStore(subscribeToAgents, () => agentsStore.getSnapshot());
}
