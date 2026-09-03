/**
 * A finished run's work is not sent with the page: a header stands for it, and the reader who
 * opens the group pays for the items -- docs/run-hydration.md. The round trip that lifts the fold
 * is guarded here: asked once per range, spliced where the row was, and said out loud when the
 * branch no longer holds it.
 */

const mockSend = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.mock('../connection', () => ({ connection: { send: (frame: string) => mockSend(frame) } }));

import { requestRunItems, resetRunItemAsks } from '../runItems';
import { chatStore, type RunSummaryItem } from '../chat';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import type { HistoryEntry, RunMeta, ServerFrame } from '../protocol';

const handlers = {} as ServerFrameHandlers;
const route = (frame: ServerFrame): void => routeServerFrame(frame, handlers);

const THREAD = 't1';
const RUN: RunMeta = { id: 'r1', status: 'done', startTs: '2026-01-01T00:00:00.000Z', endTs: '2026-01-01T00:01:00.000Z' };

/** The page as the server sends it when the client asked to fold: question, header, answer. */
const foldedPage: HistoryEntry[] = [
  { id: 'q', role: 'user', text: 'fais le travail', ts: '2026-01-01T00:00:00.000Z' },
  { id: 'run-w1', role: 'run', ts: '2026-01-01T00:00:01.000Z', run: RUN, toolCount: 2, firstTool: 'bash', itemCount: 3, lastId: 'w3' },
  { id: 'a', role: 'assistant', text: 'voila', ts: '2026-01-01T00:01:00.000Z', run: RUN },
];

/** What the row stood for, as the hydration answer carries it. */
const work: HistoryEntry[] = [
  { id: 'w1', role: 'assistant', text: 'etape', ts: '2026-01-01T00:00:02.000Z', run: RUN },
  { role: 'tool', id: 'w2', name: 'bash', args: {}, output: 'ok', ok: true, truncated: false, ts: '2026-01-01T00:00:03.000Z', run: RUN },
  { role: 'tool', id: 'w3', name: 'bash', args: {}, output: 'ok', ok: true, truncated: false, ts: '2026-01-01T00:00:04.000Z', run: RUN },
];

const rowOf = (threadId: string): RunSummaryItem => {
  const row = chatStore.getItems(threadId).find(item => item.kind === 'run');
  if (!row || row.kind !== 'run') throw new Error('no folded row in the thread');
  return row;
};

beforeEach(() => {
  mockSend.mockClear();
  mockSend.mockImplementation(() => Promise.resolve());
  resetRunItemAsks();
  chatStore.clearAll();
  chatStore.seedHistory(THREAD, foldedPage);
});

test('a folded page holds one row where the work was', () => {
  expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['q', 'run-w1', 'a']);
  expect(rowOf(THREAD)).toMatchObject({ toolCount: 2, itemCount: 3, lastId: 'w3', hydration: 'idle' });
});

test('opening asks for the range the row carries, and marks it loading', () => {
  requestRunItems(THREAD, [rowOf(THREAD)]);
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(JSON.parse(mockSend.mock.calls[0]![0])).toEqual({
    type: 'session.run.items',
    threadId: THREAD,
    fromId: 'run-w1',
    untilId: 'w3',
  });
  expect(rowOf(THREAD).hydration).toBe('loading');
});

test('the answer takes the row place, in order', () => {
  requestRunItems(THREAD, [rowOf(THREAD)]);
  route({ type: 'chat.run.items', threadId: THREAD, fromId: 'run-w1', messages: work, found: true });
  // The thread reads exactly as it would have with an unfolded page.
  expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['q', 'w1', 'w2', 'w3', 'a']);
  expect(chatStore.getItems(THREAD).some(item => item.kind === 'run')).toBe(false);
});

test('the same range is never asked twice', () => {
  // A group can be opened, closed and opened again, and the row re-renders on every store change.
  requestRunItems(THREAD, [rowOf(THREAD)]);
  requestRunItems(THREAD, [rowOf(THREAD)]);
  expect(mockSend).toHaveBeenCalledTimes(1);
});

test('a range the branch no longer holds is said, not spun forever', () => {
  requestRunItems(THREAD, [rowOf(THREAD)]);
  route({ type: 'chat.run.items', threadId: THREAD, fromId: 'run-w1', messages: [], found: false });
  expect(rowOf(THREAD).hydration).toBe('failed');
  // And the row is still there: a group that empties itself in silence is worse than one that
  // says the work is gone.
  expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['q', 'run-w1', 'a']);
});

test('an ask that never left the device can be tried again', () => {
  mockSend.mockImplementation(() => Promise.reject(new Error('socket down')));
  requestRunItems(THREAD, [rowOf(THREAD)]);
  return Promise.resolve().then(() => {
    expect(rowOf(THREAD).hydration).toBe('idle');
    mockSend.mockImplementation(() => Promise.resolve());
    requestRunItems(THREAD, [rowOf(THREAD)]);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});

test('items already held are not spliced twice', () => {
  // The answer arriving twice (a retry racing its own reply) must not double the group.
  requestRunItems(THREAD, [rowOf(THREAD)]);
  route({ type: 'chat.run.items', threadId: THREAD, fromId: 'run-w1', messages: work, found: true });
  route({ type: 'chat.run.items', threadId: THREAD, fromId: 'run-w1', messages: work, found: true });
  expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['q', 'w1', 'w2', 'w3', 'a']);
});

test('a merged group asks for every range it stands for', () => {
  // A run cut by a page boundary folds once per page; the two rows merged into one group, so
  // opening it has to fetch both.
  chatStore.clearAll();
  chatStore.seedHistory(THREAD, [
    { id: 'run-o1', role: 'run', ts: '2026-01-01T00:00:00.000Z', run: RUN, toolCount: 9, itemCount: 9, lastId: 'o9' },
    ...foldedPage,
  ]);
  const rows = chatStore.getItems(THREAD).filter((item): item is RunSummaryItem => item.kind === 'run');
  requestRunItems(THREAD, rows);
  expect(mockSend.mock.calls.map(call => JSON.parse(call[0]).fromId)).toEqual(['run-o1', 'run-w1']);
});

test('the paging cursor follows the items that replaced the oldest row', () => {
  // The row can be the oldest thing held. Left pointing at an id that no longer exists, the next
  // scroll up would ask for a page before nothing -- which is how paging died in 0.4.83.
  chatStore.clearAll();
  chatStore.seedHistory(THREAD, foldedPage.slice(1));
  chatStore.setPage(THREAD, { nextBefore: 10, hasMore: true });
  expect(chatStore.getPage(THREAD).oldestId).toBe('run-w1');
  requestRunItems(THREAD, [rowOf(THREAD)]);
  route({ type: 'chat.run.items', threadId: THREAD, fromId: 'run-w1', messages: work, found: true });
  expect(chatStore.getPage(THREAD).oldestId).toBe('w1');
});
