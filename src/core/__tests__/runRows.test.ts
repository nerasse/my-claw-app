import { buildRows, isHoisted, pinnedSends, type ChatRow } from '../runRows';
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
  if (row.kind === 'rule') return 'rule';
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

  test('a run that died on a tool, having written no prose, keeps everything in the group', () => {
    const rows = buildRows([userText('u'), tool('t1', 'r1'), tool('t2', 'r1'), tool('t3', 'r1')]);
    expect(rows).toHaveLength(2);
    expect((rows[1] as { items: ChatItem[] }).items.map(i => i.id)).toEqual(['t1', 't2', 't3']);
  });

  /**
   * Measured on a real thread (2026-09-10): a tool card left `running` when the run ended is
   * re-appended after the answer by the store, and "the answer is the last item" then swallows the
   * answer into its own run's group -- the reader saw the last message inside the collapsed work.
   * The answer is the last prose the agent wrote, wherever the stray card landed.
   */
  test('an answer followed by a stray card is still the answer, and leaves the group', () => {
    const rows = buildRows([userText('u'), tool('t1', 'r1'), agentText('a', 'answer', 'r1'), tool('t-late', 'r1')]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ kind: 'group', run: { id: 'r1' } });
    expect((rows[1] as { items: ChatItem[] }).items.map(i => i.id)).toEqual(['t1', 't-late']);
    expect(rows[2]).toMatchObject({ kind: 'item', item: { id: 'a' } });
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

  /**
   * The owner's rule (2026-09-14): only a run that finished has an answer to elect. On a run that
   * was stopped or died, the prose is an interim step written *before* the calls that followed it
   * -- hoisting it out drew it under all of them, and the reading order lied about where the run
   * actually stopped. Everything stays folded then, in the order it was written.
   */
  test('a stopped run elects nothing: its prose stays in the group, at the place it was written', () => {
    const rows = buildRows(
      [
        userText('u'),
        tool('t1', 'r1'),
        agentText('a', 'half an answer, written before the last call', 'r1'),
        tool('t2', 'r1'),
      ].map(i => (i.id === 'u' ? i : { ...i, run: run('r1', 'aborted', 100, 200) })),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ kind: 'group', run: { id: 'r1', status: 'aborted' } });
    expect((rows[1] as { items: ChatItem[] }).items.map(i => i.id)).toEqual(['t1', 'a', 't2']);
  });

  test('a run that died on an error elects nothing either', () => {
    const rows = buildRows(
      [
        userText('u'),
        tool('t1', 'r1'),
        agentText('a', 'half an answer', 'r1'),
        tool('t2', 'r1'),
      ].map(i => (i.id === 'u' ? i : { ...i, run: run('r1', 'error', 100, 200) })),
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ kind: 'group', run: { id: 'r1', status: 'error' } });
    expect((rows[1] as { items: ChatItem[] }).items.map(i => i.id)).toEqual(['t1', 'a', 't2']);
  });

  test('a hoisted bubble still cuts a stopped run, and the prose stays on its side of it', () => {
    const rows = buildRows(
      [
        userText('u'),
        tool('t1', 'r1'),
        userText('steer'),
        tool('t2', 'r1'),
        agentText('a', 'what it had written', 'r1'),
      ].map(i => (i.id === 'u' || i.id === 'steer' ? i : { ...i, run: run('r1', 'aborted', 100, 200) })),
    );
    // The injected turn keeps its place and splits the group around it; nothing is hoisted out of
    // the second segment, so the prose stays where it was written.
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'steer', 'g:r1']);
    const groups = rows.filter(row => row.kind === 'group') as Array<{ items: ChatItem[] }>;
    expect(groups.map(group => group.items.map(i => i.id))).toEqual([['t1'], ['t2', 'a']]);
  });

  test('a finished run still elects its answer, even past a phase that follows it', () => {
    // The nominal case, unchanged: the answer is found by content, not by position.
    const rows = buildRows([
      userText('u'),
      tool('t1', 'r1'),
      agentText('a', 'here is the answer', 'r1'),
      agentText('p-after', '', 'r1', { reasoning: 'second thoughts' }),
    ]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'a']);
    expect((rows[1] as { items: ChatItem[] }).items.map(i => i.id)).toEqual(['t1', 'p-after']);
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
    // The boundary's stopped sibling hoists on the same field: the rule never becomes a bubble
    // inside a run group, however it was stopped.
    expect(
      isHoisted({
        ...(userText('bs') as ChatItem & { summaryOf?: number }),
        summaryOf: 12,
        compactionStopped: true,
      } as unknown as ChatItem),
    ).toBe(true);
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

/**
 * A bubble the reader cannot read.
 *
 * The server drops the bubbles it has nothing to say with before sending them, so one that
 * arrives empty is a row with no prose, no attachment, no thought and nothing to act on: a blank
 * bubble in the middle of a conversation. It also cuts the group it lands in, since a row is what
 * breaks the fold (2026-09-16).
 */
describe('a bubble with nothing to draw', () => {
  const bare = (extra: Partial<ChatItem> = {}): ChatItem =>
    ({ kind: 'text', id: 'empty', role: 'agent', text: '', attachments: [], streaming: false, ts: 1, ...extra }) as ChatItem;

  test('is not a row at all', () => {
    expect(buildRows([bare()])).toEqual([]);
    // And it does not cut the group it landed in: the two cards stay one run.
    const rows = buildRows([tool('t1', 'r1'), bare(), tool('t2', 'r1')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('group');
  });

  test('a send waiting for its turn is not empty: it says so, and keeps its row', () => {
    expect(buildRows([bare({ pending: true })])).toHaveLength(1);
    expect(buildRows([bare({ queuedSince: 5, queuedReason: 'compaction' })])).toHaveLength(1);
  });

  test('a chip is enough to keep the bubble', () => {
    const chip = { id: 'm1', type: 'image', filename: 'fr-CV.png', deleted: true } as ChatItem extends { attachments: (infer A)[] } ? A : never;
    expect(buildRows([bare({ attachments: [chip] })])).toHaveLength(1);
  });

  test('a thought is enough to keep the bubble', () => {
    expect(buildRows([bare({ reasoning: 'je regarde' })])).toHaveLength(1);
    expect(buildRows([bare({ reasoningTokens: 12 })])).toHaveLength(1);
    expect(buildRows([bare({ error: 'not delivered' })])).toHaveLength(1);
    expect(buildRows([bare({ streaming: true })])).toHaveLength(1);
  });
});

describe('a send that never made it out', () => {
  const labelOf = (row: ChatRow): string => (row.kind === 'item' ? row.item.id : row.kind);
  const user = (id: string, extra: Partial<ChatItem> = {}): ChatItem =>
    ({ kind: 'text', id, role: 'user', text: id, attachments: [], streaming: false, ts: 1, ...extra }) as ChatItem;

  test('waits at the bottom, under everything the run wrote after it', () => {
    const rows = buildRows([
      user('lost', { queuedReason: 'undelivered', queuedSince: 5 }),
      tool('t1'),
      { kind: 'text', id: 'answer', role: 'agent', text: 'voila', attachments: [], streaming: false, ts: 9 } as ChatItem,
    ]);
    const pinned = pinnedSends(rows);
    expect(labelOf(pinned[pinned.length - 1]!)).toBe('lost');
  });

  test('a send the server holds keeps its place: it has a turn coming', () => {
    const rows = buildRows([
      user('parked', { queuedReason: 'injection', queuedSince: 5 }),
      { kind: 'text', id: 'answer', role: 'agent', text: 'voila', attachments: [], streaming: false, ts: 9 } as ChatItem,
    ]);
    expect(pinnedSends(rows)).toEqual(rows);
  });
});
