import { chatStore, type TextItem } from '../chat';
import type { HistoryEntry } from '../protocol';

const THREAD = 't1';

beforeEach(() => {
  chatStore.clearAll();
});

function first(): TextItem {
  const [item] = chatStore.getItems(THREAD);
  if (!item || item.kind !== 'text') throw new Error('expected a text item');
  return item as TextItem;
}

describe('reasoning accumulates on its bubble', () => {
  test('deltas concatenate, like the text does', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'weighing ');
    chatStore.appendReasoning(THREAD, 's1', 'options');
    expect(first().reasoning).toBe('weighing options');
  });

  test('reasoning and text live side by side on the same bubble', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'thought');
    chatStore.appendDelta(THREAD, 's1', 'answer');
    chatStore.endStream(THREAD, 's1');
    expect(first()).toMatchObject({ text: 'answer', reasoning: 'thought', streaming: false });
  });

  test('a count sits beside the words of the same bubble', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'weighing');
    chatStore.appendDelta(THREAD, 's1', 'answer');
    chatStore.setReasoningTokens(THREAD, 's1', 640);
    chatStore.endStream(THREAD, 's1');
    expect(first()).toMatchObject({ reasoning: 'weighing', text: 'answer', reasoningTokens: 640 });
  });

  test('a frame for an unknown bubble is dropped, never creating one', () => {
    chatStore.appendReasoning(THREAD, 'ghost', 'x');
    chatStore.setReasoningTokens(THREAD, 'ghost', 10);
    expect(chatStore.getItems(THREAD)).toHaveLength(0);
  });

  test('a frame arriving after the bubble closed does not resurrect it', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'done');
    chatStore.endStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'late');
    expect(first().reasoning).toBeUndefined();
  });
});

describe('a bubble carrying only reasoning survives', () => {
  // It explains a tool call that produced no prose, which is exactly what the owner wants to read.
  test('reasoning text alone is kept on end', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'thought, then called a tool');
    chatStore.endStream(THREAD, 's1');
    expect(chatStore.getItems(THREAD)).toHaveLength(1);
    expect(first().reasoning).toBe('thought, then called a tool');
  });

  test('a count alone is kept too, for a thought the endpoint kept to itself', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.setReasoningTokens(THREAD, 's1', 512);
    chatStore.endStream(THREAD, 's1');
    expect(chatStore.getItems(THREAD)).toHaveLength(1);
    expect(first().reasoningTokens).toBe(512);
  });

  test('a bubble with neither text nor reasoning is still removed', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.endStream(THREAD, 's1');
    expect(chatStore.getItems(THREAD)).toHaveLength(0);
  });
});

test('a reopened conversation replays the reasoning it stored', () => {
  const entries: HistoryEntry[] = [
    { id: 'h-1', role: 'user', text: '9.11 ou 9.8 ?', ts: '2026-01-01T00:00:01.000Z' },
    {
      id: 'h-2',
      role: 'assistant',
      text: '9.11',
      ts: '2026-01-01T00:00:02.000Z',
      reasoning: 'comparing the decimal parts',
    },
  ];
  chatStore.seedHistory(THREAD, entries);
  const items = chatStore.getItems(THREAD);
  expect(items).toHaveLength(2);
  const reply = items[1];
  expect(reply?.kind === 'text' ? reply.reasoning : undefined).toBe('comparing the decimal parts');
});

/** A span the clock can measure, without waiting on one: the server's instant, in the past. */
function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

