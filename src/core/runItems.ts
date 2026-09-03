import { chatStore } from './chat';
import { connection } from './connection';
import { encodeRunItems } from './protocol';
import type { RunSummaryItem } from './chat';

/**
 * Asking the server for the work a folded run row stands for -- docs/run-hydration.md.
 *
 * The page a thread opens on carries headers instead of the work of every finished run: measured
 * on a real session, 594 KB of items became 86 KB of rows. This is the other end of that trade,
 * and the same one `toolOutput.ts` already makes for a clipped tool output -- the reader who
 * actually opens a group pays for it, once.
 *
 * The range travels, not the run id: a run cut by a page boundary folds into one row per page, so
 * asking by run would splice back items this client already holds.
 */
const asked = new Set<string>();

function keyOf(threadId: string, row: RunSummaryItem): string {
  return `${threadId}\u0000${row.id}\u0000${row.lastId}`;
}

/**
 * Fetches every range the opened group stands for. Several only when a page boundary cut the run
 * and the rows were merged back into one group; one is the ordinary case.
 *
 * Asked once per range: opening, closing and reopening a group must not send a second frame, and
 * a range the branch no longer holds must not turn into a retry loop.
 */
export function requestRunItems(threadId: string, rows: readonly RunSummaryItem[]): void {
  for (const row of rows) {
    if (row.hydration === 'loading') continue;
    const key = keyOf(threadId, row);
    if (asked.has(key)) continue;
    asked.add(key);
    chatStore.setRunHydration(threadId, row.id, 'loading');
    // Fire and forget, like every other read this app makes: the row keeps its skeleton until the
    // answer arrives, and a socket that was down replays nothing.
    connection.send(encodeRunItems(threadId, row.id, row.lastId)).catch(() => {
      // The ask never landed, so it is not pending: let the next open try again.
      asked.delete(key);
      chatStore.setRunHydration(threadId, row.id, 'idle');
    });
  }
}

/** Test seam: the memo is process-wide, and a suite would otherwise leak asks between cases. */
export function resetRunItemAsks(): void {
  asked.clear();
}
