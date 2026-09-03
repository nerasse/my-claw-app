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
 *
 * What stops a second ask is the row's own `hydration`, not a memo kept here. That is deliberate:
 * the trim folds a hydrated group back to its row to give memory back, and a module-level "already
 * asked" set would then refuse to fetch it ever again -- the group would open on a skeleton that
 * never fills. State on the row has one owner and survives exactly as long as the row does.
 */
export function requestRunItems(threadId: string, rows: readonly RunSummaryItem[]): void {
  for (const row of rows) {
    // `loading` is an ask in flight; `failed` is a range the branch no longer holds, and retrying
    // it on every open would be a loop against an answer that will not change.
    if (row.hydration !== 'idle') continue;
    chatStore.setRunHydration(threadId, row.id, 'loading');
    // Fire and forget, like every other read this app makes: the row keeps its skeleton until the
    // answer arrives, and a socket that was down replays nothing.
    connection.send(encodeRunItems(threadId, row.id, row.lastId)).catch(() => {
      // The ask never left the device, so nothing is in flight: let the next open try again.
      chatStore.setRunHydration(threadId, row.id, 'idle');
    });
  }
}
