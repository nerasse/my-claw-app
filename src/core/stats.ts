import { useSyncExternalStore } from 'react';
import { noFilter, sameFilter } from './statsFilter';
import type { StatsFilter, StatsPayload, StatsPeriod, StatsResultFrame } from './protocol';

type Listener = () => void;

export type StatsFetchState = 'closed' | 'loading' | 'ready' | 'error';

export interface StatsState {
  /** The window that was asked for, which is also the one an answer has to agree with. */
  period: StatsPeriod;
  /**
   * What the report was narrowed to, on the same terms as the period.
   *
   * Held here rather than in the screen because it is half of what was asked: an answer has to
   * agree with both before it can be drawn, and the screen that asked may well be gone by then.
   */
  filter: StatsFilter;
  fetch: StatsFetchState;
  payload: StatsPayload | null;
  /** When the answer landed, so the page can say how fresh a one-shot report is. */
  receivedAt: number | null;
  error: string | null;
}

/** What the page opens on, and what a period button reverts it to while the answer travels. */
export const DEFAULT_STATS_PERIOD: StatsPeriod = '30d';

const EMPTY: StatsState = {
  period: DEFAULT_STATS_PERIOD,
  filter: noFilter(),
  fetch: 'closed',
  payload: null,
  receivedAt: null,
  error: null,
};

/**
 * The install-wide statistics, as the server answered one `stats.get`.
 *
 * Nothing pushes this report: a conversation can say it moved, an install-wide total cannot, so
 * the page asks and the answer lands here once. `stats.result` carries no `threadId` either --
 * these figures are not a conversation's -- so the only thing an arriving answer can be matched
 * against is the window and the filter it was asked with. A payload for another period, or for
 * another filter, is an answer to a button the owner has already left, and keeping it would put
 * figures from seven days under a header reading "all".
 */
class StatsStoreImpl {
  private state: StatsState = EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): StatsState {
    return this.state;
  }

  /** Only tests need it: the store outlives a screen, on purpose. */
  reset(): void {
    this.state = EMPTY;
    this.emit();
  }

  /** The page opened, or a period button was pressed: the window and the filter asked for are now these. */
  open(period: StatsPeriod, filter: StatsFilter = noFilter()): void {
    this.state = { period, filter, fetch: 'loading', payload: null, receivedAt: null, error: null };
    this.emit();
  }

  receive(frame: StatsResultFrame): boolean {
    if (this.state.fetch === 'closed') return false;
    if (this.state.period !== frame.stats.period) return false;
    if (!sameFilter(this.state.filter, frame.stats.filter)) return false;
    this.state = {
      period: frame.stats.period,
      filter: frame.stats.filter,
      fetch: 'ready',
      payload: frame.stats,
      receivedAt: Date.now(),
      error: null,
    };
    this.emit();
    return true;
  }

  fail(message: string): void {
    if (this.state.fetch === 'closed') return;
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

export const statsStore = new StatsStoreImpl();

const subscribeToStats = (listener: Listener): (() => void) => statsStore.subscribe(listener);

export function useStats(): StatsState {
  return useSyncExternalStore(subscribeToStats, () => statsStore.getSnapshot());
}
