/**
 * Which asides the reader opened, held outside the components that draw them.
 *
 * An aside kept its expansion in `useState`. That works until the cell holding it is unmounted and
 * rebuilt, and the compaction ones are rebuilt constantly: the live rule is drawn in the list
 * header or as a row of the list depending on whether a send is parked behind the compaction
 * (`compactionRuleBefore`), so every move between the two is a different position in the tree and
 * React mounts a new instance. The owner expanded the summary, a message arrived, and it folded
 * itself back (2026-09-12).
 *
 * Keyed by whatever the caller considers the same aside across those rebuilds: the entry id for a
 * boundary replayed from history, the server's start instant for the live one. Nothing is
 * persisted: the fold belongs to the reading session, not to the conversation.
 */

import { useSyncExternalStore } from 'react';

/** Only what the reader set: an aside nobody touched follows its own default. */
const expanded = new Map<string, boolean>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeAsideExpansion(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isAsideExpanded(key: string): boolean | undefined {
  return expanded.get(key);
}

export function setAsideExpanded(key: string, open: boolean): void {
  if (expanded.get(key) === open) return;
  expanded.set(key, open);
  emit();
}

/** Test seam: module state is shared by every test file, so it is reset centrally. */
export function resetAsideExpansion(): void {
  expanded.clear();
  emit();
}

/** The expansion a keyed aside carries, or undefined for a key nobody has touched. */
export function useStoredAsideExpansion(persistKey: string | undefined): boolean | undefined {
  return useSyncExternalStore(subscribeAsideExpansion, () =>
    persistKey === undefined ? undefined : isAsideExpanded(persistKey),
  );
}
