/**
 * The three frames a question travels on: `question.ask` files one in the store (deduped by id,
 * so the live turn journal replaying it does not double the card), `question.pending` replaces the
 * whole set at connect, `question.resolved` closes one. The one-shot sound fires only when the
 * question lands on the thread on screen.
 */

import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { questionStore } from '../questionStore';
import type { QuestionAskFrame } from '../protocol';

function makeHandlers(activeThreadId?: string) {
  const state = { sounds: 0 };
  const serverHandlers = {
    activeThreadId: () => activeThreadId ?? null,
    onQuestionAskOnActiveThread: () => {
      state.sounds += 1;
    },
  } as unknown as ServerFrameHandlers;
  return { state, serverHandlers };
}

const ask = (id: string, threadId = 't1'): QuestionAskFrame => ({
  type: 'question.ask',
  id,
  threadId,
  questions: [{ header: 'h', question: 'q', options: [{ label: 'a' }] }],
  replyToId: `t-call-${id}`,
  ts: 'iso',
});

describe('frameRouter question frames', () => {
  beforeEach(() => questionStore.clear());

  it('files an ask and closes it on resolved', () => {
    const { serverHandlers } = makeHandlers();
    routeServerFrame(ask('q1'), serverHandlers);
    expect(questionStore.forThread('t1').map(q => q.id)).toEqual(['q1']);
    routeServerFrame({ type: 'question.resolved', id: 'q1', threadId: 't1', reason: 'answered' }, serverHandlers);
    expect(questionStore.all()).toEqual([]);
  });

  it('does not double a replay of the same ask', () => {
    const { serverHandlers } = makeHandlers();
    routeServerFrame(ask('q1'), serverHandlers);
    routeServerFrame(ask('q1'), serverHandlers);
    expect(questionStore.all()).toHaveLength(1);
  });

  it('the pending list at connect is what the client ends up holding', () => {
    const { serverHandlers } = makeHandlers();
    routeServerFrame(ask('stale', 't9'), serverHandlers);
    routeServerFrame(
      {
        type: 'question.pending',
        entries: [{ id: 'q7', threadId: 't2', replyToId: 't-call-7', questions: ask('q7').questions, ts: 'iso' }],
      },
      serverHandlers,
    );
    expect(questionStore.all().map(q => q.id)).toEqual(['q7']);
    expect(questionStore.forThread('t2')[0]!.replyToId).toBe('t-call-7');
  });

  it('rings only when the ask targets the active thread', () => {
    const { state, serverHandlers } = makeHandlers('t1');
    routeServerFrame(ask('q1', 't1'), serverHandlers);
    expect(state.sounds).toBe(1);
    routeServerFrame(ask('q2', 't2'), serverHandlers);
    expect(state.sounds).toBe(1);
  });

  it('does not ring on a replay when the thread is not on screen', () => {
    const { state, serverHandlers } = makeHandlers(undefined);
    routeServerFrame(ask('q1', 't1'), serverHandlers);
    expect(state.sounds).toBe(0);
  });

  it('a pending list never rings: it is a resync, not a new question', () => {
    const { state, serverHandlers } = makeHandlers('t1');
    routeServerFrame(
      { type: 'question.pending', entries: [{ id: 'q1', threadId: 't1', questions: ask('q1').questions, ts: 'iso' }] },
      serverHandlers,
    );
    expect(state.sounds).toBe(0);
    expect(questionStore.forThread('t1')).toHaveLength(1);
  });

  it('a resolved frame for an unknown id is a no-op', () => {
    const { serverHandlers } = makeHandlers();
    routeServerFrame({ type: 'question.resolved', id: 'ghost', threadId: 't1', reason: 'canceled' }, serverHandlers);
    expect(questionStore.all()).toEqual([]);
  });
});
