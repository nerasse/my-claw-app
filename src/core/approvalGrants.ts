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

/**
 * A grant's arguments as a person reads them: the shell command alone when that is all it is,
 * otherwise `key: value` pairs on one line. The raw JSON is the permission's key, not something
 * the owner should have to parse to recognise what he allowed.
 */
export function readableCall(args: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(args);
  } catch {
    return args;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return String(parsed);
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 1 && typeof entries[0]![1] === 'string') return entries[0]![1] as string;
  return entries
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ');
}

export function useApprovalGrants(): ApprovalGrantFrame[] {
  return useSyncExternalStore(
    (listener) => approvalGrantsStore.subscribe(listener),
    () => approvalGrantsStore.snapshot(),
    () => approvalGrantsStore.snapshot(),
  );
}
