/**
 * When the "waiting for the compaction" badge comes off.
 *
 * The badge says a send is held because a compaction is rewriting the history its run would resume.
 * It used to wait for the agent to say something -- a stream start, an answer, or the end of the
 * run -- and a run that only called tools said nothing at all: on 2026-09-11 the owner's bubble wore
 * the badge for 1 h 31 while its run was well underway. A run opening on the thread is the one
 * signal that needs no prose, and it is the same fact the server relies on to ack the send.
 */

import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { chatStore, type TextItem } from '../chat';

const T = 'thread-queue';
const handlers = { activeThreadId: () => null } as unknown as ServerFrameHandlers;

function queued(threadId = T): TextItem[] {
  return chatStore.getItems(threadId).filter(
    (item): item is TextItem => item.kind === 'text' && item.queuedReason !== undefined,
  );
}

describe('the compaction badge', () => {
  beforeEach(() => {
    chatStore.clearThread(T);
    chatStore.handleSyncResult(T, [{
      id: 'm1',
      role: 'user',
      text: 'pendant la compaction',
      ts: '2026-09-11T21:29:21.000Z',
      attachments: [],
    }], 'm1', 'm1', false);
  });

  afterEach(() => chatStore.clearThread(T));

  it('is put on by chat.send.queued', () => {
    routeServerFrame({ type: 'chat.send.queued', threadId: T, replyToId: 'm1', reason: 'compaction' }, handlers);
    expect(queued()).toHaveLength(1);
    expect(queued()[0]!.queuedReason).toBe('compaction');
  });

  it('comes off the moment a run opens, without waiting for the agent to speak', () => {
    routeServerFrame({ type: 'chat.send.queued', threadId: T, replyToId: 'm1', reason: 'compaction' }, handlers);
    routeServerFrame({ type: 'chat.run.start', threadId: T }, handlers);
    expect(queued()).toEqual([]);
  });

  it('leaves an injection alone: that one is still parked in the mailbox of the run that just opened', () => {
    routeServerFrame({ type: 'chat.send.queued', threadId: T, replyToId: 'm1', reason: 'injection' }, handlers);
    routeServerFrame({ type: 'chat.run.start', threadId: T }, handlers);
    expect(queued()).toHaveLength(1);
    expect(queued()[0]!.queuedReason).toBe('injection');
  });

  it('comes off on the ack that follows the drain, whatever the reason', () => {
    routeServerFrame({ type: 'chat.send.queued', threadId: T, replyToId: 'm1', reason: 'injection' }, handlers);
    routeServerFrame({ type: 'chat.send.acked', threadId: T, replyToId: 'm1' }, handlers);
    expect(queued()).toEqual([]);
  });
});
