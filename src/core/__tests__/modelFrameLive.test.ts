import { modelStore } from '../model';

/**
 * What the header reads off a `model.result`: the tag that picked the model, and the rung the run
 * in flight is asking for.
 *
 * Measured 2026-11-14: a conversation on `tag:Quota` (Opus, `xhigh` on every candidate) showed
 * `claude-2 / Opus 5.5` with no effort at all, while the status page beside it named the right
 * model. Three separate holes, one screen:
 *
 * - `model` is what the API receives, so the tag that chose it is lost before the header sees it;
 * - a route's candidates each carry their own level, so the conversation's effort cannot answer
 *   for what is running;
 * - the store dropped every field it did not already know, so adding them server-side would have
 * been a no-op on the wire.
 */

function frame(over: Record<string, unknown> = {}): Parameters<typeof modelStore.replaceThread>[0] {
  return {
    type: 'model.result',
    threadId: 't-live',
    model: 'claude-2/claude-opus-5-5',
    defaultModel: 'tag:Cheap',
    effort: { level: 'xhigh', levels: ['low', 'high', 'xhigh', 'max'], supported: true },
    ...over,
  } as Parameters<typeof modelStore.replaceThread>[0];
}

afterEach(() => modelStore.reset());

test('the frame keeps the tag that picked the model', () => {
  modelStore.replaceThread(frame({ tag: 'Quota' }));
  expect(modelStore.threadModel('t-live')?.tag).toBe('Quota');
});

test("the frame keeps the rung the running model is asked for", () => {
  modelStore.replaceThread(frame({ live: 'anthropic/claude-opus-5-5', liveEffort: 'max' }));
  const thread = modelStore.threadModel('t-live');
  expect(thread?.live).toBe('anthropic/claude-opus-5-5');
  expect(thread?.liveEffort).toBe('max');
  // The conversation's own effort is a different fact and must not be overwritten by it.
  expect(thread?.effort.level).toBe('xhigh');
});

test('a server that predates the fields leaves them absent rather than empty', () => {
  modelStore.replaceThread(frame());
  const thread = modelStore.threadModel('t-live');
  expect(thread?.tag).toBeUndefined();
  expect(thread?.liveEffort).toBeUndefined();
});
