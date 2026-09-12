/**
 * The summary a compaction writes, shown while it is written.
 *
 * The operation is one to two minutes of nothing on the wire. Since 2026-09-12 the summarizer
 * streams, so the text is available as it arrives; before that the thread showed a bare counter
 * and the owner could not tell a working compaction from a stuck one.
 */

import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { chatStore } from '../chat';

const T = 'thread-progress';
const handlers = { activeThreadId: () => null } as unknown as ServerFrameHandlers;

describe('the summary being written', () => {
  beforeEach(() => chatStore.clearThread(T));
  afterEach(() => chatStore.clearThread(T));

  it('is held nowhere until a compaction is known on the thread', () => {
    // A fragment arriving first would build the rule out of a partial state, with no start
    // instant to count from.
    routeServerFrame({ type: 'chat.compacting.delta', threadId: T, text: 'Prior work: ' }, handlers);
    expect(chatStore.getCompacting(T)).toBeUndefined();
  });

  it('accumulates, one fragment at a time', () => {
    routeServerFrame({ type: 'chat.compacting', threadId: T, since: '2026-09-12T00:00:00.000Z' }, handlers);
    routeServerFrame({ type: 'chat.compacting.delta', threadId: T, text: 'Prior work: ' }, handlers);
    routeServerFrame({ type: 'chat.compacting.delta', threadId: T, text: 'we fixed the runner.' }, handlers);
    expect(chatStore.getCompacting(T)).toMatchObject({ text: 'Prior work: we fixed the runner.' });
  });

  it('is handed whole when a window arrives mid-compaction', () => {
    // The replayed frame carries everything written so far, not a fragment: a window that opens
    // now has seen none of it.
    routeServerFrame({
      type: 'chat.compacting',
      threadId: T,
      since: '2026-09-12T00:00:00.000Z',
      text: 'Prior work: we fixed the runner.',
    }, handlers);
    expect(chatStore.getCompacting(T)).toMatchObject({ text: 'Prior work: we fixed the runner.' });
  });

  it('goes with the operation, not before it', () => {
    routeServerFrame({ type: 'chat.compacting', threadId: T, since: '2026-09-12T00:00:00.000Z' }, handlers);
    routeServerFrame({ type: 'chat.compacting.delta', threadId: T, text: 'Prior work: ' }, handlers);
    routeServerFrame({ type: 'chat.compacting', threadId: T }, handlers);
    expect(chatStore.getCompacting(T)).toBeUndefined();
  });
});
