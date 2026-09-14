import { chatStore } from '../chat';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { parseServerFrame } from '../protocol';

/**
 * The thinking of a compaction, live and after a resync.
 *
 * 2026-09-14: a summarizer inheriting `reasoning_effort: max` spends a minute thinking before its
 * first word, and that phase was received by the server and dropped on the floor. On screen there
 * was a rule with a counter and nothing else, so a model thinking hard looked exactly like a dead
 * provider -- which is what the owner was staring at while deepseek was mute.
 */

const THREAD = 't-compact-think';
const handlers = { activeThreadId: () => null } as unknown as ServerFrameHandlers;

beforeEach(() => {
  chatStore.clearAll();
});

function route(frame: Record<string, unknown>): void {
  // Through the parser, not around it: `parseServerFrame` is a whitelist, and a field it drops is
  // a field the router never sees -- the failure mode a typed object handed straight in hides.
  const parsed = parseServerFrame(JSON.stringify(frame));
  expect(parsed).not.toBeNull();
  routeServerFrame(parsed!, handlers);
}

test('the thinking of a compaction reaches the thread', () => {
  route({ type: 'chat.compacting', threadId: THREAD, since: '2026-09-14T20:00:00.000Z' });
  route({ type: 'chat.compacting.delta', threadId: THREAD, reasoning: 'weighing what ' });
  route({ type: 'chat.compacting.delta', threadId: THREAD, reasoning: 'matters here' });

  expect(chatStore.getCompacting(THREAD)?.reasoning).toBe('weighing what matters here');
  // The summary is untouched by it: two phases, two fields.
  expect(chatStore.getCompacting(THREAD)?.text).toBe('');
});

test('the summary and the thinking do not write over each other', () => {
  route({ type: 'chat.compacting', threadId: THREAD, since: '2026-09-14T20:00:00.000Z' });
  route({ type: 'chat.compacting.delta', threadId: THREAD, reasoning: 'thinking' });
  route({ type: 'chat.compacting.delta', threadId: THREAD, text: 'The user was' });

  const run = chatStore.getCompacting(THREAD);
  expect(run?.reasoning).toBe('thinking');
  expect(run?.text).toBe('The user was');
});

test('a window opening mid-compaction is handed the thinking so far', () => {
  // The sync carries the state of the thread, both ways -- docs/thread-sync.md. Without the
  // thinking on it, a reconnect during the thinking phase falls back to a bare counter.
  route({
    type: 'session.sync.result',
    threadId: THREAD,
    entries: [],
    compacting: { since: '2026-09-14T20:00:00.000Z', reasoning: 'already thinking about it' },
  });

  expect(chatStore.getCompacting(THREAD)?.reasoning).toBe('already thinking about it');
});

test('a sync with no compaction takes the thinking down with the rule', () => {
  route({ type: 'chat.compacting', threadId: THREAD, since: '2026-09-14T20:00:00.000Z' });
  route({ type: 'chat.compacting.delta', threadId: THREAD, reasoning: 'thinking' });

  route({ type: 'session.sync.result', threadId: THREAD, entries: [] });

  expect(chatStore.getCompacting(THREAD)).toBeUndefined();
});

test('a fragment for a compaction the client never heard of is dropped', () => {
  // Same rule as the summary fragments: no start instant, no rule to hang them on.
  route({ type: 'chat.compacting.delta', threadId: THREAD, reasoning: 'orphan' });

  expect(chatStore.getCompacting(THREAD)).toBeUndefined();
});
