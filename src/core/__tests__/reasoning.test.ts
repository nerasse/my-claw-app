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

  test('a token estimate replaces rather than accumulating, since it is a running total', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.setReasoningTokens(THREAD, 's1', 128);
    chatStore.setReasoningTokens(THREAD, 's1', 640);
    expect(first().reasoningTokens).toBe(640);
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

  test('a token count alone is kept too, for a redacted engine', () => {
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
