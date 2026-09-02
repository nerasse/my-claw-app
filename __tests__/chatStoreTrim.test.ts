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
