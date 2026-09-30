/**
 * The line that says the wait before a call's first token is work.
 *
 * The engines that think before they write leave the screen empty through it -- a Codex turn at
 * effort max sends nothing for twenty seconds, a provider being retried for minutes -- and the
 * thread read as dead, the Stop button its only sign (2026-09-30). The server dates the call; the
 * first thing the turn produces takes the line down.
 */
import { chatStore } from '../chat';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import type { ServerFrame } from '../protocol';

const handlers = {
  activeThreadId: () => null,
  subagentParent: () => null,
} as unknown as ServerFrameHandlers;
const THREAD = 't1';

function route(frame: ServerFrame): void {
  routeServerFrame(frame, handlers);
}

const thinking = (since = '2026-01-01T10:00:00.000Z'): ServerFrame => ({
  type: 'chat.turn.thinking',
  id: 's1',
  threadId: THREAD,
  since,
});

beforeEach(() => {
  chatStore.clearAll();
});

describe('the wait before a call produces anything', () => {
  test('the frame starts the line, dated by the server rather than by arrival', () => {
    route(thinking());
    expect(chatStore.getThinking(THREAD)).toBe(Date.parse('2026-01-01T10:00:00.000Z'));
  });

  test('the first token takes it down: there is prose to read now', () => {
    route(thinking());
    route({ type: 'chat.stream.delta', id: 's1', threadId: THREAD, text: 'Bonjour' });
    expect(chatStore.getThinking(THREAD)).toBeUndefined();
  });

  test('a thought takes it down too, and so does a token count', () => {
    route(thinking());
    route({ type: 'chat.reasoning.delta', id: 's1', threadId: THREAD, text: 'weighing' });
    expect(chatStore.getThinking(THREAD)).toBeUndefined();

    route(thinking());
    route({ type: 'chat.reasoning.tokens', id: 's1', threadId: THREAD, tokens: 120 });
    expect(chatStore.getThinking(THREAD)).toBeUndefined();
  });

  test('a tool card takes it down: the card says what is happening', () => {
    route(thinking());
    route({ type: 'chat.tool.start', id: 'c1', threadId: THREAD, turnId: 's1', name: 'bash', args: {}, ts: '2026-01-01T10:00:01.000Z' });
    expect(chatStore.getThinking(THREAD)).toBeUndefined();
  });

  test('the run ending takes it down, and so does an abort', () => {
    route(thinking());
    route({ type: 'chat.run.end', threadId: THREAD, reason: 'done' });
    expect(chatStore.getThinking(THREAD)).toBeUndefined();

    route(thinking());
    route({ type: 'chat.stream.abort', id: 's1', threadId: THREAD, error: 'stopped' });
    expect(chatStore.getThinking(THREAD)).toBeUndefined();
  });

  test("another thread's line is not this one's", () => {
    route(thinking());
    route({ type: 'chat.stream.delta', id: 's2', threadId: 't2', text: 'elsewhere' });
    expect(chatStore.getThinking(THREAD)).toBe(Date.parse('2026-01-01T10:00:00.000Z'));
  });

  test('the same call replayed twice does not redraw the line', () => {
    route(thinking());
    let renders = 0;
    const unsubscribe = chatStore.subscribe(() => {
      renders += 1;
    });
    route(thinking());
    unsubscribe();
    expect(renders).toBe(0);
  });
});
