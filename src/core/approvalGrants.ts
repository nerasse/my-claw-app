import { useSyncExternalStore } from 'react';
import type { ApprovalGrantFrame } from './protocol';

type Listener = () => void;

const EMPTY: ApprovalGrantFrame[] = [];
Object.freeze(EMPTY);

/**
 * The standing grants ("always allow this exact call"), kept in their own store rather than in a
 * screen: the approvals page, the sheet's button and the drawer badge all read the same list, and
 * the server pushes a fresh one after every change made on another device.
 */
class ApprovalGrantsStore {
  private grants: ApprovalGrantFrame[] = EMPTY;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): ApprovalGrantFrame[] {
    return this.grants;
  }

  /** The server's whole list, authoritative: it answers every change with it. */
  set(grants: ApprovalGrantFrame[]): void {
    this.grants = grants.length === 0 ? EMPTY : grants;
    this.emit();
  }

  clear(): void {
    this.grants = EMPTY;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const approvalGrantsStore = new ApprovalGrantsStore();

export function useApprovalGrants(): ApprovalGrantFrame[] {
  return useSyncExternalStore(
    (listener) => approvalGrantsStore.subscribe(listener),
    () => approvalGrantsStore.snapshot(),
    () => approvalGrantsStore.snapshot(),
  );
}
