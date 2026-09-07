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
