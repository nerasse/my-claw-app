/**
 * One id, one row.
 *
 * `chat.stream.start` used to append unconditionally. The page is normally the last settled call,
 * so a turn in flight never collided with an entry -- but a session that wrote its answer before
 * the run ended (a stopped turn, an interrupted one, a phase the recorder settled) puts the same
 * id on the page, and the frame then drew a second bubble under that id. Reopening a sub-agent chat
 * mid-run showed the answer twice: the persisted copy, then a fresh one that started empty and
 * refilled by replay (owner, 2026-11-25).
 *
 * A bubble the thread already carries is the row to continue, so the store marks it streaming and
 * lets its deltas append to the words already there.
 */

import { chatStore } from '../chat';
import type { HistoryEntry } from '../protocol';

const T = 'stream-carried';
const runMeta = { id: 'r1', status: 'running' as const, startTs: '2026-01-01T00:00:00.000Z' };

beforeEach(() => chatStore.clearAll());

const page: HistoryEntry[] = [
  { role: 'user', id: 'u1', ts: '2026-01-01T00:00:00.000Z', text: 'go', run: runMeta },
  { role: 'assistant', id: 'answer', ts: '2026-01-01T00:00:01.000Z', text: 'deja ecrit', run: runMeta },
] as HistoryEntry[];

test('a stream opening on a bubble the page carries continues it instead of adding a second', () => {
  chatStore.handleSyncResult(T, page, 'head', 'head', true);

  chatStore.startStream(T, 'answer');
  chatStore.appendDelta(T, 'answer', ', la suite');

  const rows = chatStore.getItems(T);
  expect(rows.map(item => item.id)).toEqual(['u1', 'answer']);
  const answer = rows.find(item => item.id === 'answer');
  expect(answer?.kind === 'text' ? answer.text : null).toBe('deja ecrit, la suite');
  expect(answer?.kind === 'text' ? answer.streaming : null).toBe(true);
});

test('a replay replaces the words of that one bubble, it does not double them', () => {
  chatStore.handleSyncResult(T, page, 'head', 'head', true);

  chatStore.startStream(T, 'answer');
  chatStore.appendDelta(T, 'answer', 'deja ecrit et plus', true);

  const answers = chatStore.getItems(T).filter(item => item.id === 'answer');
  expect(answers).toHaveLength(1);
  expect(answers[0]?.kind === 'text' ? answers[0].text : null).toBe('deja ecrit et plus');
});

test('a bubble the page does not carry is still opened as its own row', () => {
  chatStore.handleSyncResult(T, page, 'head', 'head', true);

  chatStore.startStream(T, 'next');
  chatStore.appendDelta(T, 'next', 'bonjour');

  expect(chatStore.getItems(T).map(item => item.id)).toEqual(['u1', 'answer', 'next']);
});
