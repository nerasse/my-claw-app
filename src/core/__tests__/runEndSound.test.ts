/**
 * A `chat.run.end` landing on the thread on screen rings once, exactly like a question landing
 * there. On any other thread the push is the ring (server-side skipDevice keeps the tray silent
 * for the foreground device on that thread), so this device only ever rings when it is the one
 * showing the run.
 */

const mockSend = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.mock('../connection', () => ({ connection: { send: (frame: string) => mockSend(frame) } }));

import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { chatStore } from '../chat';
import type { RunEndFrame } from '../protocol';

function makeHandlers(activeThreadId: string | null) {
  const state = { runEnds: 0 };
  const serverHandlers = {
    activeThreadId: () => activeThreadId,
    subagentParent: () => null,
    onRunEndOnActiveThread: () => {
      state.runEnds += 1;
    },
  } as unknown as ServerFrameHandlers;
  return { state, serverHandlers };
}

const runEnd = (threadId: string, reason: RunEndFrame['reason'] = 'done'): RunEndFrame => ({
  type: 'chat.run.end',
  threadId,
  reason,
});

beforeEach(() => {
  mockSend.mockClear();
  chatStore.clearAll();
});

it('a run ending on the thread on screen rings once', () => {
  const { state, serverHandlers } = makeHandlers('t1');
  routeServerFrame(runEnd('t1'), serverHandlers);
  expect(state.runEnds).toBe(1);
});

it('a run ending on another thread does not ring', () => {
  const { state, serverHandlers } = makeHandlers('t1');
  routeServerFrame(runEnd('t2'), serverHandlers);
  expect(state.runEnds).toBe(0);
});

it('an aborted or failed run on screen rings the same as a done one', () => {
  const { state, serverHandlers } = makeHandlers('t1');
  routeServerFrame(runEnd('t1', 'aborted'), serverHandlers);
  routeServerFrame(runEnd('t1', 'error'), serverHandlers);
  expect(state.runEnds).toBe(2);
});

it('no ring when no thread is on screen', () => {
  const { state, serverHandlers } = makeHandlers(null);
  routeServerFrame(runEnd('t1'), serverHandlers);
  expect(state.runEnds).toBe(0);
});
