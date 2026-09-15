import { workspaceOptions, matchesWorkspace } from '../workspaceFilter';
import type { SessionSummary } from '../protocol';

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

describe('workspaceOptions', () => {
  test('lists the workspaces in use, with their counts', () => {
    const options = workspaceOptions([
      session('a', { workspace: 'dev', lastActiveAt: '2026-01-02T00:00:00.000Z' }),
      session('b', { workspace: 'cf', lastActiveAt: '2026-01-03T00:00:00.000Z' }),
      session('c', { workspace: 'dev', lastActiveAt: '2026-01-01T00:00:00.000Z' }),
    ]);

    expect(options).toEqual([
      { key: 'cf', count: 1, lastActiveAt: '2026-01-03T00:00:00.000Z' },
      { key: 'dev', count: 2, lastActiveAt: '2026-01-02T00:00:00.000Z' },
    ]);
  });

  test('the most recent conversation of a workspace is what orders it', () => {
    const options = workspaceOptions([
      session('a', { workspace: 'dev', lastActiveAt: '2026-01-09T00:00:00.000Z' }),
      session('b', { workspace: 'cf', lastActiveAt: '2026-01-05T00:00:00.000Z' }),
      session('c', { workspace: 'cf', lastActiveAt: '2026-01-08T00:00:00.000Z' }),
    ]);

    // dev holds the newest conversation of the three, so it leads -- with the smaller count.
    expect(options.map(option => option.key)).toEqual(['dev', 'cf']);
    expect(options[0]).toEqual({ key: 'dev', count: 1, lastActiveAt: '2026-01-09T00:00:00.000Z' });
    expect(options[1]?.count).toBe(2);
  });

  test('a conversation with no workspace counts as the default one', () => {
    const options = workspaceOptions([session('a'), session('b', { workspace: 'default' })]);

    expect(options).toEqual([{ key: 'default', count: 2, lastActiveAt: '2026-01-01T00:00:00.000Z' }]);
  });

  test('a workspace nobody has a conversation in is not offered', () => {
    expect(workspaceOptions([session('a', { workspace: 'dev' })])).toHaveLength(1);
  });

  test('an empty listing offers nothing, and filters nothing out', () => {
    expect(workspaceOptions([])).toEqual([]);
    expect(matchesWorkspace(session('a', { workspace: 'cf' }), null)).toBe(true);
  });
});

describe('matchesWorkspace', () => {
  test('keeps only the filtered workspace, default included', () => {
    const inCf = session('a', { workspace: 'cf' });
    const plain = session('b');
    const explicitDefault = session('c', { workspace: 'default' });

    expect(matchesWorkspace(inCf, 'cf')).toBe(true);
    expect(matchesWorkspace(plain, 'cf')).toBe(false);
    expect(matchesWorkspace(plain, 'default')).toBe(true);
    expect(matchesWorkspace(explicitDefault, 'default')).toBe(true);
    expect(matchesWorkspace(explicitDefault, 'cf')).toBe(false);
  });
});
