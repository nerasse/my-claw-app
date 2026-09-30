/**
 * The wait before a call produces anything, carried by the bubble the call opened.
 *
 * The engines that think before they write leave the screen empty through that wait -- a Codex
 * turn at effort max sends nothing for twenty seconds, a provider being retried for minutes -- and
 * the thread read as dead (2026-09-30). The line first lived at the foot of the thread, outside
 * every bubble, beside an empty bubble wearing a bare caret; it belongs to the bubble.
 */
import { chatStore, type TextItem } from '../chat';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import type { ServerFrame } from '../protocol';

const handlers = {
  activeThreadId: () => null,
  subagentParent: () => null,
} as unknown as ServerFrameHandlers;
const THREAD = 't1';
const SINCE = '2026-01-01T10:00:00.000Z';

function route(frame: ServerFrame): void {
  routeServerFrame(frame, handlers);
}

const open = (id = 's1'): ServerFrame => ({ type: 'chat.stream.start', id, threadId: THREAD });
const thinking = (id = 's1', since = SINCE): ServerFrame => ({ type: 'chat.turn.thinking', id, threadId: THREAD, since });

function bubble(id = 's1'): TextItem | undefined {
  const item = chatStore.getItems(THREAD).find(entry => entry.id === id);
  return item?.kind === 'text' ? item : undefined;
}

beforeEach(() => {
  chatStore.clearAll();
});

describe('the wait before a call produces anything', () => {
  test('the frame marks the bubble the call opened, dated by the server rather than by arrival', () => {
    route(open());
    route(thinking());
    expect(bubble()?.waitingSince).toBe(Date.parse(SINCE));
  });

  test('the first token takes it down: there is prose to read now', () => {
    route(open());
    route(thinking());
    route({ type: 'chat.stream.delta', id: 's1', threadId: THREAD, text: 'Bonjour' });
    expect(bubble()?.waitingSince).toBeUndefined();
    expect(bubble()?.text).toBe('Bonjour');
  });

  test('a thought takes it down too, and so does a token count', () => {
    route(open('a'));
    route(thinking('a'));
    route({ type: 'chat.reasoning.delta', id: 'a', threadId: THREAD, text: 'weighing' });
    expect(bubble('a')?.waitingSince).toBeUndefined();

    route(open('b'));
    route(thinking('b'));
    route({ type: 'chat.reasoning.tokens', id: 'b', threadId: THREAD, tokens: 120 });
    expect(bubble('b')?.waitingSince).toBeUndefined();
  });

  test('a call that goes straight to a tool leaves no empty bubble behind', () => {
    route(open());
    route(thinking());
    route({ type: 'chat.stream.done', id: 's1', threadId: THREAD });
    expect(bubble()).toBeUndefined();
  });

  test('a stop during the wait does not leave an empty bubble either', () => {
    route(open());
    route(thinking());
    route({ type: 'chat.stream.abort', id: 's1', threadId: THREAD });
    expect(bubble()).toBeUndefined();
  });

  test('an error during the wait still says so, on the bubble that was waiting', () => {
    route(open());
    route(thinking());
    route({ type: 'chat.stream.abort', id: 's1', threadId: THREAD, error: 'provider down' });
    expect(bubble()?.error).toBe('provider down');
    expect(bubble()?.waitingSince).toBeUndefined();
  });

  test('a frame for a bubble that is not open is dropped, never creating one', () => {
    route(thinking('ghost'));
    expect(bubble('ghost')).toBeUndefined();
  });

  test('a late frame does not mark a bubble the history already settled', () => {
    chatStore.seedHistory(THREAD, [{ role: 'assistant', ts: '2026-01-01T00:00:02.000Z', id: 'h-2', text: 'salut' }]);
    route(thinking('h-2'));
    expect(bubble('h-2')?.waitingSince).toBeUndefined();
  });

  test("another bubble's wait is not this one's", () => {
    route(open('a'));
    route(open('b'));
    route(thinking('a'));
    route({ type: 'chat.stream.delta', id: 'b', threadId: THREAD, text: 'elsewhere' });
    expect(bubble('a')?.waitingSince).toBe(Date.parse(SINCE));
  });

  test('the same call replayed twice does not redraw', () => {
    route(open());
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
