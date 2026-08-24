/**
 * A card is pushed with its output clipped so a reconnect does not replay every byte every tool
 * ever printed. The round-trip that lifts the clip is guarded here: asked once, applied when the
 * session still holds the call, ignored when it does not.
 */

const mockSend = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.mock('../connection', () => ({ connection: { send: (frame: string) => mockSend(frame) } }));

import { requestToolOutput, resetToolOutputAsks } from '../toolOutput';
import { chatStore } from '../chat';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import type { ServerFrame } from '../protocol';

// The branch under test only feeds the chat store; the shell's own handlers are never reached.
const handlers = {} as ServerFrameHandlers;

function route(frame: ServerFrame): void {
  routeServerFrame(frame, handlers);
}

const THREAD = 't1';

beforeEach(() => {
  mockSend.mockClear();
  mockSend.mockImplementation(() => Promise.resolve());
  resetToolOutputAsks();
  chatStore.clearAll();
});

function seedClippedCard(): void {
  chatStore.addToolCall(THREAD, {
    id: 't-call-1',
    name: 'bash',
    args: { command: 'cat big.log' },
    ok: true,
    output: 'x'.repeat(4000),
    truncated: true,
  });
}

function card() {
  return chatStore.getItems(THREAD).find(item => item.id === 't-call-1' && item.kind === 'tool') as
    | { output: string; truncated: boolean }
    | undefined;
}

it('asks the server for the whole output, naming the card', () => {
  requestToolOutput(THREAD, 't-call-1');
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(JSON.parse(mockSend.mock.calls[0]![0])).toEqual({ type: 'chat.tool.full', threadId: THREAD, id: 't-call-1' });
});

it('asks once per card, however often the card re-renders', () => {
  for (let i = 0; i < 5; i++) requestToolOutput(THREAD, 't-call-1');
  expect(mockSend).toHaveBeenCalledTimes(1);
});

it('lets the next open try again when the ask never left the device', async () => {
  mockSend.mockImplementationOnce(() => Promise.reject(new Error('offline')));
  requestToolOutput(THREAD, 't-call-1');
  await Promise.resolve();
  requestToolOutput(THREAD, 't-call-1');
  expect(mockSend).toHaveBeenCalledTimes(2);
});

it('replaces the clipped text with the whole one, and stops offering the round-trip', () => {
  seedClippedCard();
  route({
    type: 'chat.tool.full.result',
    threadId: THREAD,
    id: 't-call-1',
    output: 'y'.repeat(30000),
    found: true,
  });
  expect(card()?.output).toHaveLength(30000);
  expect(card()?.truncated).toBe(false);
});

it('keeps what it has when the session no longer holds the call', () => {
  seedClippedCard();
  route({
    type: 'chat.tool.full.result',
    threadId: THREAD,
    id: 't-call-1',
    output: '',
    found: false,
  });
  // Blanking the block under the reader's eyes would be worse than a clipped one.
  expect(card()?.output).toHaveLength(4000);
  expect(card()?.truncated).toBe(true);
});
