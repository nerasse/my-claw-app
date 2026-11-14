/**
 * Where the live compaction rule belongs while a send waits behind it.
 *
 * The rule is drawn in the list header, which on an inverted list is the bottom of the screen:
 * right when nothing follows it, wrong the moment the owner types while the summarizer runs. That
 * message is a row, so it landed *above* the rule, and the boundary the compaction then writes puts
 * it below -- the thread reordered itself under the reader for no reason he could see.
 */

import { compactionRuleBefore } from '../runRows';
import type { ChatItem } from '../chat';

function said(id: string, queuedReason?: 'compaction' | 'injection'): ChatItem {
  return {
    kind: 'text',
    id,
    role: 'user',
    text: id,
    ts: 1,
    ...(queuedReason ? { queuedSince: 1, queuedReason } : {}),
  } as ChatItem;
}

test('nothing parked leaves the rule where the thread stops', () => {
  expect(compactionRuleBefore([said('a'), said('b')])).toBeUndefined();
});

test('a send parked behind the compaction takes the rule above it', () => {
  expect(compactionRuleBefore([said('a'), said('parked', 'compaction')])).toBe('parked');
});

test('the first parked send wins: they all queue behind one compaction', () => {
  const items = [said('a'), said('first', 'compaction'), said('second', 'compaction')];
  expect(compactionRuleBefore(items)).toBe('first');
});

test('a send waiting for the next turn is not waiting for the compaction', () => {
  expect(compactionRuleBefore([said('a'), said('mailbox', 'injection')])).toBeUndefined();
});

test('a bubble that stopped waiting stops moving the rule', () => {
  expect(compactionRuleBefore([said('a'), said('sent')])).toBeUndefined();
});

/**
 * And now the placement itself, measured on 2026-09-11.
 *
 * Drawing the rule *inside* the parked bubble's cell did not survive the inverted list: a cell is
 * laid out `column-reverse` under a scaleY flip, so a cell with two children renders them the other
 * way round -- the owner saw the bubble above the rule, exactly what the cell placement was meant
 * to prevent. A row of the list is ordered by the data, which is what the inversion is built on.
 */
import { buildRows, type ChatRow } from '../runRows';

const label = (row: ChatRow): string =>
  row.kind === 'item'
    ? row.item.id
    : row.kind === 'rule'
      ? 'RULE'
      : row.kind === 'day'
        ? 'DAY'
        : `group(${row.run.id})`;

/** The items of a thread: a question, the answer to it, then the send parked behind a compaction. */
function thread(): ChatItem[] {
  return [
    said('q1'),
    { kind: 'text', id: 'a1', role: 'agent', text: 'answered', ts: 2, streaming: false, attachments: [] } as ChatItem,
    said('parked', 'compaction'),
  ];
}

test('the rule is a row of its own, immediately above the send it holds', () => {
  const items = thread();
  const rows = buildRows(items, compactionRuleBefore(items));
  // Reading order, oldest first: the parked send is still the last thing the thread says, and the
  // divider now stands above it rather than under it.
  expect(rows.map(label)).toEqual(['q1', 'a1', 'RULE', 'parked']);
});

test('nothing parked leaves the rows alone, so the header keeps drawing the rule', () => {
  const items = [said('q1'), said('a1')];
  const rows = buildRows(items, compactionRuleBefore(items));
  expect(rows.map(label)).toEqual(['q1', 'a1']);
  expect(rows.some(row => row.kind === 'rule')).toBe(false);
});

test('the rule stands immediately above the bubble it holds, group or not', () => {
  // A run's work sits above the parked bubble: the rule is inserted at the bubble's own place in
  // the thread, so the group before it ends there rather than being cut by a row drawn after it.
  const rows = buildRows(thread(), 'parked');
  const at = rows.findIndex(row => row.kind === 'rule');
  expect(at).toBeGreaterThanOrEqual(0);
  expect(rows[at + 1]!.kind).toBe('item');
  expect(rows[at - 1]!.kind).toBe('item');
});

test('a send that already left is not held by a rule', () => {
  const items = [said('q1'), said('sent')];
  const rows = buildRows(items, compactionRuleBefore(items));
  expect(rows.map(label)).toEqual(['q1', 'sent']);
});
