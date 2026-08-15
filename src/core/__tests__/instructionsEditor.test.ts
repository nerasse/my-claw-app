/**
 * The editor state a save is built from.
 *
 * The sha is the whole guard: it is what tells the server "I am editing the content I loaded".
 * An absent one means "create", which is right for an override of an inherited layer and wrong
 * for a nested AGENTS.md, where creation is refused. That distinction lives here.
 */

import { instructionsStore } from '../instructions';

afterEach(() => instructionsStore.reset());

describe('the editor keeps the sha of what can be overwritten', () => {
  test('an own file and a nested one keep it, an inherited copy does not', () => {
    const cases = [
      { origin: 'own' as const, keeps: true },
      { origin: 'off' as const, keeps: true },
      { origin: 'nested' as const, keeps: true },
      { origin: 'inherited' as const, keeps: false },
      { origin: 'fallback' as const, keeps: false },
    ];
    for (const { origin, keeps } of cases) {
      instructionsStore.openEditor('default', 'AGENTS.md');
      instructionsStore.receiveFile({
        type: 'instructions.file',
        workspace: 'default',
        file: 'AGENTS.md',
        content: 'body',
        origin,
        from: 'default',
        sha: 'abc123abc123',
        editable: true,
      });
      expect([origin, instructionsStore.getSnapshot().editor?.sha]).toEqual([origin, keeps ? 'abc123abc123' : undefined]);
    }
  });

  test('a saved nested file stays nested: it never became a workspace override', () => {
    instructionsStore.openEditor('default', '/home/me/dev/repo/AGENTS.md');
    instructionsStore.receiveFile({
      type: 'instructions.file',
      workspace: 'default',
      file: '/home/me/dev/repo/AGENTS.md',
      content: 'body',
      origin: 'nested',
      from: 'default',
      sha: 'abc123abc123',
      editable: true,
    });
    instructionsStore.edit('new body');
    instructionsStore.markSaving();
    instructionsStore.receiveSaved({
      type: 'instructions.saved',
      workspace: 'default',
      file: '/home/me/dev/repo/AGENTS.md',
      ok: true,
      sha: 'def456def456',
      conflict: false,
    });

    const editor = instructionsStore.getSnapshot().editor;
    expect(editor?.origin).toBe('nested');
    expect(editor?.sha).toBe('def456def456');
    expect(editor?.loaded).toBe('new body');
  });
});
