/**
 * The frame a background job's notice arrives on -- docs/jobs.md, server side.
 *
 * Same row as a sub-agent's return, on purpose: the reader asks the same question ("what reported,
 * and what became of it"). What changes is the mark and the word, because a command does not
 * "return" and a job has no chat to open.
 */

import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { chatStore } from '../chat';
import { sessionStore } from '../sessions';
import { isSubAgentReturn, jobWord, returnWord } from '../subagentReturn';
import type { ChatSubAgentReturnFrame } from '../protocol';

const THREAD = 'my-claw-app/thread/owner/main';

const handlers = {
  activeThreadId: () => THREAD,
} as unknown as ServerFrameHandlers;

const notice = (over: Partial<ChatSubAgentReturnFrame> = {}): ChatSubAgentReturnFrame => ({
  type: 'chat.subagent.return',
  threadId: THREAD,
  id: 'job-notice-1',
  text: 'cargo test: 786 passed',
  ts: '2026-11-25T22:40:00.000Z',
  subagentId: 'job-0a1b2c3d',
  label: 'cargo test --workspace',
  status: 'complete',
  kind: 'job',
  ...over,
});

beforeEach(() => {
  chatStore.clearAll();
  sessionStore.replace([]);
});

describe('frameRouter job notice', () => {
  it('draws the same card as a return, marked as a job', () => {
    routeServerFrame(notice(), handlers);
    const item = chatStore.getItems(THREAD).find(entry => entry.id === 'job-notice-1')!;
    expect(item.kind).toBe('text');
    expect(isSubAgentReturn(item)).toBe(true);
    if (item.kind !== 'text') throw new Error('a notice is a text item');
    expect(item.from).toEqual({
      agentId: 'job-0a1b2c3d',
      label: 'cargo test --workspace',
      kind: 'job',
      status: 'complete',
    });
  });

  it('keeps a sub-agent return when the frame names no kind', () => {
    routeServerFrame(notice({ kind: undefined, subagentId: 'subagent/run-1' }), handlers);
    const item = chatStore.getItems(THREAD).find(entry => entry.id === 'job-notice-1')!;
    if (item.kind !== 'text') throw new Error('a notice is a text item');
    expect(item.from?.kind).toBe('return');
  });

  it('words a job by what the shell did, never "returned"', () => {
    expect(jobWord('complete')).toBe('done');
    expect(jobWord('error')).toBe('failed');
    expect(jobWord('stopped')).toBe('stopped');
    expect(returnWord('complete')).toBe('returned');
  });
});
