/**
 * A `chat.command.result` carrying `reset: "branch-switch"` and `compose` (undo, retry, branches)
 * must make the app forget the stale thread and prefill the composer with the user message.
 */

const mockSend = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.mock('../connection', () => ({ connection: { send: (frame: string) => mockSend(frame) } }));

import { chatStore } from '../chat';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { clearAllDrafts, draftTextOf } from '../drafts';
import type { ServerFrame } from '../protocol';

const handlers = {
  activeThreadId: () => null,
} as unknown as ServerFrameHandlers;
const THREAD = 't1';

function route(frame: ServerFrame): void {
  routeServerFrame(frame, handlers);
}

beforeEach(() => {
  mockSend.mockClear();
  chatStore.clearAll();
  clearAllDrafts();
});

it('a branch-switch command result refetches the thread history', () => {
  route({
    type: 'chat.command.result',
    threadId: THREAD,
    replyToId: 'send-1',
    text: 'Undo: conversation rembobinée',
    reset: 'branch-switch',
  });
  // The refresh is the same ask a fresh open uses.
  const sends = mockSend.mock.calls.map(call => JSON.parse(call[0]));
  expect(sends).toContainEqual({ type: 'session.history', threadId: THREAD, limit: 50 });
});

it('a compose fills the composer draft for the thread', () => {
  route({
    type: 'chat.command.result',
    threadId: THREAD,
    replyToId: 'send-1',
    text: 'Undo: conversation rembobinée',
    compose: 'Question à retenter',
  });
  expect(draftTextOf(THREAD)).toBe('Question à retenter');
});

it('a plain command result does not refetch nor prefill', () => {
  route({
    type: 'chat.command.result',
    threadId: THREAD,
    replyToId: 'send-1',
    text: 'Status report',
  });
  expect(mockSend).not.toHaveBeenCalled();
  expect(draftTextOf(THREAD)).toBe('');
});
