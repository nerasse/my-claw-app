import { useSyncExternalStore } from 'react';
import type { AccountsResultFrame } from './protocol';

type Listener = () => void;

export interface AccountsState {
  /** The server's last answer; null until it answers (or on a server older than 0.7.81). */
  frame: AccountsResultFrame | null;
  /** The last refusal or failed sign-in, cleared by the next request. */
  error: string | null;
  /** A request is on its way: its button waits instead of being pressed twice. */
  busy: boolean;
}

/**
 * The ChatGPT and Claude sign-ins, outside the shell: a ChatGPT approval lands minutes later, page
 * open or not, and reopening the page shows where the sign-in stands.
 */
class AccountsStoreImpl {
  private state: AccountsState = { frame: null, error: null, busy: false };
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get(): AccountsState {
    return this.state;
  }

  private set(next: Partial<AccountsState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  replace(frame: AccountsResultFrame): void {
    this.set({ frame, error: frame.error ?? null, busy: false });
  }

  fail(message: string): void {
    this.set({ error: message, busy: false });
  }

  sending(): void {
    this.set({ busy: true, error: null });
  }

  reset(): void {
    this.set({ frame: null, error: null, busy: false });
  }
}

export const accountsStore = new AccountsStoreImpl();

const subscribe = (listener: Listener): (() => void) => accountsStore.subscribe(listener);

export function useAccounts(): AccountsState {
  return useSyncExternalStore(subscribe, () => accountsStore.get());
}
