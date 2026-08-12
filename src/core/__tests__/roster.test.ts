import { groupRoster, subAgentStore } from '../subagents';
import type { SubAgentEntry } from '../protocol';

const entry = (over: Partial<SubAgentEntry> & { id: string }): SubAgentEntry => ({
  threadId: `sub-${over.id.replace(/\W/g, '')}`,
  displayName: over.id.replace(/^subagent\//, '').replace(/-[0-9a-f]{4}$/, ''),
  type: 'research',
  messageCount: 3,
  status: 'idle',
  visibility: 'global',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const oneShot = (over: Partial<SubAgentEntry> = {}): SubAgentEntry =>
  entry({ id: `subagent/run-${Math.random().toString(16).slice(2, 10)}`, visibility: 'private', ...over });

beforeEach(() => subAgentStore.reset());

describe('groupRoster', () => {
  it('puts named before temporary and groups each by agent type', () => {
    const groups = groupRoster([
      entry({ id: 'subagent/w-0001', type: 'writer' }),
      entry({ id: 'subagent/r-0002', type: 'research' }),
      oneShot({ type: 'writer' }),
      oneShot({ type: 'research' }),
    ]);
    expect(groups.map(g => `${g.major}/${g.type}`)).toEqual([
      'named/research',
      'named/writer',
      'temporary/research',
      'temporary/writer',
    ]);
  });

  it('floats the type holding a running agent to the top of each category', () => {
    const groups = groupRoster([
      entry({ id: 'subagent/a-0001', type: 'aaa' }),
      entry({ id: 'subagent/z-0002', type: 'zzz', status: 'running' }),
      oneShot({ type: 'aaa', status: 'running' }),
    ]);
    // Alphabetical would have put aaa first: what is working now wins over the sort.
    expect(groups.map(g => `${g.major}/${g.type}`)).toEqual(['named/zzz', 'named/aaa', 'temporary/aaa']);
  });

  it('within a type, running leads and then the most recent', () => {
    const groups = groupRoster([
      entry({ id: 'subagent/old-0001', createdAt: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'subagent/new-0002', createdAt: '2026-03-01T00:00:00.000Z' }),
      entry({ id: 'subagent/busy-0003', createdAt: '2025-01-01T00:00:00.000Z', status: 'running' }),
    ]);
    expect(groups[0]!.rows.map(r => r.key)).toEqual([
      'subagent/busy-0003',
      'subagent/new-0002',
      'subagent/old-0001',
    ]);
  });

  it('breaks a tie on id so the order never wobbles between renders', () => {
    const same = '2026-01-01T00:00:00.000Z';
    const rows = groupRoster([
      entry({ id: 'subagent/b-0002', createdAt: same }),
      entry({ id: 'subagent/a-0001', createdAt: same }),
    ])[0]!.rows;
    expect(rows.map(r => r.key)).toEqual(['subagent/a-0001', 'subagent/b-0002']);
  });

  it('classes a kept one-shot as temporary, and it carries its entry to open the chat', () => {
    const kept = oneShot({ displayName: 'researcher' });
    const groups = groupRoster([kept, entry({ id: 'subagent/digger-a1b2' })]);
    const temporary = groups.find(g => g.major === 'temporary')!;
    expect(temporary.rows).toEqual([
      { kind: 'temporary', key: kept.id, entry: kept },
    ]);
    expect(groups.find(g => g.major === 'named')!.rows[0]).toMatchObject({ kind: 'named' });
  });

  it('is empty when there is nothing, rather than showing empty groups', () => {
    expect(groupRoster([])).toEqual([]);
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
