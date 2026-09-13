/**
 * The compaction state a resynchronisation carries, in both directions.
 *
 * The end of a compaction is broadcast once, to the windows connected at that second. Everything
 * else on the thread has something to correct a window that missed it -- the boundary is in the
 * history, the end of a run arrives with the run -- but a compaction that ends while the socket is
 * down has nothing at all, and the rule it drew stays on screen, counter still climbing, until
 * something unrelated takes it down. Measured on the owner's phone on 2026-09-13: nineteen minutes
 * of a compaction that had finished, next to the boundary it had written.
 *
 * `session.sync` is what a fresh socket asks for, so that is where the thread's state is said.
 */

import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { chatStore } from '../chat';

const T = 'thread-reconcile';
const handlers = { activeThreadId: () => null } as unknown as ServerFrameHandlers;

function sync(extra: Record<string, unknown> = {}): void {
  routeServerFrame(
    { type: 'session.sync.result', threadId: T, entries: [], leaf: null, head: null, ...extra },
    handlers,
  );
}

describe('the compaction state a sync carries', () => {
  beforeEach(() => chatStore.clearThread(T));
  afterEach(() => chatStore.clearThread(T));

  it('takes the rule down when the thread is not compacting', () => {
    chatStore.setCompacting(T, Date.now(), '');
    expect(chatStore.getCompacting(T)).toBeDefined();

    sync();

    expect(chatStore.getCompacting(T)).toBeUndefined();
  });

  it('raises it, with the text written so far, when the thread is', () => {
    sync({ compacting: { since: '2026-09-13T00:00:00.000Z', text: 'Prior work: ' } });

    expect(chatStore.getCompacting(T)).toMatchObject({ text: 'Prior work: ' });
  });

  it('counts from the instant it began, not from the sync', () => {
    const since = Date.parse('2026-09-13T00:00:00.000Z');
    sync({ compacting: { since: '2026-09-13T00:00:00.000Z' } });

    expect(chatStore.getCompacting(T)?.since).toBe(since);
  });
});
