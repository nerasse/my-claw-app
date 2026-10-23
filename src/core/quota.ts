import { useSyncExternalStore } from 'react';
import type { QuotaOutcome, QuotaRetryWait, QuotaStateFrame, SessionQuotaRetryStateFrame } from './protocol';

type Listener = () => void;

/**
 * The last answer each provider's usage endpoint gave, outside any screen: a provider page, the
 * models list and a second device all read the same one, and the server pushes the changes.
 */
class ProviderQuotaStore {
  private outcomes = new Map<string, QuotaOutcome>();
  /** A copy per change, so a component reading the whole map re-renders on one reference change. */
  private snapshot = new Map<string, QuotaOutcome>();
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get(provider: string): QuotaOutcome | undefined {
    return this.outcomes.get(provider);
  }

  all(): ReadonlyMap<string, QuotaOutcome> {
    return this.snapshot;
  }

  receive(frame: QuotaStateFrame): void {
    this.outcomes.set(frame.provider, frame.outcome);
    this.snapshot = new Map(this.outcomes);
    for (const listener of this.listeners) listener();
  }

  reset(): void {
    this.outcomes.clear();
    this.snapshot = new Map();
    for (const listener of this.listeners) listener();
  }
}

export const quotaStore = new ProviderQuotaStore();

/** One provider's last answer; the same object between two pushes. */
export function useQuota(provider: string | null | undefined): QuotaOutcome | undefined {
  return useSyncExternalStore(quotaStore.subscribe, () => (provider ? quotaStore.get(provider) : undefined));
}

export function useQuotaMap(): ReadonlyMap<string, QuotaOutcome> {
  return useSyncExternalStore(quotaStore.subscribe, () => quotaStore.all());
}

export interface QuotaRetryState {
  enabled: boolean;
  waiting?: QuotaRetryWait;
}

/**
 * The quota-retry setting per conversation. Kept apart from the chat store because it is not a
 * message: the pill under the last run and the menu's switch both read it, and the server is the
 * one that decides both fields.
 */
class QuotaRetryStore {
  private byThread = new Map<string, QuotaRetryState>();
  private listeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get(threadId: string | null | undefined): QuotaRetryState | undefined {
    return threadId ? this.byThread.get(threadId) : undefined;
  }

  receive(frame: SessionQuotaRetryStateFrame): void {
    this.set(frame.threadId, { enabled: frame.enabled, ...(frame.waiting ? { waiting: frame.waiting } : {}) });
  }

  set(threadId: string, state: QuotaRetryState): void {
    const current = this.byThread.get(threadId);
    if (current?.enabled === state.enabled && current?.waiting?.at === state.waiting?.at && current?.waiting?.attempts === state.waiting?.attempts) return;
    this.byThread.set(threadId, state);
    for (const listener of this.listeners) listener();
  }

  reset(): void {
    this.byThread.clear();
    for (const listener of this.listeners) listener();
  }
}

export const quotaRetryStore = new QuotaRetryStore();

export function useQuotaRetry(threadId: string | null | undefined): QuotaRetryState | undefined {
  return useSyncExternalStore(quotaRetryStore.subscribe, () => quotaRetryStore.get(threadId));
}
