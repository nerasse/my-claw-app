/**
 * The store's paging contract with the server.
 *
 * 1. The sync page that opens a thread carries the paging cursor; the store adopts it, so the
 *    reader at the top can ask for older pages. That was the regression: the sync result used
 *    to carry no cursor, `hasMore` stayed false forever, and lazy loading never fired.
 * 2. The id cursor names the oldest held item and follows prepends and trims, so paging stays
 *    exact when the session grows and when the oldest items are unloaded.
 * 3. Past the cap, trimming happens only while the reader is on the newest message.
 *
 * @format
 */

import { chatStore, MAX_HELD_ITEMS, TRIM_TO_ITEMS } from '../src/core/chat';

const THREAD = 't-paging';

function gen(count: number, prefix: string): Array<{ id: string; role: 'user' | 'assistant'; text: string; ts: string }> {
  const out: Array<{ id: string; role: 'user' | 'assistant'; text: string; ts: string }> = [];
  for (let i = 0; i < count; i += 1) {
    out.push({ id: `${prefix}-${i}`, role: i % 2 === 0 ? 'user' : 'assistant', text: `${prefix} ${i}`, ts: `2026-01-01T10:00:${String(i % 60).padStart(2, '0')}.000Z` });
  }
  return out;
}

function history(): Array<{ id: string; role: 'user' | 'assistant'; text: string; ts: string }> {
  return [
    { id: 'h-0', role: 'user', text: 'check the site', ts: '2026-01-01T10:00:00.000Z' },
    { id: 'h-2', role: 'assistant', text: 'the command replied', ts: '2026-01-01T10:00:02.000Z' },
  ];
}

beforeEach(() => {
  chatStore.clearAll();
});

test('the sync page hands its cursor to the store, so scrolling back still pages', () => {
  // The regression: opening a thread goes through session.sync, and the sync result used to
  // carry no paging cursor -- the page stayed NO_PAGE, `hasMore` was false forever, and the
  // reader at the top never got an older page. The fresh window now carries the cursor and
  // the store adopts it, naming the oldest held item as the id cursor.
  chatStore.handleSyncResult(THREAD, history(), 'h-2', 'h-2', undefined, undefined, undefined, true, 3);
  expect(chatStore.getPage(THREAD)).toMatchObject({ hasMore: true, nextBefore: 3, oldestId: 'h-0' });

  // A delta (no cursor fields) must not touch the held cursor.
  chatStore.handleSyncResult(THREAD, history(), 'h-2', 'h-2');
  expect(chatStore.getPage(THREAD).hasMore).toBe(true);

  // A reset without a cursor clears it: the held window is gone, paging starts over.
  chatStore.handleSyncResult(THREAD, [{ id: 'h-0', role: 'user', text: 'after the switch', ts: '2026-01-02T10:00:00.000Z' }], 'h-0', 'leaf-2', undefined, 'branch-switch');
  expect(chatStore.getPage(THREAD).hasMore).toBe(false);
});

test('a prepend advances the id cursor to the new oldest item', () => {
  chatStore.seedHistory(THREAD, history());
  chatStore.setPage(THREAD, { nextBefore: 3, hasMore: true });
  chatStore.prependHistory(THREAD, [{ id: 'older-1', role: 'user', text: 'la toute premiere question', ts: '2025-12-31T23:00:00.000Z' }]);
  expect(chatStore.getPage(THREAD).oldestId).toBe('older-1');
});

test('a thread past the cap is not trimmed while the reader is up in the history', () => {
  chatStore.seedHistory(THREAD, gen(MAX_HELD_ITEMS + 500, 'a'));
  expect(chatStore.getItems(THREAD).length).toBe(MAX_HELD_ITEMS + 500);

  // The reader scrolled up: nothing is dropped.
  chatStore.setTrimAllowed(THREAD, false);
  chatStore.setPage(THREAD, { nextBefore: MAX_HELD_ITEMS + 500, hasMore: true });
  chatStore.prependHistory(THREAD, gen(50, 'older'));
  expect(chatStore.getItems(THREAD).length).toBe(MAX_HELD_ITEMS + 550);
});

