/**
 * A compaction cuts the fold, and starts a new one.
 *
 * The owner, 2026-11-14, over a live thread: a group headed `3 steps · 1 cron · 1 shell · 1 thought`
 * still wearing `running · 3 min 41 s`, with the compaction rule drawn *under* it and the work it
 * had been interrupted in the middle of -- "un compact doit couper le groupe et passer a un nouveau
 * ou attendre le suivant". The rule was a row *between* rows, so the fold went straight through the
 * boundary: the group counted work from both sides of it, and stayed the segment being written.
 */

import { buildRows, type ChatRow } from '../runRows';
import type { ChatItem, RunInfo } from '../chat';

const run: RunInfo = { id: 'r1', status: 'running', startTs: 1 };

const tool = (id: string): ChatItem =>
  ({ kind: 'tool', id, name: 'bash', args: { command: 'ls' }, output: '', ok: true, truncated: false, ts: 2, run }) as ChatItem;

const thought = (id: string): ChatItem =>
  ({ kind: 'text', id, role: 'agent', text: '', attachments: [], streaming: false, reasoning: 'hmm', ts: 3, run }) as ChatItem;

const parked = (id: string): ChatItem =>
  ({
    kind: 'text',
    id,
    role: 'user',
    text: 'attends la compaction',
    attachments: [],
    streaming: false,
    queuedSince: 1,
    queuedReason: 'compaction',
    ts: 4,
  }) as ChatItem;

const label = (row: ChatRow): string => {
  if (row.kind === 'group') return `g[${row.items.map(item => item.id).join(',')}]${row.live ? ' LIVE' : ''}`;
  if (row.kind === 'item') return `i:${row.item.id}`;
  return row.kind;
};

test('the work before the boundary is one closed group, the work after it another', () => {
  // A run interrupted by a compaction, then picking its work back up on the other side of it.
  const rows = buildRows([tool('c1'), thought('t1'), tool('c2'), parked('p'), tool('c3'), thought('t2')], 'p');

  expect(rows.map(label)).toEqual(['g[c1,t1,c2]', 'rule', 'i:p', 'g[c3,t2] LIVE']);
  const groups = rows.filter((row): row is Extract<ChatRow, { kind: 'group' }> => row.kind === 'group');
  expect(groups.map(group => group.run.id)).toEqual(['r1', 'r1']);
});

test('a boundary with nothing after it leaves no group spinning', () => {
  // Nothing was written since the compaction: the group above it is the past, whatever the run's
  // status still says. It used to keep the spinner and the clock of a run being written.
  const rows = buildRows([tool('c1'), thought('t1'), parked('p')], 'p');
  expect(rows.map(label)).toEqual(['g[c1,t1]', 'rule', 'i:p']);
  expect(rows.some(row => row.kind === 'group' && row.live === true)).toBe(false);
});

test('no boundary, one fold: the work of the run is not cut for nothing', () => {
  const rows = buildRows([tool('c1'), thought('t1'), tool('c2')]);
  expect(rows.map(label)).toEqual(['g[c1,t1,c2] LIVE']);
});