describe('the thinking is timed', () => {
  test('the span opens on the first thought and closes on the first word of the answer', () => {
    const before = Date.now();
    chatStore.startStream(THREAD, 's1');
    expect(first().reasoningStartedAt).toBeUndefined();

    chatStore.appendReasoning(THREAD, 's1', 'weighing', false, ago(40));
    const startedAt = first().reasoningStartedAt;
    expect(startedAt).toBeLessThanOrEqual(before);
    // Still climbing: nothing has sealed it, which is what makes the counter run.
    expect(first().reasoningMs).toBeUndefined();

    chatStore.appendDelta(THREAD, 's1', 'answer');
    expect(first().reasoningMs).toBeGreaterThanOrEqual(40);
  });

  test('the answer does not keep re-timing the thinking on every token', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'thought', false, ago(40));
    chatStore.appendDelta(THREAD, 's1', 'one');
    const sealed = first().reasoningMs;
    chatStore.appendDelta(THREAD, 's1', ' two');
    chatStore.appendDelta(THREAD, 's1', ' three');
    expect(first().reasoningMs).toBe(sealed);
  });

  test('a turn that thought and then said nothing still reports a duration', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'thought', false, ago(40));
    chatStore.endStream(THREAD, 's1');
    expect(first().reasoningMs).toBeGreaterThanOrEqual(40);
  });

  test('an interrupted turn keeps the thinking it had already done', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'thought', false, ago(40));
    chatStore.abortStream(THREAD, 's1', 'stopped');
    expect(first().reasoningMs).toBeGreaterThanOrEqual(40);
  });

  test('a turn that never thought carries no span at all', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'answer');
    chatStore.endStream(THREAD, 's1');
    expect(first().reasoningStartedAt).toBeUndefined();
    expect(first().reasoningMs).toBeUndefined();
  });

  test('the server says when the thinking began, and it wins over the local clock', () => {
    const before = Date.now();
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'weighing', false, ago(5_000));
    // The phase began five seconds before this frame landed, and the counter has to say so.
    expect(first().reasoningStartedAt).toBeLessThanOrEqual(before - 4_000);
  });

  test('a window that reloads mid-thought resumes the span instead of restarting it', () => {
    // The case the field exists for: nothing of the run is on the device, the server replays the
    // turn in flight, and the merged delta carries the instant the phase opened.
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'forty seconds of thinking', true, ago(40_000));
    chatStore.endStream(THREAD, 's1');
    expect(first().reasoningMs).toBeGreaterThanOrEqual(40_000);
  });

  test('a server that sends no instant leaves the local clock in charge', () => {
    const before = Date.now();
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'weighing');
    expect(first().reasoningStartedAt).toBeGreaterThanOrEqual(before);
  });

  test('an instant that does not parse is treated as absent, never written as it is', () => {
    const before = Date.now();
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'weighing', false, 'the day before yesterday');
    const startedAt = first().reasoningStartedAt;
    // NaN on the item would draw a counter of NaN for as long as the bubble lives.
    expect(Number.isFinite(startedAt)).toBe(true);
    expect(startedAt).toBeGreaterThanOrEqual(before);
  });

  test('the chunks inside a phase do not move the start of the span they belong to', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'weighing ', false, ago(5_000));
    const opened = first().reasoningStartedAt;
    chatStore.appendReasoning(THREAD, 's1', 'options');
    expect(first().reasoningStartedAt).toBe(opened);
  });

  test('a thought with no words is timed by the span the count carries', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.setReasoningTokens(THREAD, 's1', 512, 4_200);
    expect(first().reasoningStartedAt).toBeUndefined();
    chatStore.endStream(THREAD, 's1');
    expect(first()).toMatchObject({ reasoningTokens: 512, reasoningMs: 4_200 });
  });

  // The server's figure is the one the log stores and the one a reload draws, so the live view
  // adopts it: the app's own span is a wall clock across a socket, from the frame that opened the
  // phase to the first prose delta, and the two never agreed (owner, 2026-11-14: "le ms serveur
  // c'est lui l'important"). A phase that read `12 s` live and `4 s` after a refresh is this.
  test("a count carries the server's span, and it replaces the one measured here", () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'weighing', false, ago(5_000));
    chatStore.appendDelta(THREAD, 's1', 'answer');
    // Sealed locally by the first word, as it always was -- then corrected by the server.
    expect(first().reasoningMs).toBeGreaterThanOrEqual(5_000);
    chatStore.setReasoningTokens(THREAD, 's1', 512, 4_100);
    chatStore.endStream(THREAD, 's1');
    expect(first().reasoningMs).toBe(4_100);
  });

  test('a count for a thought still open takes the span the server measured', () => {
    // The call asked for a tool: no prose came, so nothing sealed the span here. The server timed
    // it where the deltas arrive, which is the figure a reopened thread shows.
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'thought, then a tool', false, ago(5_000));
    chatStore.setReasoningTokens(THREAD, 's1', 512, 4_800);
    chatStore.endStream(THREAD, 's1');
    expect(first().reasoningMs).toBe(4_800);
  });

  test('a count with no span leaves whatever this device measured alone', () => {
    // An older server sends no `ms`, and a frame without one is not a claim of zero.
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'thought, then a tool', false, ago(5_000));
    chatStore.setReasoningTokens(THREAD, 's1', 512);
    chatStore.endStream(THREAD, 's1');
    expect(first().reasoningMs).toBeGreaterThanOrEqual(5_000);
  });

  test('a span that does not measure as positive is not written at all', () => {
    // A device running ahead of the server dates the phase in its own future. Zero is what a phase
    // that never happened looks like, and the server refuses to store one for the same reason.
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'thought', false, new Date(Date.now() + 30_000).toISOString());
    chatStore.endStream(THREAD, 's1');
    expect(first().reasoningMs).toBeUndefined();
  });

  test('the next bubble times its own thinking, not the previous one', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendReasoning(THREAD, 's1', 'first');
    chatStore.endStream(THREAD, 's1');

    chatStore.startStream(THREAD, 's2');
    const [, second] = chatStore.getItems(THREAD);
    expect(second?.kind === 'text' && second.reasoningStartedAt).toBeFalsy();
  });
});
