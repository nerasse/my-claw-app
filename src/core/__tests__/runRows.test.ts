import { buildRows, foldKeyOf, isAgentMessage, isHoisted, pinnedSends, type ChatRow } from '../runRows';
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
  if (row.kind === 'group') return `g:${row.run.id}${row.foot ? '+foot' : ''}`;
  if (row.kind === 'folded') return `f:${row.run.id}:${row.summaries.reduce((n, s) => n + s.itemCount, 0)}${row.foot ? '+foot' : ''}`;
  if (row.kind === 'rule') return 'rule';
  if (row.kind === 'foot') return `foot:${row.run.id}`;
  return `${row.item.id}${row.foot ? '+foot' : ''}`;
};

describe('buildRows', () => {
  test('every message stays, and the work folds between two of them', () => {
    // The owner's rule (2026-09-17): a message is what the reader follows, and what lies between
    // two of them is what the header hides. It used to be the last prose alone that survived.
    const rows = buildRows([
      userText('u'),
      tool('t1', 'r1'),
      agentText('a1', 'first point', 'r1'),
      tool('t2', 'r1'),
      agentText('a2', 'answer', 'r1'),
    ]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'a1', 'g:r1', 'a2+foot']);
    const groups = rows.filter(r => r.kind === 'group') as Array<{ items: ChatItem[] }>;
    expect(groups.map(g => g.items.map(i => i.id))).toEqual([['t1'], ['t2']]);
  });

  test('a message the reader can see never lands inside a fold', () => {
    // The invariant, on a longer run: every message is a row, wherever it was written.
    const items = [
      userText('u'),
      tool('t1', 'r1'),
      agentText('a1', 'point one', 'r1'),
      tool('t2', 'r1'),
      agentText('a2', 'point two', 'r1'),
      tool('t3', 'r1'),
      agentText('a3', 'voila', 'r1'),
    ];
    const rows = buildRows(items);
    const held = rows.flatMap(row => (row.kind === 'group' ? row.items : []));
    expect(held.some(item => item.id.startsWith('a'))).toBe(false);
    expect(rows.filter(row => row.kind === 'item' && row.item.kind === 'text' && row.item.role === 'agent')).toHaveLength(3);
  });

  test('a sub-agent call is a door of its own, never a line of a fold', () => {
    const spawn = { ...tool('s1', 'r1'), name: 'spawn', args: { name: 'reviewer' } } as ChatItem;
    const rows = buildRows([userText('u'), tool('t1', 'r1'), spawn, tool('t2', 'r1')]);
    // Two folds with the door between them: it is the one thing the reader waits on, and inside
    // a spine of thirteen rows it would be the least visible of them.
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 's1', 'g:r1+foot']);
    expect(rows.filter(r => r.kind === 'item' && r.item.id === 's1')).toHaveLength(1);
  });

  test('a running run is grouped too, and the fold does not wait for the run to end', () => {
    const items = [
      userText('u1'),
      tool('t1', 'r1'),
      agentText('a1', 'prev answer', 'r1'),
      userText('u2'),
      tool('t2', 'r2'),
      agentText('a2', 'working…', 'r2'),
    ];
    const rows = buildRows(items.map(i => (i.id === 't2' || i.id === 'a2' ? { ...i, run: run('r2', 'running') } : i)));
    // Two groups: the settled run, and the one in flight. The second used to be plain cards that
    // collapsed into a fold the instant the run ended, which changed the whole block's shape under
    // the reader's eyes (owner, 2026-11-07).
    expect(rows.filter(r => r.kind === 'group')).toHaveLength(2);
    const live = rows.filter(r => r.kind === 'group' && r.run.status === 'running');
    expect(live).toHaveLength(1);
    // The streaming answer is still its own bubble: it is what the owner follows.
    expect(rows.some(r => r.kind === 'item' && r.item.id === 'a2')).toBe(true);
  });

  test('only the last segment of a running run is live: the ones a message cut are over', () => {
    const items = [
      userText('u1'),
      tool('t1', 'r1'),
      agentText('a1', 'first message', 'r1'),
      tool('t2', 'r1'),
      agentText('a2', 'second message', 'r1'),
      tool('t3', 'r1'),
    ].map(i => ({ ...i, run: run('r1', 'running') } as ChatItem));
    const rows = buildRows(items);
    // Three groups, one per burst between the messages it wrote. Every one of them used to be told
    // "the run is still going", so three finished bursts wore a spinner and the run's elapsed time
    // (owner, 2026-11-08).
    const groups = rows.filter(row => row.kind === 'group') as Array<Extract<ChatRow, { kind: 'group' }>>;
    expect(groups).toHaveLength(3);
    expect(groups.map(group => group.live === true)).toEqual([false, false, true]);
  });

  /**
   * One run writing, two run ids: a card the app opened live wears the id it minted before the
   * server's page named it. Keyed per run id, both bursts were marked live -- two spinners and the
   * same clock on screen at once, which is the screenshot the owner sent (2026-11-08).
   */
  test('one run id per burst still yields a single live segment', () => {
    const items = [
      userText('u1'),
      { ...tool('t1'), run: run('live-3', 'running') } as ChatItem,
      agentText('a1', 'un message', undefined),
      { ...tool('t2'), run: run('live-3', 'running') } as ChatItem,
      { ...tool('t3'), run: run('84fd43b5', 'running') } as ChatItem,
    ];
    const groups = buildRows(items).filter(row => row.kind === 'group') as Array<Extract<ChatRow, { kind: 'group' }>>;
    // Three bursts, one live: the trailing one, whatever ids the items happen to carry.
    expect(groups.map(group => group.live === true)).toEqual([false, false, true]);
  });

  test('a settled run has no live segment at all', () => {
    const rows = buildRows([userText('u'), tool('t1', 'r1'), agentText('a', 'answer', 'r1')]);
    expect(rows.filter(row => row.kind === 'group' && row.live === true)).toHaveLength(0);
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
   * re-appended after the answer by the store. The election had to defend against it -- "the last
   * item" read the card as the answer. Messages hoisted by position need no defence: the card
   * folds into the burst it landed in, after the message, and the order is the one written.
   */
  test('a stray card that lands after a message folds after it, in order', () => {
    const rows = buildRows([userText('u'), tool('t1', 'r1'), agentText('a', 'answer', 'r1'), tool('t-late', 'r1')]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'a', 'g:r1+foot']);
    const groups = rows.filter(r => r.kind === 'group') as Array<{ items: ChatItem[] }>;
    expect(groups.map(g => g.items.map(i => i.id))).toEqual([['t1'], ['t-late']]);
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
    expect(rows.map(labelOfRow)).toEqual(['u1', 'g:r1', 'a1+foot', 'u2', 'g:r2', 'a2+foot']);
  });

  /**
   * The owner's rule (2026-09-17): a stopped or failed run keeps its messages too, each at the
   * place it was written. The old rule elected nothing there because hoisting the *last* prose
   * would draw it under the calls that followed it -- the reading order lied about where the run
   * stopped. Messages hoisted by position cannot lie, whatever the run's status.
   */
  test('a stopped run keeps its messages, in the order they were written', () => {
    const rows = buildRows(
      [
        userText('u'),
        tool('t1', 'r1'),
        agentText('a', 'half an answer, written before the last call', 'r1'),
        tool('t2', 'r1'),
      ].map(i => (i.id === 'u' ? i : { ...i, run: run('r1', 'aborted', 100, 200) })),
    );
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'a', 'g:r1+foot']);
    const groups = rows.filter(row => row.kind === 'group') as Array<{ items: ChatItem[] }>;
    expect(groups.map(g => g.items.map(i => i.id))).toEqual([['t1'], ['t2']]);
  });

  test('a run that died on an error keeps them too', () => {
    const rows = buildRows(
      [
        userText('u'),
        tool('t1', 'r1'),
        agentText('a', 'half an answer', 'r1'),
        tool('t2', 'r1'),
      ].map(i => (i.id === 'u' ? i : { ...i, run: run('r1', 'error', 100, 200) })),
    );
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'a', 'g:r1+foot']);
  });

  test('a hoisted bubble still cuts a stopped run, and the message stays on its side of it', () => {
    const rows = buildRows(
      [
        userText('u'),
        tool('t1', 'r1'),
        userText('steer'),
        tool('t2', 'r1'),
        agentText('a', 'what it had written', 'r1'),
      ].map(i => (i.id === 'u' || i.id === 'steer' ? i : { ...i, run: run('r1', 'aborted', 100, 200) })),
    );
    // The injected turn keeps its place and splits the fold around it; the message stays where it
    // was written, on the side it was written.
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'steer', 'g:r1', 'a+foot']);
    const groups = rows.filter(row => row.kind === 'group') as Array<{ items: ChatItem[] }>;
    expect(groups.map(group => group.items.map(i => i.id))).toEqual([['t1'], ['t2']]);
  });

  test('a thought after the last message folds after it, and is not a message', () => {
    // The counterpart: an empty phase with reasoning is work. Nothing is elected, nothing moves.
    const rows = buildRows([
      userText('u'),
      tool('t1', 'r1'),
      agentText('a', 'here is the answer', 'r1'),
      agentText('p-after', '', 'r1', { reasoning: 'second thoughts' }),
    ]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'a', 'g:r1+foot']);
    const groups = rows.filter(row => row.kind === 'group') as Array<{ items: ChatItem[] }>;
    expect(groups.map(g => g.items.map(i => i.id))).toEqual([['t1'], ['p-after']]);
  });

  test("the empreinte lands on the run's end, and only there", () => {
    // It used to mark the last fold, where the run's span read as the fold's own time. The run
    // ends on its answer here, so the answer is what it signs.
    const rows = buildRows([
      userText('u'),
      tool('t1', 'r1'),
      agentText('a1', 'point one', 'r1'),
      tool('t2', 'r1'),
      agentText('a2', 'voila', 'r1'),
    ]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'a1', 'g:r1', 'a2+foot']);
    const groups = rows.filter(row => row.kind === 'group');
    expect(groups.every(group => group.kind === 'group' && group.foot === undefined)).toBe(true);
  });

  test('a run whose last message has no work after it signs that message', () => {
    const rows = buildRows([userText('u'), tool('t1', 'r1'), agentText('a', 'voila', 'r1')]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'a+foot']);
  });

  test('a picture with no words is a message too', () => {
    // The browser tool's captures ride the end marker and land on a phase that can carry no
    // prose. Folding that phase away would hide the pictures the run was asked for.
    const shot = agentText('m1', '', 'r1', {
      attachments: [{ id: 'att-1', type: 'image', filename: 'a.png' }] as never,
    });
    const rows = buildRows([userText('u'), tool('t1', 'r1'), shot, tool('t2', 'r1'), agentText('a', 'voila', 'r1')]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'm1', 'g:r1', 'a+foot']);
  });

  test('a fold keeps its key when its items arrive', () => {
    // The swap the key exists for: the server's row is `run-<first entry>`, and the items it
    // hands back carry that string in `foldOf`, so the group that replaces the row reads the
    // same fold -- and the open state the reader set survives (docs/run-hydration.md).
    const rows = buildRows([userText('u'), folded('a', 'r1')]);
    const foldedRow = rows[1];
    expect(foldedRow?.kind === 'folded' ? foldKeyOf(foldedRow) : '').toBe('run-a');

    const hydrated = buildRows([userText('u'), { ...tool('t1', 'r1'), foldOf: 'run-a' } as ChatItem]);
    const groupRow = hydrated[1];
    expect(groupRow?.kind === 'group' ? foldKeyOf(groupRow) : '').toBe('run-a');
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

describe('isAgentMessage', () => {
  test('prose or a picture is a message; a thought or a card is work', () => {
    expect(isAgentMessage(agentText('a', 'words'))).toBe(true);
    expect(
      isAgentMessage(
        agentText('m', '', undefined, { attachments: [{ id: 'att', type: 'image', filename: 'a.png' }] as never }),
      ),
    ).toBe(true);
    // The phase the model only thought in: reasoning yes, words no.
    expect(isAgentMessage(agentText('p', '', undefined, { reasoning: 'thinking' } as never))).toBe(false);
    expect(isAgentMessage(tool('t1'))).toBe(false);
    // The owner's turn is a message to the thread, but never the agent's own: `isHoisted` takes
    // it out first, and this predicate must not double as that door.
    expect(isAgentMessage(userText('u'))).toBe(false);
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
    expect(rows.map(labelOfRow)).toEqual(['u', 'f:r1:12', 'ans+foot']);
  });

  test('two adjacent rows of the same run merge into one group', () => {
    // A run cut by a page boundary folds once per page. The reader must see one group, not the
    // same run twice with its work split at an arbitrary count.
    const rows = buildRows([userText('u'), folded('older', 'r1', 40), folded('newer', 'r1', 12)]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'f:r1:52+foot']);
    const group = rows[1];
    expect(group?.kind === 'folded' ? group.summaries.length : 0).toBe(2);
  });

  test('rows of different runs stay apart', () => {
    const rows = buildRows([folded('a', 'r1'), folded('b', 'r2')]);
    expect(rows.map(labelOfRow)).toEqual(['f:r1:12+foot', 'f:r2:12+foot']);
  });

  test('a bubble between two rows of one run keeps them apart', () => {
    // The owner injected a turn mid-run: it splits the group, and merging across it would put
    // work from both sides of the question under one header.
    const rows = buildRows([folded('a', 'r1'), userText('steer'), folded('b', 'r1')]);
    expect(rows.map(labelOfRow)).toEqual(['f:r1:12', 'steer', 'f:r1:12+foot']);
  });

  test('a folded row closes a group of held items', () => {
    // Half the run hydrated, half still folded: the two must not merge into one row, and the
    // held half must not swallow the header.
    const rows = buildRows([tool('t1', 'r1'), tool('t2', 'r1'), folded('rest', 'r1')]);
    expect(rows.map(labelOfRow)).toEqual(['g:r1', 'f:r1:12+foot']);
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

/**
 * Where a finished run signs its work -- docs/run-grouping.md.
 *
 * The span and the status used to ride the title of the run's last fold, where "2 h 33 min" read
 * as that fold's own time ("on a l'impression que c'est le temps du dernier regroupement",
 * 2026-09-22). The empreinte is one faint line at the run's very end: under its last message,
 * under its last fold when it stopped mid-work, or on its own row when neither is there.
 */
describe('markRunFeet', () => {
  test("the empreinte signs the run's last message, not its folds", () => {
    const rows = buildRows([userText('u'), tool('t1', 'r1'), tool('t2', 'r1'), agentText('a1', 'answer', 'r1')]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'a1+foot']);
    const last = rows[rows.length - 1];
    expect(last.kind === 'item' ? last.foot?.id : undefined).toBe('r1');
  });

  test('a run stopped mid-work signs its last fold instead', () => {
    // The answer came, then the run went on and died in its work: the run ends on the fold, and
    // that is where the signature stands -- under it, never inside its title.
    const rows = buildRows([userText('u'), tool('t1', 'r1'), agentText('a1', 'answer', 'r1'), tool('t2', 'r1')]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'a1', 'g:r1+foot']);
  });

  test("a run whose tail is not a message gets its own row", () => {
    // A command output or a notice draws apart from every message: nothing to sign, so the
    // empreinte stands after it as a row of its own.
    const rows = buildRows([
      userText('u'),
      tool('t1', 'r1'),
      agentText('c1', '$ done', 'r1', { command: true }),
    ]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'g:r1', 'c1', 'foot:r1']);
  });

  test('a run that drew nothing at all still stands where its work would have', () => {
    // The only trace of such a run: an empty phase the thread has nothing to show for. Its
    // empreinte is the run's existence, and it goes where the work would have stood.
    const invisible = {
      kind: 'text',
      id: 'x',
      role: 'agent',
      text: ' ',
      attachments: [],
      streaming: false,
      ts: 2,
      run: run('r1'),
    } as ChatItem;
    const rows = buildRows([userText('u'), invisible, agentText('a1', 'later', 'r2')]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'foot:r1', 'a1+foot']);
  });

  test('every run signs its own end, and one in flight signs nothing', () => {
    const rows = buildRows([
      userText('u1'),
      tool('t1', 'r1'),
      agentText('a1', 'first', 'r1'),
      userText('u2'),
      tool('t2', 'r2'),
    ]);
    expect(rows.map(labelOfRow)).toEqual(['u1', 'g:r1', 'a1+foot', 'u2', 'g:r2+foot']);

    const live = buildRows([userText('u'), { ...tool('t1', 'live'), run: run('live', 'running') } as ChatItem]);
    // A run still going is grouped (so the reader watches one column from the first call), and it
    // signs nothing: no span, no status, until it ends.
    expect(live.map(labelOfRow)).toEqual(['u', 'g:live']);
  });

  test('a folded run the work of which never travelled signs its summary row', () => {
    const rows = buildRows([userText('u'), folded('w1', 'r1')]);
    expect(rows.map(labelOfRow)).toEqual(['u', 'f:r1:12+foot']);
  });
});
