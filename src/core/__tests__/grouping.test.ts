import { isGrouped } from '../grouping';
import type { ChatItem, TextItem } from '../chat';

function text(over: Partial<TextItem>): TextItem {
  return {
    kind: 'text',
    id: over.id ?? 'x',
    role: over.role ?? 'agent',
    text: over.text ?? 'hello',
    attachments: [],
    streaming: false,
    ts: over.ts ?? 1_000,
    ...over,
  };
}

function tool(ts: number): ChatItem {
  return { kind: 'tool', id: 't', name: 'bash', args: {}, ok: true, output: '', truncated: false, ts };
}

describe('bubbles of one author are read as one block', () => {
  test('two answers seconds apart are grouped', () => {
    const items = [text({ id: 'a', ts: 1_000 }), text({ id: 'b', ts: 1_400 })];
    expect(isGrouped(items, 1)).toBe(true);
  });

  test('the question above an answer never is', () => {
    const items = [text({ id: 'a', role: 'user', ts: 1_000 }), text({ id: 'b', ts: 1_400 })];
    expect(isGrouped(items, 1)).toBe(false);
  });

  test('a tool card between them breaks the block', () => {
    const items = [text({ id: 'a', ts: 1_000 }), tool(1_100), text({ id: 'b', ts: 1_400 })];
    expect(isGrouped(items, 2)).toBe(false);
  });

  test('two answers two minutes apart are two moments', () => {
    const items = [text({ id: 'a', ts: 1_000 }), text({ id: 'b', ts: 1_000 + 120_001 })];
    expect(isGrouped(items, 1)).toBe(false);
  });
});

describe('a new thinking phase opens its own block', () => {
  // Reported from the app: the thinking rendered as a note under the answer already on screen, and
  // the words after it as that same message continuing. The server had sealed the bubble; 4px of
  // grouped spacing put the two back together.
  test('reasoning after an answer is not glued to it', () => {
    const items = [text({ id: 'a', ts: 1_000 }), text({ id: 'b', ts: 1_400, reasoning: 'weighing options' })];
    expect(isGrouped(items, 1)).toBe(false);
  });

  test('a token estimate from a redacted engine counts as a thinking phase too', () => {
    const items = [text({ id: 'a', ts: 1_000 }), text({ id: 'b', ts: 1_400, reasoningTokens: 512 })];
    expect(isGrouped(items, 1)).toBe(false);
  });

  test('a reasoning the page left on the server is a thinking phase too', () => {
    const items = [text({ id: 'a', ts: 1_000 }), text({ id: 'b', ts: 1_400, reasoningChars: 4800 })];
    expect(isGrouped(items, 1)).toBe(false);
  });

  test('whitespace is not a thought, so the block holds', () => {
    const items = [text({ id: 'a', ts: 1_000 }), text({ id: 'b', ts: 1_400, reasoning: '  \n ' })];
    expect(isGrouped(items, 1)).toBe(true);
  });

  test('the answer that follows the thinking still groups under it', () => {
    const items = [
      text({ id: 'a', ts: 1_000 }),
      text({ id: 'b', ts: 1_400, reasoning: 'weighing options' }),
      text({ id: 'c', ts: 1_800 }),
    ];
    expect(isGrouped(items, 2)).toBe(true);
  });

  test('a thought on the reader side is not a case, so nothing changes there', () => {
    const items = [text({ id: 'a', role: 'user', ts: 1_000 }), text({ id: 'b', role: 'user', ts: 1_400, reasoning: 'x' })];
    expect(isGrouped(items, 1)).toBe(true);
  });
});

// A compaction boundary is a rule across the thread. Grouped, it would be tucked inside a run of
// messages at 4px, reading as one of them rather than as the line between two halves of a session.
describe('a compaction boundary stands alone', () => {
  test('the boundary does not group under the turn above it', () => {
    const items = [text({ id: 'a', role: 'user', ts: 1_000 }), text({ id: 'b', role: 'user', ts: 1_400, summaryOf: 8 })];
    expect(isGrouped(items, 1)).toBe(false);
  });

  test('the turn below it does not group under the boundary', () => {
    const items = [text({ id: 'a', role: 'user', ts: 1_000, summaryOf: 8 }), text({ id: 'b', role: 'user', ts: 1_400 })];
    expect(isGrouped(items, 1)).toBe(false);
  });
});
