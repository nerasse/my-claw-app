import { rosterRows, scopeLabelOf, sharedRosterRows, spawnDoorsOf, spawnLiveOf, subAgentStore } from '../subagents';
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

describe('rosterRows', () => {
  it('orders by the last message, most recent first', () => {
    const rows = rosterRows([
      entry({ id: 'subagent/old-0001', lastMessageAt: '2026-05-01T10:00:00.000Z' }),
      entry({ id: 'subagent/new-0002', lastMessageAt: '2026-05-03T10:00:00.000Z' }),
      entry({ id: 'subagent/mid-0003', lastMessageAt: '2026-05-02T10:00:00.000Z' }),
    ]);
    expect(rows.map(r => r.key)).toEqual(['subagent/new-0002', 'subagent/mid-0003', 'subagent/old-0001']);
  });

  /**
   * The complaint this replaces: the roster grouped named-before-temporary and then by agent type,
   * so the agent that answered a minute ago sat wherever its type alphabetically fell, under a
   * heading nobody reads twice.
   */
  it('mixes types and one-shots together: the date is the only order', () => {
    const rows = rosterRows([
      entry({ id: 'subagent/w-0001', type: 'writer', lastMessageAt: '2026-05-01T10:00:00.000Z' }),
      oneShot({ type: 'research', lastMessageAt: '2026-05-03T10:00:00.000Z' }),
      entry({ id: 'subagent/r-0002', type: 'research', lastMessageAt: '2026-05-02T10:00:00.000Z' }),
    ]);
    expect(rows.map(r => r.key)).toEqual([
      expect.stringContaining('subagent/run-'),
      'subagent/r-0002',
      'subagent/w-0001',
    ]);
    // The distinction is still on the row, not over it.
    expect(rows[0]!.kind).toBe('temporary');
    expect(rows[1]!.kind).toBe('named');
  });

  it('falls back to createdAt on a server that does not send lastMessageAt', () => {
    const rows = rosterRows([
      entry({ id: 'subagent/old-0001', createdAt: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'subagent/new-0002', createdAt: '2026-03-01T00:00:00.000Z' }),
    ]);
    expect(rows.map(r => r.key)).toEqual(['subagent/new-0002', 'subagent/old-0001']);
  });

  it('breaks a tie on running first, then id, so the order never wobbles between renders', () => {
    const same = '2026-05-01T00:00:00.000Z';
    const rows = rosterRows([
      entry({ id: 'subagent/b-0002', lastMessageAt: same }),
      entry({ id: 'subagent/a-0001', lastMessageAt: same }),
      entry({ id: 'subagent/z-0003', lastMessageAt: same, status: 'running' }),
    ]);
    expect(rows.map(r => r.key)).toEqual(['subagent/z-0003', 'subagent/a-0001', 'subagent/b-0002']);
  });

  it('classes a kept one-shot as temporary, and it carries its entry to open the chat', () => {
    const kept = oneShot({ displayName: 'researcher' });
    const rows = rosterRows([kept, entry({ id: 'subagent/digger-a1b2' })]);
    expect(rows.find(r => r.kind === 'temporary')).toEqual({ kind: 'temporary', key: kept.id, entry: kept });
    expect(rows.find(r => r.kind === 'named')).toMatchObject({ kind: 'named' });
  });

  it('is empty when there is nothing', () => {
    expect(rosterRows([])).toEqual([]);
  });
});

