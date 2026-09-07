/**
 * A fresh page landing on a thread the window already holds.
 *
 * `session.sync` with a null cursor answers the newest window of the branch, not a delta, and
 * `resume` sends exactly that on every reconnect. The thread it lands on is rarely empty: the
 * store caches every thread it has drawn, so the page has to *replace* what is held. Appended
 * instead, it duplicates whatever it renders under an id the live run never used -- captured on a
 * real session (37e36291), where the reader ended up with the same error twice and the same run
 * twice, the second copies below the answer.
 */

import { chatStore } from '../chat';
import { buildRows } from '../runRows';
import type { HistoryEntry } from '../protocol';

const T = 'thread-fresh';
const ERROR = 'LLM stream request failed: HTTP 400 - Request is missing x-opencode-session';

/** The window the server serves for that session: the failure, the run folded, the answer. */
const PAGE: HistoryEntry[] = [
  { id: 'e-user-1', role: 'user', text: 'myclaw update failed', ts: '2026-09-07T09:04:07.137Z', attachments: [] },
  { id: 'e-failure', role: 'assistant', text: '', ts: '2026-09-07T09:04:07.866Z', attachments: [], error: ERROR },
  { id: 'e-user-2', role: 'user', text: '?', ts: '2026-09-07T09:04:58.008Z', attachments: [] },
  {
    id: 'run-e-phase-1',
    role: 'run',
    ts: '2026-09-07T09:05:00.762Z',
    run: { id: 'run-2', status: 'done', startTs: '2026-09-07T09:04:58.008Z', endTs: '2026-09-07T09:05:51.774Z' },
    toolCount: 5,
    firstTool: 'bash',
    itemCount: 10,
    lastId: 'e-tool-5',
  },
  {
    id: 'e-answer',
    role: 'assistant',
    text: "Ce n'etait pas /var/tmp le probleme",
    ts: '2026-09-07T09:05:51.774Z',
    attachments: [],
    run: { id: 'run-2', status: 'done', startTs: '2026-09-07T09:04:58.008Z', endTs: '2026-09-07T09:05:51.774Z' },
  },
];

/** What the window drew live: the run that died, then the run that worked. */
function playLive(): void {
  chatStore.addUserMessage(T, 'e-user-1', 'myclaw update failed', []);
  // The run died before its first token: the store invents the bubble under the stream's id,
  // while the server journals a `failure` entry under an id of its own.
  chatStore.abortStream(T, 'stream-1', ERROR);
  chatStore.addUserMessage(T, 'e-user-2', '?', []);
  chatStore.startRun(T, 'run-2');
  for (let i = 1; i <= 5; i++) {
    chatStore.addToolCall(T, {
      id: `e-tool-${i}`,
      name: 'bash',
      args: { command: `check ${i}` },
      durationMs: 7,
      ok: true,
      output: 'ok',
      truncated: false,
    });
  }
  chatStore.addAgentMessage(T, 'e-answer', "Ce n'etait pas /var/tmp le probleme", []);
  chatStore.endRun(T);
}

beforeEach(() => {
  chatStore.clearAll();
});

test('a fresh page replaces the thread it lands on: one error, one run, in order', () => {
  playLive();
  // The reconnect: resume asks with a null cursor, so this is a window and not a delta.
  chatStore.handleSyncResult(T, PAGE, 'e-answer', 'e-answer', false, undefined, false, false, 0);

  expect(chatStore.getItems(T).map(item => item.id)).toEqual([
    'e-user-1',
    'e-failure',
    'e-user-2',
    'run-e-phase-1',
    'e-answer',
  ]);
});

test('the rows a reader sees hold no second copy of the error, nor of the run', () => {
  playLive();
  chatStore.handleSyncResult(T, PAGE, 'e-answer', 'e-answer', false, undefined, false, false, 0);

  const rows = buildRows(chatStore.getItems(T));
  const errors = rows.filter(row => row.kind === 'item' && row.item.kind === 'text' && row.item.error === ERROR);
  const groups = rows.filter(row => row.kind === 'folded' || row.kind === 'group');
  expect(errors).toHaveLength(1);
  expect(groups).toHaveLength(1);
  // The answer is the last thing the reader meets, not a run header under it.
  const last = rows[rows.length - 1];
  expect(last?.kind === 'item' && last.item.id).toBe('e-answer');
});

test('a turn in flight survives the page that replaces the thread around it', () => {
  playLive();
  chatStore.startRun(T, 'run-3');
  chatStore.addUserMessage(T, 'e-user-3', 'and now', []);
  chatStore.startStream(T, 'stream-2');
  chatStore.appendDelta(T, 'stream-2', 'looking');
  chatStore.startToolCall(T, 'call-live', 'bash', { command: 'sleep 30' });
  chatStore.handleSyncResult(T, PAGE, 'e-answer', 'e-answer', true, undefined, false, false, 0);

  const ids = chatStore.getItems(T).map(item => item.id);
  // The page's own items, then what only this window holds: the question it has not journalled
  // yet, the bubble being streamed into and the card still running.
  expect(ids).toEqual([
    'e-user-1',
    'e-failure',
    'e-user-2',
    'run-e-phase-1',
    'e-answer',
    'e-user-3',
    'stream-2',
    'call-live',
  ]);
});

test('a delta is still appended: a page is not the only thing a sync carries', () => {
  playLive();
  chatStore.handleSyncResult(
    T,
    [{ id: 'e-note', role: 'assistant', text: 'later', ts: '2026-09-07T09:06:00.000Z', attachments: [] }],
    'e-note',
    'e-note',
    false,
    undefined,
    false,
  );

  expect(chatStore.getItems(T).map(item => item.id)).toContain('e-note');
  expect(chatStore.getItems(T).map(item => item.id)).toContain('stream-1');
});
