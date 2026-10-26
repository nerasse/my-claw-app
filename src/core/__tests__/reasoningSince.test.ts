/**
 * The thinking counter against both halves of a mismatched pair.
 *
 * `since` is additive on two frames the app already knew, so nothing may hinge on it being there:
 * a server that predates it sends none and the span is timed locally, and a server that sends it
 * must not lose the frame on the way in. `parseServerFrame` validates the frame `type` and nothing
 * else, which is what carries an unknown field past an older app -- and the only way to prove it is
 * to route the raw string, since handing `routeServerFrame` a typed object skips the parser that
 * drops frames silently.
 */

import { parseServerFrame } from '../protocol';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import { chatStore, type TextItem } from '../chat';

const THREAD = 'thread-since';
const handlers = { activeThreadId: () => null } as unknown as ServerFrameHandlers;

function route(frame: Record<string, unknown>): void {
  const parsed = parseServerFrame(JSON.stringify(frame));
  // A null here is the silent drop: the frame never reaches the store and no assertion below
  // would say why.
  expect(parsed).not.toBeNull();
  routeServerFrame(parsed!, handlers);
}

function bubble(): TextItem {
  const item = chatStore.getItems(THREAD).find(entry => entry.id === 'b1');
  if (!item || item.kind !== 'text') throw new Error('expected a text bubble');
  return item;
}

// clearAll, not clearThread: the open bubble outlives its items, so a second test reusing the id
// would find the stream still open and never draw one.
beforeEach(() => chatStore.clearAll());
afterEach(() => chatStore.clearAll());

describe('a new app against an older server', () => {
  it('times the thinking on its own clock when the frame carries no instant', () => {
    const before = Date.now();
    route({ type: 'chat.stream.start', id: 'b1', threadId: THREAD });
    route({ type: 'chat.reasoning.delta', id: 'b1', threadId: THREAD, text: 'weighing' });

    expect(bubble().reasoningStartedAt).toBeGreaterThanOrEqual(before);
    expect(bubble().reasoning).toBe('weighing');
  });

  it('opens no counter on a count: it is a figure about a thought that is over', () => {
    route({ type: 'chat.stream.start', id: 'b1', threadId: THREAD });
    route({ type: 'chat.reasoning.tokens', id: 'b1', threadId: THREAD, tokens: 512, ms: 4_200 });

    expect(bubble().reasoningTokens).toBe(512);
    expect(bubble().reasoningStartedAt).toBeUndefined();
    expect(bubble().reasoningMs).toBe(4_200);
  });
});

describe('a new app against a server that dates the span', () => {
  it('takes the instant off the wire, on the delta and on the replay of it', () => {
    const opened = new Date(Date.now() - 40_000).toISOString();
    route({ type: 'chat.stream.start', id: 'b1', threadId: THREAD });
    route({ type: 'chat.reasoning.delta', id: 'b1', threadId: THREAD, text: 'forty seconds', replay: true, since: opened });

    expect(bubble().reasoningStartedAt).toBe(Date.parse(opened));
    route({ type: 'chat.stream.done', id: 'b1', threadId: THREAD });
    expect(bubble().reasoningMs).toBeGreaterThanOrEqual(40_000);
  });

});

describe('an older app against a new server', () => {
  it('keeps a frame whose fields it does not know, because only the type is validated', () => {
    // The app an owner has not updated is this parser without the `since` branch: the field rides
    // along unread, and the frame it is on still lands. A whitelist on the fields instead of the
    // type is what would drop it -- silently, and only on the devices that are behind.
    const parsed = parseServerFrame(
      JSON.stringify({
        type: 'chat.reasoning.delta',
        id: 'b1',
        threadId: THREAD,
        text: 'weighing',
        since: '2026-09-12T00:00:00.000Z',
        aFieldFromTheFuture: { nested: true },
      }),
    );
    expect(parsed).toMatchObject({ type: 'chat.reasoning.delta', text: 'weighing' });

    const before = Date.now();
    route({ type: 'chat.stream.start', id: 'b1', threadId: THREAD });
    routeServerFrame(parsed!, handlers);
    // Read by a store that ignores the unknown field: the bubble is drawn and timed regardless.
    expect(bubble().reasoning).toBe('weighing');
    expect(bubble().reasoningStartedAt).toBeLessThanOrEqual(before);
  });
});
