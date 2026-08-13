import { useSyncExternalStore } from 'react';
import { deviceBridge } from './nativeBridge';

const PREFS_KEY = 'pinnedSessions';
const EMPTY: string[] = [];
Object.freeze(EMPTY);

type Listener = () => void;

function parse(raw: Record<string, string>): string[] {
  try {
    const parsed = JSON.parse(raw[PREFS_KEY] ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Which conversations sit at the top of the drawer, and in what order. The server owns the
 * sessions; this only says how the drawer shows them, so it lives in the same per-device
 * settings bag as the theme. The order is what the user dragged it to: the array IS the order.
 */
class PinnedStore {
  private order: string[] = EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  orderOf(): string[] {
    return this.order;
  }

  async hydrate(): Promise<void> {
    try {
      const order = parse(await deviceBridge.prefsGetAll());
      if (order.length === this.order.length && order.every((id, i) => id === this.order[i]))
        return;
      this.order = order.length === 0 ? EMPTY : order;
      this.emit();
    } catch {
      this.order = EMPTY;
    }
  }

  setPinned(threadId: string, pinned: boolean): void {
    if (pinned) {
      if (this.order.includes(threadId)) return;
      this.order = [...this.order, threadId];
    } else {
      const next = this.order.filter(id => id !== threadId);
      if (next.length === this.order.length) return;
      this.order = next.length === 0 ? EMPTY : next;
    }
    this.emit();
    this.persist();
  }

  /** The user dragged a row: the new order is authoritative, and it gets written down. */
  setOrder(order: string[]): void {
    this.order = order.length === 0 ? EMPTY : [...order];
    this.emit();
    this.persist();
  }

  private persist(): void {
    deviceBridge
      .prefsSet(PREFS_KEY, JSON.stringify(this.order))
      .catch(() => {});
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const pinnedStore = new PinnedStore();

const subscribeToPins = (listener: Listener): (() => void) => pinnedStore.subscribe(listener);

/** The pinned thread ids, in the user's order. */
export function usePinnedOrder(): string[] {
  return useSyncExternalStore(subscribeToPins, () => pinnedStore.orderOf());
}
