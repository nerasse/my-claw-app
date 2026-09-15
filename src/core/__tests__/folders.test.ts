import { drawerSections } from '../folders';
import type { FolderSummary, SessionSummary } from '../protocol';

function session(threadId: string, over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    threadId,
    title: threadId,
    messageCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastActiveAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function folder(id: string, name: string, rank: number, over: Partial<FolderSummary> = {}): FolderSummary {
  return { id, name, rank, ...over };
}

describe('drawerSections', () => {
  test('sections come in rank order, and what nobody filed comes last', () => {
    const sections = drawerSections(
      [
        session('c', { folderId: 'f2' }),
        session('a', { folderId: 'f1' }),
        session('b'),
      ],
      [folder('f2', 'Carrière', 1), folder('f1', 'CubeFlow', 0)],
      null,
    );

    expect(sections.map(section => section.label)).toEqual(['CubeFlow', 'Carrière', 'No folder']);
    expect(sections[0]?.rows.map(row => row.threadId)).toEqual(['a']);
    expect(sections[2]?.rows.map(row => row.threadId)).toEqual(['b']);
  });

  test('a conversation filed into a folder the listing does not carry is not dropped', () => {
    const sections = drawerSections(
      [session('a', { folderId: 'inconnu' }), session('b')],
      [folder('f1', 'CubeFlow', 0)],
      null,
    );

    // The folder it names is not there to draw a section for: the row still has to be somewhere,
    // and the only honest place is the one that means "not filed anywhere we know of".
    expect(sections.map(section => section.label)).toEqual(['CubeFlow', 'No folder']);
    expect(sections[1]?.rows.map(row => row.threadId)).toEqual(['a', 'b']);
  });

  test('an empty folder is drawn until something is filtered', () => {
    const sessions = [session('a', { folderId: 'f1' })];
    const folders = [folder('f1', 'CubeFlow', 0), folder('f2', 'Perso', 1)];

    expect(drawerSections(sessions, folders, null).map(section => section.label)).toEqual([
      'CubeFlow',
      'Perso',
      'No folder',
    ]);
    // Under a filter the rows arrive narrowed by the caller: Perso has nothing left, and a folder
    // with nothing under it is not a section with nothing under it.
    expect(drawerSections(sessions, folders, 'cf').map(section => section.label)).toEqual(['CubeFlow', 'No folder']);
  });

  test('a folder born in the filtered workspace stays, even when it is empty', () => {
    const sections = drawerSections([], [folder('f1', 'CubeFlow', 0, { workspace: 'cf' })], 'cf');

    // It was created from inside that workspace, so it is where the owner expects to find it.
    expect(sections.map(section => section.label)).toEqual(['CubeFlow', 'No folder']);
  });

  test('the unfiled section is always drawn, count included', () => {
    const sections = drawerSections([], [], null);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.folder).toBeNull();
    expect(sections[0]?.rows).toEqual([]);
  });

  test('the unfiled section only names itself when it has siblings', () => {
    // One list with no folders in it is the drawer as it has always read.
    expect(drawerSections([session('a')], [], null)[0]?.label).toBe('conversations');
    expect(drawerSections([session('a')], [folder('f1', 'CubeFlow', 0)], null)[1]?.label).toBe('No folder');
  });

  test('the rows are the caller\'s: what the search kept is what a section holds', () => {
    const sections = drawerSections([session('b', { folderId: 'f1' })], [folder('f1', 'CubeFlow', 0)], null);

    expect(sections[0]?.rows).toHaveLength(1);
  });
});