test('at the newest message the trim drops the oldest items and the cursor follows', () => {
  chatStore.seedHistory(THREAD, gen(MAX_HELD_ITEMS + 500, 'a'));
  chatStore.setPage(THREAD, { nextBefore: MAX_HELD_ITEMS + 500, hasMore: true });
  expect(chatStore.getPage(THREAD).oldestId).toBe('a-0');

  // Reader back at the newest message: the wait is over, the oldest items go.
  chatStore.setTrimAllowed(THREAD, true);
  const items = chatStore.getItems(THREAD);
  expect(items.length).toBe(TRIM_TO_ITEMS);
  const page = chatStore.getPage(THREAD);
  // The cursor names the new oldest held item, so the next request pages from there.
  expect(page.oldestId).toBe(items[0].id);
  expect(items[items.length - 1].id).toBe(`a-${MAX_HELD_ITEMS + 499}`);
});

/**
 * The live thread that cleans itself up -- docs/run-hydration.md, lot 4.
 *
 * A long run streams in item by item and is never folded while it runs, so a conversation left
 * open grows past the cap on its own. Giving that memory back must not put the beginning of the
 * conversation out of reach: dropping happens only when folding is not enough, and it always
 * leaves the pager able to fetch back what went.
 */

const RUN = { id: 'r1', status: 'done' as const, startTs: '2026-01-01T10:00:00.000Z', endTs: '2026-01-01T10:01:00.000Z' };

/** The row the server sends in place of a finished run's work. */
const foldedRow = (id: string, count: number, lastId: string) =>
  ({ id: `run-${id}`, role: 'run' as const, ts: '2026-01-01T10:00:00.000Z', run: RUN, toolCount: count, itemCount: count, lastId });

test('a live thread past the cap says there is older work again once it drops any', () => {
  // The trap, exactly. The thread opened on a page the server had nothing older than, so the
  // pager holds hasMore: false. Then a run streams in for an hour and pushes it past the cap.
  chatStore.seedHistory(THREAD, gen(20, 'start'));
  chatStore.setPage(THREAD, { nextBefore: 0, hasMore: false });
  expect(chatStore.getPage(THREAD).hasMore).toBe(false);

  chatStore.handleSyncResult(THREAD, gen(MAX_HELD_ITEMS + 500, 'live'), 'live-1', 'live-1');
  chatStore.setTrimAllowed(THREAD, true);

  const items = chatStore.getItems(THREAD);
  expect(items.length).toBe(TRIM_TO_ITEMS);
  // Without this the reader scrolls up, `loadOlderHistory` returns early on hasMore, and the
  // start of their own conversation is unreachable until they leave the thread and come back.
  expect(chatStore.getPage(THREAD).hasMore).toBe(true);
  expect(chatStore.getPage(THREAD).oldestId).toBe(items[0].id);
});

test('a hydrated group folds back to its row instead of being dropped', () => {
  // The cheap unloading: the work of a group the reader opened goes back to the one row the
  // server sent for it. Nothing leaves the thread, so nothing has to be fetched to read it again.
  const work = gen(MAX_HELD_ITEMS, 'w');
  chatStore.seedHistory(THREAD, [...gen(20, 'head'), foldedRow('w-0', work.length, 'w-last'), ...gen(20, 'tail')]);
  chatStore.setPage(THREAD, { nextBefore: 0, hasMore: false });
  chatStore.hydrateRun(THREAD, 'run-w-0', work);
  expect(chatStore.getItems(THREAD).length).toBe(work.length + 40);

  chatStore.setTrimAllowed(THREAD, true);
  const items = chatStore.getItems(THREAD);
  // The group is one row again, and the bubbles around it never moved.
  expect(items.length).toBe(41);
  expect(items.filter(item => item.kind === 'run').map(item => item.id)).toEqual(['run-w-0']);
  expect(items[0].id).toBe('head-0');
  expect(items[items.length - 1].id).toBe('tail-19');
  // Nothing was lost, so the pager is left exactly as it was.
  expect(chatStore.getPage(THREAD).hasMore).toBe(false);
});

