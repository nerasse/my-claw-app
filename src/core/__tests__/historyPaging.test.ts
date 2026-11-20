import { chatStore } from '../chat';
import { connection } from '../connection';
import { dropInflightHistory, receiveOlderHistory, requestOlderHistory, syncOlderHistory } from '../historyPaging';

const THREAD = 'paged';
const held = { id: 'p3', role: 'user' as const, text: 'current page', ts: '2026-11-20T14:03:00Z' };
const older = { id: 'p2', role: 'user' as const, text: 'older page', ts: '2026-11-20T14:02:00Z' };
const first = { id: 'p1', role: 'user' as const, text: 'first page', ts: '2026-11-20T14:01:00Z' };
const reply = {
  type: 'chat.history' as const, threadId: THREAD, before: 4, beforeId: held.id,
  messages: [older], nextBefore: 6, hasMore: true,
};

beforeEach(() => {
  jest.useFakeTimers();
  chatStore.clearAll();
  chatStore.seedHistory(THREAD, [held]);
  chatStore.setPage(THREAD, { nextBefore: 4, hasMore: true });
  jest.spyOn(connection, 'send').mockResolvedValue(true);
});

afterEach(() => {
  dropInflightHistory();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const ids = () => chatStore.getItems(THREAD).map(item => item.id);

test('a sync with an empty log settles the opening without inventing a cursor', () => {
  const empty = 'cleared';
  expect(chatStore.getPage(empty).loaded).toBe(false);
  chatStore.handleSyncResult(empty, [], null, null, false);
  expect(chatStore.getPage(empty)).toMatchObject({ loaded: true, hasMore: false });
});

test('only the requested cursor may land, and it advances once', () => {
  requestOlderHistory(THREAD);
  requestOlderHistory(THREAD);
  expect(connection.send).toHaveBeenCalledTimes(1);

  receiveOlderHistory({ ...reply, beforeId: 'unrelated' });
  expect(ids()).toEqual([held.id]);
  expect(chatStore.getPage(THREAD).loading).toBe(true);

  receiveOlderHistory(reply);
  receiveOlderHistory(reply);
  expect(ids()).toEqual([older.id, held.id]);
  expect(chatStore.getPage(THREAD)).toMatchObject({ oldestId: older.id, nextBefore: 6, loading: false });
});

test('a missing page unblocks the pager, and explicit retry uses the same cursor', () => {
  requestOlderHistory(THREAD);
  jest.advanceTimersByTime(15_000);
  expect(chatStore.getPage(THREAD)).toMatchObject({ loading: false, failed: true });
  requestOlderHistory(THREAD);
  expect(connection.send).toHaveBeenCalledTimes(1);
  requestOlderHistory(THREAD, true);
  expect(connection.send).toHaveBeenCalledTimes(2);
  receiveOlderHistory(reply);
  expect(ids()).toEqual([older.id, held.id]);
  expect(chatStore.getPage(THREAD).failed).toBeFalsy();
});

test('a journal-only page can advance the count while the first displayed id is unchanged', () => {
  requestOlderHistory(THREAD);
  receiveOlderHistory({ ...reply, messages: [] });
  expect(ids()).toEqual([held.id]);
  expect(chatStore.getPage(THREAD)).toMatchObject({ oldestId: held.id, nextBefore: 6 });
  requestOlderHistory(THREAD);
  expect(connection.send).toHaveBeenLastCalledWith(expect.not.stringContaining('beforeId'));
  expect(connection.send).toHaveBeenLastCalledWith(expect.stringContaining('"before":6'));
  receiveOlderHistory({ ...reply, beforeId: undefined, before: 6, nextBefore: 6, messages: [] });
  expect(chatStore.getPage(THREAD)).toMatchObject({ loading: false, failed: true });
});

test('an older response cannot cross an edge changed by a fresh window', () => {
  requestOlderHistory(THREAD);
  chatStore.handleSyncResult(THREAD, [first, older, held], held.id, held.id, false, undefined, false, true, 9);
  receiveOlderHistory({ ...reply, messages: [{ ...first, id: 'overlap' }] });
  expect(ids()).toEqual([first.id, older.id, held.id]);
  expect(chatStore.getPage(THREAD)).toMatchObject({ oldestId: first.id, nextBefore: 9, loading: false });
});

test('a same-edge window cannot start a second request while a page is in flight', () => {
  requestOlderHistory(THREAD);
  chatStore.handleSyncResult(THREAD, [held], held.id, held.id, false, undefined, false, true, 5);
  syncOlderHistory(THREAD);
  expect(chatStore.getPage(THREAD).loading).toBe(true);
  requestOlderHistory(THREAD);
  expect(connection.send).toHaveBeenCalledTimes(1);
  receiveOlderHistory(reply);
  expect(ids()).toEqual([older.id, held.id]);
});

test('a new newest window keeps the cursor of already loaded history', () => {
  requestOlderHistory(THREAD);
  receiveOlderHistory(reply);
  chatStore.handleSyncResult(THREAD, [held], held.id, held.id, false, undefined, false, true, 4);
  expect(ids()).toEqual([older.id, held.id]);
  expect(chatStore.getPage(THREAD)).toMatchObject({ oldestId: older.id, nextBefore: 6, hasMore: true });
});
