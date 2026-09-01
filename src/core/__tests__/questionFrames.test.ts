/**
 * The questions sheet queue, driven by the two frames the server sends: `question.ask` opens
 * one entry (deduped by id, so a reconnect replay does not double it), `question.resolved`
 * closes it. The one-shot sound fires only when the question lands on the thread on screen.
 */

import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import type { QuestionAskFrame } from '../protocol';

function makeHandlers(activeThreadId?: string) {
  const handlers: {
    questions: QuestionAskFrame[];
    sounds: number;
  } = { questions: [], sounds: 0 };
  const serverHandlers = {
    activeThreadId: () => activeThreadId ?? null,
    setQuestions: (update: (current: QuestionAskFrame[]) => QuestionAskFrame[]) => {
      handlers.questions = update(handlers.questions);
    },
    onQuestionAskOnActiveThread: () => {
      handlers.sounds += 1;
    },
  } as unknown as ServerFrameHandlers;
  return { handlers, serverHandlers };
}

const ask = (id: string, threadId = 't1'): QuestionAskFrame => ({
  type: 'question.ask',
  id,
  threadId,
  questions: [{ header: 'h', question: 'q', options: [{ label: 'a' }] }],
  ts: 'iso',
});

describe('frameRouter question frames', () => {
  it('queues an ask and closes it on resolved', () => {
    const { handlers, serverHandlers } = makeHandlers();
    routeServerFrame(ask('q1'), serverHandlers);
    expect(handlers.questions.map(q => q.id)).toEqual(['q1']);
    routeServerFrame({ type: 'question.resolved', id: 'q1', threadId: 't1', reason: 'answered' }, serverHandlers);
    expect(handlers.questions).toEqual([]);
  });

  it('does not double a replay of the same ask', () => {
    const { handlers, serverHandlers } = makeHandlers();
    routeServerFrame(ask('q1'), serverHandlers);
    routeServerFrame(ask('q1'), serverHandlers);
    expect(handlers.questions).toHaveLength(1);
  });

  it('rings only when the ask targets the active thread', () => {
    const { handlers, serverHandlers } = makeHandlers('t1');
    routeServerFrame(ask('q1', 't1'), serverHandlers);
    expect(handlers.sounds).toBe(1);
    routeServerFrame(ask('q2', 't2'), serverHandlers);
    expect(handlers.sounds).toBe(1);
  });

  it('does not ring on a replay when the thread is not on screen', () => {
    const { handlers, serverHandlers } = makeHandlers(undefined);
    routeServerFrame(ask('q1', 't1'), serverHandlers);
    expect(handlers.sounds).toBe(0);
  });

  it('a resolved frame for an unknown id is a no-op', () => {
    const { handlers, serverHandlers } = makeHandlers();
    routeServerFrame({ type: 'question.resolved', id: 'ghost', threadId: 't1', reason: 'canceled' }, serverHandlers);
    expect(handlers.questions).toEqual([]);
  });
});