test('a folded-back group can be opened again', () => {
  // What a module-level "already asked" memo would have broken: the row is idle again, so the
  // next open fetches it rather than showing a skeleton that never fills.
  const work = gen(MAX_HELD_ITEMS, 'w');
  chatStore.seedHistory(THREAD, [foldedRow('w-0', work.length, 'w-last'), ...gen(20, 'tail')]);
  chatStore.hydrateRun(THREAD, 'run-w-0', work);
  chatStore.setTrimAllowed(THREAD, true);

  const row = chatStore.getItems(THREAD).find(item => item.kind === 'run');
  expect(row).toMatchObject({ id: 'run-w-0', hydration: 'idle', lastId: 'w-last' });
  // And it still stands for the same range: the row is the server's, kept verbatim.
  expect(row?.kind === 'run' ? row.itemCount : 0).toBe(work.length);
});

test('folding back is preferred, dropping is what is left', () => {
  // A group worth folding, but not enough of one: the rest of the thread still has to go.
  const work = gen(1000, 'w');
  chatStore.seedHistory(THREAD, [...gen(MAX_HELD_ITEMS, 'live'), foldedRow('w-0', work.length, 'w-last')]);
  chatStore.setPage(THREAD, { nextBefore: 0, hasMore: false });
  chatStore.hydrateRun(THREAD, 'run-w-0', work);

  chatStore.setTrimAllowed(THREAD, true);
  const items = chatStore.getItems(THREAD);
  expect(items.length).toBe(TRIM_TO_ITEMS);
  // The group survived as its row, at the end where it was; the live items above it are what
  // went, and the pager was told.
  expect(items[items.length - 1]).toMatchObject({ kind: 'run', id: 'run-w-0' });
  expect(chatStore.getPage(THREAD).hasMore).toBe(true);
});

test('a run streaming in all day cleans up on its own, without a single sync', () => {
  // The live path never asks the server for anything, so the sync deltas that used to be the
  // only trim point never come. A conversation left open would grow until the app died.
  chatStore.seedHistory(THREAD, gen(20, 'start'));
  chatStore.setPage(THREAD, { nextBefore: 0, hasMore: false });
  chatStore.setTrimAllowed(THREAD, true);

  for (let i = 0; i < MAX_HELD_ITEMS; i += 1) {
    chatStore.addToolCall(THREAD, { id: `card-${i}`, name: 'bash', args: {}, output: 'ok', ok: true, truncated: false });
  }

  const items = chatStore.getItems(THREAD);
  expect(items.length).toBeLessThanOrEqual(MAX_HELD_ITEMS);
  // The newest card is still the last thing in the thread: the reader watching the run sees it.
  expect(items[items.length - 1].id).toBe(`card-${MAX_HELD_ITEMS - 1}`);
  // And what went is reachable again.
  const page = chatStore.getPage(THREAD);
  expect(page.hasMore).toBe(true);
  expect(page.oldestId).toBe(items[0].id);
});

test('the reader up in the history is never trimmed under, live or not', () => {
  chatStore.seedHistory(THREAD, gen(20, 'start'));
  chatStore.setTrimAllowed(THREAD, false);
  for (let i = 0; i < MAX_HELD_ITEMS; i += 1) {
    chatStore.addToolCall(THREAD, { id: `card-${i}`, name: 'bash', args: {}, output: 'ok', ok: true, truncated: false });
  }
  // Nothing dropped: what they are reading stays put until they come back down.
  expect(chatStore.getItems(THREAD).length).toBe(MAX_HELD_ITEMS + 20);
  expect(chatStore.getItems(THREAD)[0].id).toBe('start-0');
});
