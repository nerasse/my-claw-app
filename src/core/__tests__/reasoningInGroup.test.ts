/**
 * A reasoning never stands outside the group it produced.
 *
 * The owner, 2026-11-13: "quand on charge l'historique mid run ou en fin de run les reasoning sont
 * bien groupés mais pas en live ... en live tout se regroupe sauf le dernier reasoning", with a
 * screenshot of four blocks reading `55 steps · 28 shell · 7 web · 20 thoughts`, then a bare
 * `Reasoning` line, then the message.
 *
 * The thought belonged to the message, and the message belonged to the run -- but the run had been
 * lost on the way, so both drew outside the fold: a live bubble whose start frame was missed, or one
 * the server folded as no longer running, carries no run for its thought to inherit. Two rules keep
 * the shape out of the thread: a bare thought joins the run being written whatever it wears, and a
 * page re-keys the synthetic id the live frames had opened.
 */

import { buildRows, type ChatRow } from '../runRows';
import { chatStore } from '../chat';
import type { ChatItem, RunInfo } from '../chat';
import type { HistoryEntry } from '../protocol';

const T = 'reasoning-in-its-group';

beforeEach(() => chatStore.clearAll());

const run = (id: string, status: RunInfo['status'] = 'running'): RunInfo => ({ id, status, startTs: 1 });

const tool = (id: string, info: RunInfo): ChatItem =>
  ({ kind: 'tool', id, name: 'bash', args: { command: 'ls' }, output: '', ok: true, truncated: false, ts: 5, run: info }) as ChatItem;

const thought = (id: string, info?: RunInfo): ChatItem =>
  ({
    kind: 'text',
    id,
    role: 'agent',
    text: '',
    attachments: [],
    streaming: false,
    reasoning: 'weighing it',
    reasoningTokens: 900,
    ts: 6,
    ...(info ? { run: info } : {}),
  }) as ChatItem;

const message = (id: string, info?: RunInfo): ChatItem =>
  ({
    kind: 'text',
    id,
    role: 'agent',
    text: 'le verdict',
    attachments: [],
    streaming: false,
    ts: 7,
    ...(info ? { run: info } : {}),
  }) as ChatItem;

const groupsOf = (rows: ChatRow[]): ChatItem[][] =>
  rows
    .filter((row): row is Extract<ChatRow, { kind: 'group' }> => row.kind === 'group')
    .map(row => row.items);

const labelOfRow = (row: ChatRow): string => {
  if (row.kind === 'group') return `g:${row.run.id}[${row.items.map(item => item.id).join(',')}]`;
  if (row.kind === 'item') return `i:${row.item.id}`;
  if (row.kind === 'folded') return `f:${row.run.id}`;
  return row.kind;
};

describe('a thought without a run joins the run being written', () => {
  test('the work, its last thought, then the message: one fold, not a reasoning in between', () => {
    // The screenshot, item for item: a tool of the run, the split thought of the answer and the
    // answer itself -- the two last ones without the run the tool wears.
    const rows = buildRows([tool('c1', run('r1')), thought('a~reasoning'), message('a')]);
    expect(rows.map(labelOfRow)).toEqual(['g:r1[c1,a~reasoning]', 'i:a']);
    expect(groupsOf(rows)).toHaveLength(1);
  });

  test('a thought alone, with no run at all before it, stays where it is', () => {
    // Nothing is being written here and the thread knows no runs: a row, not a fold invented
    // around it.
    const rows = buildRows([message('a1'), thought('stray')]);
    expect(rows.map(labelOfRow)).toEqual(['i:a1', 'i:stray']);
  });

  test('the thought is taken whatever the run is doing', () => {
    // A thought that landed after its run was sealed is still the thinking of that work: a bare
    // `Reasoning` line under a header that had already counted it is the screenshot (owner,
    // 2026-11-15).
    const rows = buildRows([tool('c1', run('r1', 'done')), thought('stray')]);
    expect(rows.map(labelOfRow)).toEqual(['g:r1[c1,stray]']);
  });

  test('a thread with no runs at all keeps its plain rows', () => {
    // A session written before the server marked runs: there is nothing to inherit, and inventing
    // a fold around each thought would hide it behind a header saying what the row already said.
    const rows = buildRows([message('a1'), thought('stray')]);
    expect(rows.map(labelOfRow)).toEqual(['i:a1', 'i:stray']);
  });

  test('a thought nothing around it carries a run for still gets a group of its own', () => {
    const rows = buildRows([message('a1', run('r1', 'done')), thought('stray')]);
    expect(rows.map(labelOfRow)).toEqual(['i:a1', 'g:r1[stray]']);
  });

});

describe('a page re-keys the synthetic run it names', () => {
  test('a run the server folds as interrupted still names the live work', () => {
    // The start frame was missed: the app opened a synthetic run of its own.
    chatStore.addUserMessage(T, 'u1', 'go');
    chatStore.startStream(T, 'b1');
    chatStore.appendReasoning(T, 'b1', 'a thought');
    chatStore.endStream(T, 'b1');
    chatStore.startStream(T, 'b2');
    chatStore.appendReasoning(T, 'b2', 'LAST');
    chatStore.appendDelta(T, 'b2', 'the answer');
    expect(chatStore.getItems(T).find(item => item.id === 'b1')!.run?.id).toMatch(/^live-/);

    // The page names the real run, but folds it as no longer running. It is still being written.
    const meta = (status: 'interrupted') => ({ id: 'srv-run', status, startTs: '2026-01-01T00:00:00.000Z' });
    const entries: HistoryEntry[] = [
      { role: 'user', id: 'u1', ts: '2026-01-01T00:00:00.000Z', text: 'go', run: meta('interrupted') },
      { role: 'assistant', id: 'b1', ts: '2026-01-01T00:00:01.000Z', text: '', reasoning: 'a thought', run: meta('interrupted') },
    ] as HistoryEntry[];
    chatStore.seedHistory(T, entries, true);

    expect(buildRows(chatStore.getItems(T)).map(labelOfRow)).toEqual(['i:u1', 'g:srv-run[b1,b2~reasoning]', 'i:b2']);
  });
});
