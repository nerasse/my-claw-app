import { buildRows, isHoisted, type ChatRow } from '../runRows';
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

/** A folded run row, as the server sends it in place of the work -- docs/run-hydration.md. */
const folded = (id: string, runId: string, itemCount = 12, lastId = `${id}-last`): ChatItem =>
  ({
    kind: 'run',
    id: `run-${id}`,
    run: run(runId),
    toolCount: itemCount,
    firstTool: 'bash',
    itemCount,
    lastId,
    hydration: 'idle',
    ts: 5,
  }) as ChatItem;

/** One label per row, so an assertion reads as the sequence a reader would see. */
const labelOfRow = (row: ChatRow): string => {
  if (row.kind === 'group') return `g:${row.run.id}`;
  if (row.kind === 'folded') return `f:${row.run.id}:${row.summaries.reduce((n, s) => n + s.itemCount, 0)}`;
  return row.item.id;
};

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
    expect(rows.map(labelOfRow)).toEqual(['u1', 'g:r1', 'a1', 'u2', 'g:r2', 'a2']);
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
describe('folded runs: the work never travelled', () => {
  test('a folded row is a group row of its own', () => {
    const rows = buildRows([userText('u'), folded('a', 'r1'), agentText('ans', 'answer', 'r1')]);
    // The answer stays outside, exactly as it does when the items are held: the server hoists it
    // for the same reason this list does.
    expect(rows.map(labelOfRow)).toEqual(['u', 'f:r1:12', 'ans']);
  });

  test('two adjacent rows of the same run merge into one group', () => {
    // A run cut by a page boundary folds once per page. The reader must see one group, not the
    // same run twice with its work split at an arbitrary count.
    const rows = buildRows([userText('u'), folded('older', 'r1', 40), folded('newer', 'r1', 12)]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'f:r1:52']);
    const group = rows[1];
    expect(group?.kind === 'folded' ? group.summaries.length : 0).toBe(2);
  });

  test('rows of different runs stay apart', () => {
    const rows = buildRows([folded('a', 'r1'), folded('b', 'r2')]);
    expect(rows.map(labelOfRow)).toEqual(['f:r1:12', 'f:r2:12']);
  });

  test('a bubble between two rows of one run keeps them apart', () => {
    // The owner injected a turn mid-run: it splits the group, and merging across it would put
    // work from both sides of the question under one header.
    const rows = buildRows([folded('a', 'r1'), userText('steer'), folded('b', 'r1')]);
    expect(rows.map(labelOfRow)).toEqual(['f:r1:12', 'steer', 'f:r1:12']);
  });

  test('a folded row closes a group of held items', () => {
    // Half the run hydrated, half still folded: the two must not merge into one row, and the
    // held half must not swallow the header.
    const rows = buildRows([tool('t1', 'r1'), tool('t2', 'r1'), folded('rest', 'r1')]);
    expect(rows.map(labelOfRow)).toEqual(['g:r1', 'f:r1:12']);
  });
});
