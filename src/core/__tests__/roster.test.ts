import { groupRoster, groupSharedRoster, scopeLabelOf, spawnDoorsOf, spawnLiveOf, subAgentStore } from '../subagents';
import type { SpawnCard } from '../chat';
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

describe('groupSharedRoster', () => {
  it('puts public first, then one section per workspace, alphabetically', () => {
    const groups = groupSharedRoster([
      entry({ id: 'subagent/b-0001', visibility: 'workspace', workspaceKey: 'beta' }),
      entry({ id: 'subagent/a-0002', visibility: 'workspace', workspaceKey: 'alpha' }),
      entry({ id: 'subagent/g-0003' }),
    ]);
    expect(groups.map(g => g.major)).toEqual(['public', 'workspace · alpha', 'workspace · beta']);
  });

  it('keeps private agents out: they belong to the conversation roster', () => {
    const groups = groupSharedRoster([
      entry({ id: 'subagent/p-0001', visibility: 'private' }),
      oneShot(),
      entry({ id: 'subagent/g-0002' }),
    ]);
    expect(groups.flatMap(g => g.rows.map(r => r.entry.id))).toEqual(['subagent/g-0002']);
  });

  it('groups by agent type inside a workspace section, like the conversation roster', () => {
    const groups = groupSharedRoster([
      entry({ id: 'subagent/w-0001', type: 'writer', visibility: 'workspace', workspaceKey: 'alpha' }),
      entry({ id: 'subagent/r-0002', type: 'research', visibility: 'workspace', workspaceKey: 'alpha' }),
    ]);
    expect(groups.map(g => `${g.major}/${g.type}`)).toEqual([
      'workspace · alpha/research',
      'workspace · alpha/writer',
    ]);
  });

  it('an unkeyed workspace agent reads as the default workspace, not as public', () => {
    const agent = entry({ id: 'subagent/d-0001', visibility: 'workspace' });
    expect(scopeLabelOf(agent)).toBe('workspace · default');
    expect(groupSharedRoster([agent]).map(g => g.major)).toEqual(['workspace · default']);
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

const card = (over: Partial<SpawnCard> = {}): SpawnCard => ({
  id: 't-call-1',
  name: 'spawn',
  args: { type: 'research', mode: 'session', task: 'creuse', name: 'digger' },
  ok: true,
  durationMs: undefined,
  ...over,
});

describe('spawnDoorsOf', () => {
  it('offers a door while the roster still lists the agent, and none once it is gone', () => {
    const agents = [entry({ id: 'subagent/digger', displayName: 'digger' })];
    expect(spawnDoorsOf([card()], agents).get('t-call-1')).toEqual({ label: 'digger', status: 'idle' });
    expect(spawnDoorsOf([card()], []).size).toBe(0);
  });

  it('matches on the pushed id before the claimed name', () => {
    const agents = [
      entry({ id: 'subagent/run-abcd', displayName: 'other' }),
      entry({ id: 'subagent/digger', displayName: 'digger' }),
    ];
    const doors = spawnDoorsOf([card({ subagentId: 'subagent/run-abcd' })], agents);
    expect(doors.get('t-call-1')?.label).toBe('run-abcd');
  });
});

describe('spawnLiveOf', () => {
  it('prefers what the frames pushed', () => {
    const live = spawnLiveOf([card({ subagentId: 'subagent/digger', status: 'complete' })], []);
    expect(live.get('t-call-1')).toEqual({ subagentId: 'subagent/digger', displayName: 'digger', status: 'complete' });
  });

  // `chat.spawn.start` is sent once and never replayed, so a page reloaded mid-run has no status
  // for the card. The roster is asked for, so it still knows the sub-agent is going.
  it('falls back to the roster for a call that has not returned', () => {
    const agents = [entry({ id: 'subagent/digger', displayName: 'digger', status: 'running' })];
    const live = spawnLiveOf([card({ running: true })], agents);
    expect(live.get('t-call-1')).toEqual({ subagentId: 'subagent/digger', displayName: 'digger', status: 'running' });
  });

  // A session sub-agent is reusable: an old, finished card naming an agent that is busy again must
  // not light up as if its own call were running.
  it('does not revive a settled card whose named agent is busy again', () => {
    const agents = [entry({ id: 'subagent/digger', displayName: 'digger', status: 'running' })];
    expect(spawnLiveOf([card({ running: false, durationMs: 1200 })], agents).size).toBe(0);
  });

  it('infers nothing when the agent is idle: the card speaks for its own outcome', () => {
    const agents = [entry({ id: 'subagent/digger', displayName: 'digger', status: 'idle' })];
    expect(spawnLiveOf([card({ running: true })], agents).size).toBe(0);
  });

  it('infers nothing when the roster does not know the agent', () => {
    expect(spawnLiveOf([card({ running: true })], []).size).toBe(0);
  });
});
