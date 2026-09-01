import { undoStore } from '../undoStore';
import type { UndoPromptFrame } from '../protocol';

const prompt = (id: string, threadId: string): UndoPromptFrame => ({
  type: 'undo.prompt',
  id,
  threadId,
  turnPreview: 'Question test',
  diff: [{ root: '/ws/repo', additions: 3, deletions: 1 }],
  ts: '2026-09-01T10:00:00.000Z',
});

describe('undoStore', () => {
  beforeEach(() => undoStore.clear());

  test('a prompt is filed under its thread and the same id is never doubled', () => {
    undoStore.prompt(prompt('u1', 't-a'));
    undoStore.prompt(prompt('u1', 't-a'));
    expect(undoStore.forThread('t-a')).toHaveLength(1);
    expect(undoStore.threads()).toEqual(['t-a']);
    expect(undoStore.forThread('t-b')).toEqual([]);
  });

  test('resolve drops the prompt and the thread entry', () => {
    undoStore.prompt(prompt('u1', 't-a'));
    undoStore.resolve('u1');
    expect(undoStore.all()).toEqual([]);
    expect(undoStore.threads()).toEqual([]);
  });

  test('choose records the mode locally, then resolve clears it', () => {
    undoStore.prompt(prompt('u1', 't-a'));
    undoStore.choose('u1', 'hard');
    expect(undoStore.choice('u1')).toBe('hard');
    undoStore.resolve('u1');
    expect(undoStore.choice('u1')).toBeUndefined();
  });

  test('a choice for an unknown id is a no-op', () => {
    undoStore.choose('nope', 'soft');
    expect(undoStore.choice('nope')).toBeUndefined();
  });
});
