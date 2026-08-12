import { groupRoster, subAgentStore } from '../subagents';
import type { SubAgentEntry } from '../protocol';

const entry = (over: Partial<SubAgentEntry> & { id: string }): SubAgentEntry => ({
  threadId: `sub-${over.id}`,
  displayName: over.id.replace(/^subagent\//, '').replace(/-[0-9a-f]{4}$/, ''),
  type: 'research',
  messageCount: 3,
  status: 'idle',
  visibility: 'global',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const spawn = (over: { id: string; mode?: string; type?: string; name?: string; ok?: boolean; durationMs?: number }) => ({
  id: over.id,
  name: 'spawn',
  args: { mode: over.mode ?? 'run', type: over.type ?? 'research', name: over.name ?? 'digger' },
  ok: over.ok ?? true,
  ...(over.durationMs === undefined ? {} : { durationMs: over.durationMs }),
});

beforeEach(() => subAgentStore.reset());

describe('groupRoster', () => {
  it('puts named before temporary and groups each by agent type', () => {
    const groups = groupRoster(
      [entry({ id: 'subagent/w-0001', type: 'writer' }), entry({ id: 'subagent/r-0002', type: 'research' })],
      [spawn({ id: 't1', type: 'writer' }), spawn({ id: 't2', type: 'research' })],
    );
    expect(groups.map(g => `${g.major}/${g.type}`)).toEqual([
      'named/research',
      'named/writer',
      'temporary/research',
      'temporary/writer',
    ]);
  });

  it('floats the type holding a running agent to the top of the named groups', () => {
    const groups = groupRoster(
      [
        entry({ id: 'subagent/a-0001', type: 'aaa' }),
        entry({ id: 'subagent/z-0002', type: 'zzz', status: 'running' }),
      ],
      [],
    );
    // Alphabetical would have put aaa first: what is working now wins over the sort.
    expect(groups.map(g => g.type)).toEqual(['zzz', 'aaa']);
  });

  it('within a type, running leads and then the most recent', () => {
    const groups = groupRoster(
      [
        entry({ id: 'subagent/old-0001', createdAt: '2026-01-01T00:00:00.000Z' }),
        entry({ id: 'subagent/new-0002', createdAt: '2026-03-01T00:00:00.000Z' }),
        entry({ id: 'subagent/busy-0003', createdAt: '2025-01-01T00:00:00.000Z', status: 'running' }),
      ],
      [],
    );
    expect(groups[0]!.rows.map(r => r.key)).toEqual([
      'subagent/busy-0003',
      'subagent/new-0002',
      'subagent/old-0001',
    ]);
  });

  it('breaks a tie on id so the order never wobbles between renders', () => {
    const same = '2026-01-01T00:00:00.000Z';
    const rows = groupRoster(
      [entry({ id: 'subagent/b-0002', createdAt: same }), entry({ id: 'subagent/a-0001', createdAt: same })],
      [],
    )[0]!.rows;
    expect(rows.map(r => r.key)).toEqual(['subagent/a-0001', 'subagent/b-0002']);
  });

  it('only one-shot spawn cards become temporary rows', () => {
    const groups = groupRoster([], [
      spawn({ id: 'kept', mode: 'run' }),
      // A session-mode spawn is a named agent: it comes from the server roster, not the transcript,
      // or it would be listed twice.
      spawn({ id: 'skipped', mode: 'session' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rows.map(r => r.key)).toEqual(['kept']);
  });

  it('keeps a failed one-shot, with its outcome and duration', () => {
    const rows = groupRoster([], [spawn({ id: 'boom', ok: false, durationMs: 8100 })])[0]!.rows;
    expect(rows[0]).toMatchObject({ kind: 'temporary', toolItemId: 'boom', ok: false, durationMs: 8100 });
  });

  it('lists one-shots newest first', () => {
    const rows = groupRoster([], [spawn({ id: 'first' }), spawn({ id: 'second' })])[0]!.rows;
    expect(rows.map(r => r.key)).toEqual(['second', 'first']);
  });

  it('is empty when there is nothing, rather than showing empty groups', () => {
    expect(groupRoster([], [])).toEqual([]);
    expect(groupRoster([], [{ id: 'x', name: 'read', args: {}, ok: true }])).toEqual([]);
  });
});

describe('subAgentStore', () => {
  it('keeps one roster per conversation', () => {
    subAgentStore.receive({ type: 'subagents.list.result', threadId: 'a', agents: [entry({ id: 'subagent/x-0001' })] });
    subAgentStore.receive({ type: 'subagents.list.result', threadId: 'b', agents: [] });
    expect(subAgentStore.get('a').agents).toHaveLength(1);
    expect(subAgentStore.get('b').agents).toHaveLength(0);
    // An unasked conversation is 'unknown', which is not the same as an empty roster.
    expect(subAgentStore.get('c').status).toBe('unknown');
    expect(subAgentStore.get('b').status).toBe('ready');
  });

  it('an unanswering server is unsupported everywhere, and never overwrites a real answer', () => {
    subAgentStore.receive({ type: 'subagents.list.result', threadId: 'a', agents: [entry({ id: 'subagent/x-0001' })] });
    subAgentStore.receive({ type: 'subagents.list.result', threadId: 'b', agents: [] });
    subAgentStore.get('b');
    subAgentStore.markUnsupported();
    expect(subAgentStore.isUnsupported()).toBe(true);
    expect(subAgentStore.get('a').status).toBe('ready');
  });
});