describe('sharedRosterRows', () => {
  it('keeps public and workspace agents, ordered by date across both', () => {
    const rows = sharedRosterRows([
      entry({ id: 'subagent/w-0001', visibility: 'workspace', workspaceKey: 'beta', lastMessageAt: '2026-05-03T00:00:00.000Z' }),
      entry({ id: 'subagent/g-0002', lastMessageAt: '2026-05-01T00:00:00.000Z' }),
      entry({ id: 'subagent/a-0003', visibility: 'workspace', workspaceKey: 'alpha', lastMessageAt: '2026-05-02T00:00:00.000Z' }),
    ]);
    expect(rows.map(r => r.key)).toEqual(['subagent/w-0001', 'subagent/a-0003', 'subagent/g-0002']);
    // The scope is what tells them apart now that no section header does.
    expect(rows.map(r => scopeLabelOf(r.entry))).toEqual(['workspace · beta', 'workspace · alpha', 'public']);
  });

  it('keeps private agents out: they belong to the conversation roster', () => {
    const rows = sharedRosterRows([
      entry({ id: 'subagent/p-0001', visibility: 'private' }),
      oneShot(),
      entry({ id: 'subagent/g-0002' }),
    ]);
    expect(rows.map(r => r.entry.id)).toEqual(['subagent/g-0002']);
  });

  it('an unkeyed workspace agent reads as the default workspace, not as public', () => {
    const agent = entry({ id: 'subagent/d-0001', visibility: 'workspace' });
    expect(scopeLabelOf(agent)).toBe('workspace · default');
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

  // A `send` card addresses its target by id and carries no `name` argument at all.
  it('offers a door to a send card, which names its target by id', () => {
    const agents = [entry({ id: 'subagent/digger', displayName: 'digger' })];
    const sendCard = card({ id: 'send-1', name: 'send', args: { id: 'subagent/digger', message: 'again' } });
    expect(spawnDoorsOf([sendCard], agents).get('send-1')).toEqual({ label: 'digger', status: 'idle' });
  });

  it('matches on the pushed id before the claimed name', () => {
    const agents = [
      entry({ id: 'subagent/run-abcd', displayName: 'other' }),
      entry({ id: 'subagent/digger', displayName: 'digger' }),
    ];
    const doors = spawnDoorsOf([card({ subagentId: 'subagent/run-abcd' })], agents);
    expect(doors.get('t-call-1')?.label).toBe('run-abcd');
  });

  it('finds a one-shot by the name its lifecycle carries when nothing else matches', () => {
    // A one-shot is spawned with no `name` argument, and its `subagentId` lives only in the live
    // state no page carries: after a reload the card had no door at all, and a stopped card is
    // exactly the one the owner goes back to (2026-11-19).
    const agents = [entry({ id: 'subagent/run-1a2b', displayName: 'run-1a2b' })];
    const named = card({ args: { type: 'research', mode: 'run', task: 'creuse' }, displayName: 'run-1a2b' });
    expect(spawnDoorsOf([named], agents).get('t-call-1')?.label).toBe('run-1a2b');
    // Without it there is still nothing to open.
    const anonymous = card({ args: { type: 'research', mode: 'run', task: 'creuse' } });
    expect(spawnDoorsOf([anonymous], agents).size).toBe(0);
  });
});

describe('spawnLiveOf', () => {
  // A pure projection now. The roster fallback it used to carry is `reconcileSpawnRoster`, tested
  // in chat.test.ts: one owner, writing into the status map every reader shares.
  it('projects the lifecycle state the card carries', () => {
    const live = spawnLiveOf([card({ subagentId: 'subagent/digger', status: 'complete' })]);
    expect(live.get('t-call-1')).toEqual({ subagentId: 'subagent/digger', displayName: 'digger', status: 'complete' });
  });

  it('prefers the name the state was replayed with over the one the call asked for', () => {
    const live = spawnLiveOf([card({ subagentId: 'subagent/x', status: 'running', displayName: 'replayed' })]);
    expect(live.get('t-call-1')?.displayName).toBe('replayed');
  });

  it('falls back to the subagent id when neither name is known', () => {
    const live = spawnLiveOf([{ ...card({ subagentId: 'subagent/x', status: 'running' }), args: {} }]);
    expect(live.get('t-call-1')?.displayName).toBe('subagent/x');
  });

  it('carries nothing for a card with no state: an id without a status is not a lifecycle', () => {
    expect(spawnLiveOf([card()]).size).toBe(0);
    expect(spawnLiveOf([card({ subagentId: 'subagent/digger' })]).size).toBe(0);
    expect(spawnLiveOf([card({ status: 'running' })]).size).toBe(0);
  });
});
