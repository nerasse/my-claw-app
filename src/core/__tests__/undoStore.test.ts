import { undoStore } from '../undoStore';
import type { UndoListFrame, UndoPromptFrame } from '../protocol';

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

  test('the turn picker is its own list, and resolve closes whichever opened', () => {
    const list: UndoListFrame = {
      type: 'undo.list',
      id: 'l1',
      threadId: 't-a',
      turns: [
        { n: 1, preview: 'go release', ts: 2, attachments: 0, transcripts: 0, hard: true },
        { n: 2, preview: 'Fais le tout', ts: 1, attachments: 2, transcripts: 1, hard: false },
      ],
    };
    undoStore.list(list);
    undoStore.list(list); // a replay is not a second picker
    expect(undoStore.pickForThread('t-a')?.turns).toHaveLength(2);
    // A bare /undo open on the same thread is a different sheet and does not overwrite it.
    undoStore.prompt(prompt('u9', 't-a'));
    expect(undoStore.pickForThread('t-a')?.id).toBe('l1');
    undoStore.pick('l1', 2, 'soft');
    expect(undoStore.pickForThread('t-a')?.picked).toEqual({ n: 2, mode: 'soft' });
    undoStore.resolve('l1');
    expect(undoStore.pickForThread('t-a')).toBeUndefined();
    // The mode sheet was not touched by closing the picker.
    expect(undoStore.forThread('t-a')).toHaveLength(1);
  });
});
