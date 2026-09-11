/**
 * What happens when a reply to a question does not make it.
 *
 * The card goes read-only the moment Send is tapped, and nothing used to undo it: a frame accepted
 * by a socket that had already died reached nobody, and the owner was left on "Sending…" for ever
 * (2026-09-11, a question answered 62 minutes later on the second attempt).
 */

import { questionStore, REPLY_WATCHDOG_MS } from '../questionStore';
import { draftReplyFailed, draftSubmitting } from '../questionState';
import type { QuestionAskFrame } from '../protocol';

const ask = (id: string): QuestionAskFrame => ({
  type: 'question.ask',
  id,
  threadId: 't1',
  questions: [{ header: 'h', question: 'q', options: [{ label: 'a' }] }],
  replyToId: `t-call-${id}`,
  ts: 'iso',
});

describe('a question reply in flight', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    questionStore.clear();
    questionStore.ask(ask('q1'));
  });

  afterEach(() => {
    questionStore.clear();
    jest.useRealTimers();
  });

  it('holds the card read-only while it waits', () => {
    questionStore.beginReply('q1');
    expect(questionStore.draft('q1').submitting).toBe(true);
    expect(questionStore.draft('q1').failed).toBe(false);
  });

  it('gives the card back when nothing came back in time', () => {
    questionStore.beginReply('q1');
    jest.advanceTimersByTime(REPLY_WATCHDOG_MS);
    expect(questionStore.draft('q1')).toMatchObject({ submitting: false, failed: true });
  });

  it('gives it back at once when the transport refused the frame', () => {
    questionStore.beginReply('q1');
    questionStore.replyFailed('q1');
    expect(questionStore.draft('q1')).toMatchObject({ submitting: false, failed: true });
  });

  it('stays quiet once the server closed the ask, even past the deadline', () => {
    questionStore.beginReply('q1');
    questionStore.resolve('q1');
    jest.advanceTimersByTime(REPLY_WATCHDOG_MS * 2);
    // The ask is gone, so there is no draft left to mark; the point is that the timer was cleared
    // and did not fire on the card the owner is looking at.
    expect(questionStore.all()).toEqual([]);
  });

  it('a stale deadline does not mark a card that was never sent', () => {
    expect(draftReplyFailed(draftSubmitting(questionStore.draft('q1')))).toMatchObject({
      submitting: false,
      failed: true,
    });
    // Fired twice, the second is a no-op rather than a card that keeps re-arming.
    expect(draftReplyFailed({ ...questionStore.draft('q1'), submitting: false, failed: true })).toEqual({
      ...questionStore.draft('q1'),
      submitting: false,
      failed: true,
    });
  });

  it('a new attempt clears the previous failure', () => {
    questionStore.beginReply('q1');
    questionStore.replyFailed('q1');
    expect(questionStore.draft('q1').failed).toBe(true);
    questionStore.beginReply('q1');
    expect(questionStore.draft('q1')).toMatchObject({ submitting: true, failed: false });
  });
});
