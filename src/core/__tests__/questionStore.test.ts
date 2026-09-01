import { questionStore } from '../questionStore';
import { draftSelect } from '../questionState';
import type { QuestionAskFrame } from '../protocol';

const ask = (id: string, threadId: string, replyToId?: string): QuestionAskFrame => ({
  type: 'question.ask',
  id,
  threadId,
  questions: [{ header: 'h', question: 'q', options: [{ label: 'a' }, { label: 'b' }] }],
  ...(replyToId ? { replyToId } : {}),
  ts: '2026-09-01T10:00:00.000Z',
});

describe('questionStore', () => {
  beforeEach(() => questionStore.clear());

  test('an ask is filed under its thread and the same id is never doubled', () => {
    questionStore.ask(ask('q1', 't-a', 't-call-1'));
    questionStore.ask(ask('q1', 't-a', 't-call-1'));
    expect(questionStore.forThread('t-a')).toHaveLength(1);
    expect(questionStore.threads()).toEqual(['t-a']);
    expect(questionStore.forThread('t-b')).toEqual([]);
  });

  test('the pending list from the server replaces what the client believes', () => {
    questionStore.ask(ask('ghost', 't-a'));
    questionStore.reset([
      { id: 'q2', threadId: 't-b', questions: ask('q2', 't-b').questions, ts: 'now' },
    ]);
    expect(questionStore.forThread('t-a')).toEqual([]);
    expect(questionStore.all().map(entry => entry.id)).toEqual(['q2']);
    // Rebuilt as a real ask frame, so every reader has one shape to handle.
    expect(questionStore.all()[0]!.type).toBe('question.ask');
  });

  test('an empty pending list clears a card left over by a dead run', () => {
    questionStore.ask(ask('q1', 't-a'));
    questionStore.reset([]);
    expect(questionStore.all()).toEqual([]);
    expect(questionStore.threads()).toEqual([]);
  });

  test('a draft survives a reconnect, and dies with the question', () => {
    const frame = ask('q1', 't-a', 't-call-1');
    questionStore.ask(frame);
    questionStore.patch('q1', draft => draftSelect(draft, frame.questions[0], 0, 'a'));
    expect(questionStore.draft('q1').answers[0]).toEqual(['a']);

    // Same question still pending after the socket came back: what was picked is still there.
    questionStore.reset([{ id: 'q1', threadId: 't-a', replyToId: 't-call-1', questions: frame.questions, ts: 'now' }]);
    expect(questionStore.draft('q1').answers[0]).toEqual(['a']);

    questionStore.resolve('q1');
    expect(questionStore.draft('q1').answers).toEqual([]);
  });

  test('a draft cannot be written for an ask that is not pending', () => {
    questionStore.patch('nope', draft => ({ ...draft, submitting: true }));
    expect(questionStore.draft('nope').submitting).toBe(false);
  });

  test('subscribers are notified on change and left alone by a no-op patch', () => {
    let calls = 0;
    const off = questionStore.subscribe(() => {
      calls += 1;
    });
    questionStore.ask(ask('q1', 't-a'));
    expect(calls).toBe(1);
    questionStore.ask(ask('q1', 't-a'));
    expect(calls).toBe(1);
    questionStore.patch('q1', draft => draft);
    expect(calls).toBe(1);
    questionStore.resolve('q1');
    expect(calls).toBe(2);
    off();
    questionStore.ask(ask('q2', 't-a'));
    expect(calls).toBe(2);
  });
});
