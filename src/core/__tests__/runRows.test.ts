import { buildRows, isHoisted } from '../runRows';
import type { ChatItem } from '../chat';

/** A finished run's items, status, timeline. */
const run = (id: string, status: 'running' | 'done' | 'aborted' | 'error' = 'done', start = 100, end?: number) => ({
  id,
  status,
  startTs: start,
  ...(end !== undefined ? { endTs: end } : {}),
});

const tool = (id: string, runId?: string): ChatItem =>
  ({
    kind: 'tool',
    id,
    name: 'bash',
    args: {},
    output: 'ok',
    ok: true,
    truncated: false,
    ts: 5,
    ...(runId ? { run: run(runId) } : {}),
  }) as ChatItem;

const agentText = (id: string, text: string, runId?: string, extra: Partial<ChatItem & { command?: boolean; notice?: boolean }> = {}): ChatItem =>
  ({
    kind: 'text',
    id,
    role: 'agent',
    text,
    attachments: [],
    streaming: false,
    ts: 5,
    ...(runId ? { run: run(runId) } : {}),
    ...extra,
  }) as ChatItem;

const userText = (id: string): ChatItem =>
  ({ kind: 'text', id, role: 'user', text: 'q', attachments: [], streaming: false, ts: 1 }) as ChatItem;

describe('buildRows', () => {
  test('a finished run folds its work under one group, answer stays outside', () => {
    const rows = buildRows([userText('u'), tool('t1', 'r1'), agentText('a1', 'thinking', 'r1'), agentText('a2', 'answer', 'r1')]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: 'item' });
    expect(rows[1]).toMatchObject({ kind: 'group', run: { id: 'r1' } });
    expect(rows[2]).toMatchObject({ kind: 'item', item: { id: 'a2' } });
    expect((rows[1] as { items: ChatItem[] }).items.map(i => i.id)).toEqual(['t1', 'a1']);
  });

  test('a running run is never grouped, even with a closed run before it', () => {
    const items = [
      userText('u1'),
      tool('t1', 'r1'),
      agentText('a1', 'prev answer', 'r1'),
      userText('u2'),
      tool('t2', 'r2'),
      agentText('a2', 'working…', 'r2'),
    ];
    const rows = buildRows(items.map(i => (i.id === 't2' || i.id === 'a2' ? { ...i, run: run('r2', 'running') } : i)));
    expect(rows.filter(r => r.kind === 'group')).toHaveLength(1);
    expect(rows.filter(r => r.kind === 'group' && r.run.status === 'running')).toHaveLength(0);
  });

  test('a user turn inside a run stays a row and splits the group around it', () => {
    const rows = buildRows([
      userText('u'),
      tool('t1', 'r1'),
      userText('steer'),
      tool('t2', 'r1'),
      agentText('a', 'answer', 'r1'),
    ]);
    const groups = rows.filter(r => r.kind === 'group') as Array<{ items: ChatItem[] }>;
    expect(groups).toHaveLength(2);
    expect(groups[0]!.items.map(i => i.id)).toEqual(['t1']);
    expect(groups[1]!.items.map(i => i.id)).toEqual(['t2']);
    expect(rows.map(r => (r.kind === 'item' ? r.item.id : 'group'))).toEqual(['u', 'group', 'steer', 'group', 'a']);
  });

  test('a run that ended on a tool keeps everything in the group', () => {
    const rows = buildRows([userText('u'), tool('t1', 'r1'), tool('t2', 'r1'), agentText('a', 'partial', 'r1'), tool('t3', 'r1')]);
    expect(rows).toHaveLength(2);
    expect((rows[1] as { items: ChatItem[] }).items.map(i => i.id)).toEqual(['t1', 't2', 'a', 't3']);
  });

  test('a run whose only content is its answer produces no group', () => {
    const rows = buildRows([userText('u'), agentText('a', 'answer', 'r1')]);
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.kind === 'item')).toBe(true);
  });

  test('items without a run stay plain rows in order', () => {
    const rows = buildRows([userText('u'), tool('t1'), agentText('a', 'answer')]);
    expect(rows.every(r => r.kind === 'item')).toBe(true);
    expect(rows.map(r => (r.kind === 'item' ? r.item.id : ''))).toEqual(['u', 't1', 'a']);
  });

  test('two closed runs fold separately with their answers after each', () => {
    const rows = buildRows([
      userText('u1'),
      tool('t1', 'r1'),
      agentText('a1', 'answer one', 'r1'),
      userText('u2'),
      tool('t2', 'r2'),
      tool('t3', 'r2'),
      agentText('a2', 'answer two', 'r2'),
    ]);
    expect(rows.map(r => (r.kind === 'group' ? `g:${r.run.id}` : r.item.id))).toEqual(['u1', 'g:r1', 'a1', 'u2', 'g:r2', 'a2']);
  });

  test('an aborted run folds its work and keeps the partial answer outside', () => {
    const rows = buildRows([
      userText('u'),
      tool('t1', 'r1'),
      agentText('a', 'half an answer', 'r1'),
    ].map(i => (i.id === 't1' || i.id === 'a' ? { ...i, run: run('r1', 'aborted', 100, 200) } : i)));
    expect(rows[1]).toMatchObject({ kind: 'group', run: { id: 'r1', status: 'aborted' } });
    expect(rows[2]).toMatchObject({ kind: 'item', item: { id: 'a' } });
  });

  test('a command result inside a run is hoisted like an injected turn', () => {
    const rows = buildRows([
      userText('u'),
      tool('t1', 'r1'),
      agentText('cmd', '/status output', 'r1', { command: true }),
      tool('t2', 'r1'),
      agentText('a', 'answer', 'r1'),
    ]);
    const groups = rows.filter(r => r.kind === 'group') as Array<{ items: ChatItem[] }>;
    expect(groups).toHaveLength(2);
    // The command row sits between the two group segments.
    expect(rows.map(r => (r.kind === 'item' ? r.item.id : 'group'))).toEqual(['u', 'group', 'cmd', 'group', 'a']);
  });
});

describe('isHoisted', () => {
  test('user turns, commands, notices and boundaries are hoisted; phases and tools are not', () => {
    expect(isHoisted(userText('u'))).toBe(true);
    expect(isHoisted(agentText('c', 'out', undefined, { command: true }))).toBe(true);
    expect(isHoisted(agentText('n', 'notice', undefined, { notice: true }))).toBe(true);
    expect(isHoisted({ ...(userText('b') as ChatItem & { summaryOf?: number }), summaryOf: 3 } as unknown as ChatItem)).toBe(true);
    expect(isHoisted(tool('t'))).toBe(false);
    expect(isHoisted(agentText('a', 'text'))).toBe(false);
  });
});