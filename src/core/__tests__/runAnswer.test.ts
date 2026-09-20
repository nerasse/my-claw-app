/**
 * What stays out of a fold, and what merely looks like it should.
 *
 * The rule is per message now (2026-09-17): a phase with words, or one carrying a picture, is
 * what the reader follows and never folds; the work between two messages is what the header
 * hides. A phase that only thought is work, and folds with the cards.
 *
 * The election this file used to guard is gone with its two bugs, both measured on a real thread:
 * matching the answer on the item's kind alone elected a thinking phase (it is a `text` item with
 * an empty `text`), and on a stopped run electing the *last* prose drew it under the calls that
 * followed it -- the reading order lied about where the run stopped. Messages hoisted by position
 * cannot be reordered, whatever the run's status, so both are impossible by construction.
 *
 * The other rule in this file is unchanged: an error is never folded away. A run that died after
 * its stream opened carries the message on the phase itself, inside the run, and a group closed
 * by default hid it.
 *
 * Both doors are checked here, because they are the same verdict reached twice: a page of history
 * rebuilt by `itemsOf`, and a run painted live then sealed by `endRun`.
 */
import { buildRows, isAgentMessage, isAgentProse, isHoisted, type ChatRow } from '../runRows';
import { chatStore, type ChatItem } from '../chat';
import type { HistoryEntry } from '../protocol';

const RUN = 'r1';

const runMeta = (status: 'running' | 'done' | 'error' = 'error') => ({
  id: RUN,
  status,
  startTs: 1_000,
  ...(status === 'running' ? {} : { endTs: 9_000 }),
});

const tool = (id: string, status: 'running' | 'done' | 'error' = 'error'): ChatItem =>
  ({
    kind: 'tool',
    id,
    name: 'bash',
    args: {},
    output: 'ok',
    ok: true,
    truncated: false,
    ts: 5,
    run: runMeta(status),
  }) as ChatItem;

/** A phase the model only thought in: the reasoning is there, the prose is not. */
const phase = (id: string, reasoning: string, text = '', status: 'running' | 'done' | 'error' = 'error'): ChatItem =>
  ({
    kind: 'text',
    id,
    role: 'agent',
    text,
    reasoning,
    attachments: [],
    streaming: false,
    ts: 5,
    run: runMeta(status),
  }) as ChatItem;

const prose = (id: string, text: string, status: 'running' | 'done' | 'error' = 'error'): ChatItem =>
  ({ kind: 'text', id, role: 'agent', text, attachments: [], streaming: false, ts: 5, run: runMeta(status) }) as ChatItem;

const userText = (id: string): ChatItem =>
  ({ kind: 'text', id, role: 'user', text: 'go', attachments: [], streaming: false, ts: 1 }) as ChatItem;

/** The bubble `abortStream` invents when a run dies before its first token: it belongs to no run. */
const errorBubble = (id: string): ChatItem =>
  ({
    kind: 'text',
    id,
    role: 'agent',
    text: '',
    error: 'stream error: api_error',
    attachments: [],
    streaming: false,
    ts: 9,
  }) as ChatItem;

/**
 * The other shape a failure takes: the run had opened its stream, so the message is patched onto
 * the phase that was being written -- and that phase belongs to the run.
 */
const failedPhase = (id: string, reasoning: string, text = ''): ChatItem =>
  ({ ...(phase(id, reasoning, text) as ChatItem & { error?: string }), error: 'stream error: api_error' }) as ChatItem;

/** A tool call that came back non-zero: the run's work, not a verdict on the run. */
const failedTool = (id: string): ChatItem =>
  ({ ...(tool(id) as ChatItem & { ok?: boolean }), ok: false, output: 'exit 1' }) as ChatItem;

/** One label per row, so an assertion reads as the sequence a reader would see. */
const labelOfRow = (row: ChatRow): string => {
  if (row.kind === 'group') return `g:${row.run.id}`;
  if (row.kind === 'folded') return `f:${row.run.id}`;
  if (row.kind === 'rule') return 'rule';
  return row.item.id;
};

const rowsOf = (items: ChatItem[]): string[] => buildRows(items).map(labelOfRow);

const groupItems = (items: ChatItem[]): string[] => {
  const group = buildRows(items).find(row => row.kind === 'group');
  return group?.kind === 'group' ? group.items.map(item => item.id) : [];
};

describe('the answer of a run is prose the agent wrote', () => {
  test('a run that died having only thought keeps everything folded, and the error follows it', () => {
    const items = [
      userText('u'),
      tool('t1'),
      phase('p1', 'weighing the options'),
      tool('t2'),
      phase('p2', 'one more idea before giving up'),
      errorBubble('err'),
    ];
    expect(rowsOf(items)).toEqual(['u', 'g:r1', 'err']);
    // The phase written before the last card stays where it was written.
    expect(groupItems(items)).toEqual(['t1', 'p1', 't2', 'p2']);
  });

  test('a run that died keeps its prose on screen, at the place it was written', () => {
    // The owner's rule (2026-09-17): a stopped or failed run keeps its messages too. The old
    // election hoisted nothing there, because hoisting the *last* prose would have drawn it under
    // the calls that followed it; by position, nothing can move.
    const items = [userText('u'), tool('t1'), phase('p1', 'how to say it'), prose('a', 'here is the answer')];
    expect(rowsOf(items)).toEqual(['u', 'g:r1', 'a']);
    expect(groupItems(items)).toEqual(['t1', 'p1']);
  });

  test('a thought produced after a message folds after it, and is not a message', () => {
    // An empty phase with reasoning is work: it draws a reasoning line, and it hides in the fold
    // like a card. The scan-back election used to have to walk past it; nothing walks now.
    const items = [
      userText('u'),
      tool('t1', 'done'),
      prose('a', 'here is the answer', 'done'),
      phase('p-after', 'second thoughts', '', 'done'),
    ];
    expect(rowsOf(items)).toEqual(['u', 'g:r1', 'a', 'g:r1']);
    expect(groupItems(items)).toEqual(['t1']);
  });

  test('text made only of whitespace is not prose', () => {
    const items = [userText('u'), tool('t1'), phase('p1', 'thinking', '  \n \t ')];
    expect(rowsOf(items)).toEqual(['u', 'g:r1']);
    expect(groupItems(items)).toEqual(['t1', 'p1']);
  });
});

describe('isAgentProse', () => {
  test('prose is agent text with something in it, and nothing else is', () => {
    expect(isAgentProse(prose('a', 'words'))).toBe(true);
    expect(isAgentProse(phase('p', 'thinking'))).toBe(false);
    expect(isAgentProse(phase('p', 'thinking', '   '))).toBe(false);
    expect(isAgentProse(tool('t1'))).toBe(false);
    // The owner's own turn is prose, but never the agent's: `isHoisted` takes it out first.
    expect(isAgentProse(userText('u'))).toBe(false);
  });
});

describe('isAgentMessage', () => {
  test('a picture with no words is a message; a thought or a card is work', () => {
    const shot = { id: 'att', type: 'image', filename: 'a.png' };
    expect(isAgentMessage(prose('a', 'words'))).toBe(true);
    expect(isAgentMessage({ ...(phase('p', 'thinking') as ChatItem & { attachments?: unknown[] }), attachments: [shot] } as ChatItem)).toBe(true);
    expect(isAgentMessage(phase('p', 'thinking'))).toBe(false);
    expect(isAgentMessage(tool('t1'))).toBe(false);
    expect(isAgentMessage(userText('u'))).toBe(false);
  });
});

/**
 * The same run, painted frame by frame and then sealed, must fold exactly as the page of it does.
 *
 * Nothing is grouped while a run answers, so the rows only take their shape at `endRun`: a rule
 * that held for a rebuilt page and not for a live run would show one order on the screen that
 * watched the work happen and another on the screen that reopened the thread.
 */
describe('live run and history page reach the same verdict', () => {
  const THREAD = 'thread-under-test';

  beforeEach(() => {
    chatStore.clearAll();
  });

  /** What the server sends while a run thinks, calls a tool, thinks again, then dies. */
  function paintLiveRun(): void {
    chatStore.startRun(THREAD, RUN);
    chatStore.startStream(THREAD, 'p1');
    chatStore.appendReasoning(THREAD, 'p1', 'weighing the options');
    chatStore.endStream(THREAD, 'p1');
    chatStore.startToolCall(THREAD, 't1', 'bash', { command: 'ls' });
    chatStore.addToolCall(THREAD, { id: 't1', name: 'bash', args: { command: 'ls' }, ok: true, output: 'ok', truncated: false });
    chatStore.startStream(THREAD, 'p2');
    chatStore.appendReasoning(THREAD, 'p2', 'one more idea before giving up');
    chatStore.endStream(THREAD, 'p2');
    // The run dies before its first token: the error has no bubble to land on, so one is invented,
    // and it belongs to no run.
    chatStore.abortStream(THREAD, 'err', 'stream error: api_error');
    chatStore.endRun(THREAD, 'error');
  }

  /** The same run as the server journalled it, replayed into a reopened thread. */
  function seedSamePageFromHistory(): void {
    const run = { id: RUN, status: 'error' as const, startTs: '2026-01-01T10:00:00.000Z', endTs: '2026-01-01T10:24:00.000Z' };
    const entries: HistoryEntry[] = [
      { id: 'p1', role: 'assistant', text: '', reasoning: 'weighing the options', ts: '2026-01-01T10:00:01.000Z', run },
      {
        id: 't1',
        role: 'tool',
        name: 'bash',
        args: { command: 'ls' },
        ok: true,
        output: 'ok',
        truncated: false,
        ts: '2026-01-01T10:00:02.000Z',
        run,
      },
      { id: 'p2', role: 'assistant', text: '', reasoning: 'one more idea before giving up', ts: '2026-01-01T10:00:03.000Z', run },
      { id: 'err', role: 'assistant', text: '', error: 'stream error: api_error', ts: '2026-01-01T10:24:00.000Z' },
    ];
    chatStore.seedHistory(THREAD, entries, false);
  }

  test('a live run that only thought folds the same way once sealed as it does when replayed', () => {
    paintLiveRun();
    const live = rowsOf(chatStore.getItems(THREAD));
    expect(live).toEqual(['g:r1', 'err']);
    expect(groupItems(chatStore.getItems(THREAD))).toEqual(['p1', 't1', 'p2']);

    chatStore.clearAll();
    seedSamePageFromHistory();
    expect(rowsOf(chatStore.getItems(THREAD))).toEqual(live);
    expect(groupItems(chatStore.getItems(THREAD))).toEqual(['p1', 't1', 'p2']);
  });

  test('nothing is grouped before the run is sealed: the rule only applies at the end', () => {
    chatStore.startRun(THREAD, RUN);
    chatStore.startStream(THREAD, 'p1');
    chatStore.appendReasoning(THREAD, 'p1', 'weighing the options');
    chatStore.endStream(THREAD, 'p1');
    chatStore.startToolCall(THREAD, 't1', 'bash', { command: 'ls' });
    chatStore.addToolCall(THREAD, { id: 't1', name: 'bash', args: { command: 'ls' }, ok: true, output: 'ok', truncated: false });
    // A run in flight draws its work flat, phase and card alike.
    expect(rowsOf(chatStore.getItems(THREAD))).toEqual(['p1', 't1']);

    chatStore.endRun(THREAD, 'error');
    expect(rowsOf(chatStore.getItems(THREAD))).toEqual(['g:r1']);
  });

  test('a live run that answered hoists its answer once sealed', () => {
    chatStore.startRun(THREAD, RUN);
    chatStore.startToolCall(THREAD, 't1', 'bash', { command: 'ls' });
    chatStore.addToolCall(THREAD, { id: 't1', name: 'bash', args: { command: 'ls' }, ok: true, output: 'ok', truncated: false });
    chatStore.startStream(THREAD, 'p1');
    chatStore.appendReasoning(THREAD, 'p1', 'how to say it');
    chatStore.endStream(THREAD, 'p1');
    chatStore.startStream(THREAD, 'a');
    chatStore.appendDelta(THREAD, 'a', 'here is the answer');
    chatStore.endStream(THREAD, 'a');
    chatStore.endRun(THREAD, 'done');

    expect(rowsOf(chatStore.getItems(THREAD))).toEqual(['g:r1', 'a']);
    expect(groupItems(chatStore.getItems(THREAD))).toEqual(['t1', 'p1']);
  });

  test('a run that died with its stream open shows the reason, live and replayed alike', () => {
    // The fifth shape: `chat.stream.start` had landed, so the error goes onto the phase itself,
    // which carries the run. Nothing is invented and nothing sits outside the run to save it.
    chatStore.startRun(THREAD, RUN);
    chatStore.startToolCall(THREAD, 't1', 'bash', { command: 'ls' });
    chatStore.addToolCall(THREAD, { id: 't1', name: 'bash', args: { command: 'ls' }, ok: true, output: 'ok', truncated: false });
    chatStore.startStream(THREAD, 'p-dead');
    chatStore.appendReasoning(THREAD, 'p-dead', 'what to try next');
    chatStore.abortStream(THREAD, 'p-dead', 'stream error: api_error');
    chatStore.endRun(THREAD, 'error');

    const live = chatStore.getItems(THREAD);
    const dead = live.find(item => item.id === 'p-dead');
    // The message is on the item itself: readable from the row, with nothing to unfold.
    expect(dead).toMatchObject({ kind: 'text', text: '', error: 'stream error: api_error' });
    expect(rowsOf(live)).toEqual(['g:r1', 'p-dead']);
    expect(groupItems(live)).toEqual(['t1']);

    chatStore.clearAll();
    const run = { id: RUN, status: 'error' as const, startTs: '2026-01-01T10:00:00.000Z', endTs: '2026-01-01T10:02:00.000Z' };
    chatStore.seedHistory(
      THREAD,
      [
        {
          id: 't1',
          role: 'tool',
          name: 'bash',
          args: { command: 'ls' },
          ok: true,
          output: 'ok',
          truncated: false,
          ts: '2026-01-01T10:00:01.000Z',
          run,
        },
        {
          id: 'p-dead',
          role: 'assistant',
          text: '',
          reasoning: 'what to try next',
          error: 'stream error: api_error',
          ts: '2026-01-01T10:00:02.000Z',
          run,
        },
      ] as HistoryEntry[],
      false,
    );
    expect(rowsOf(chatStore.getItems(THREAD))).toEqual(['g:r1', 'p-dead']);
    expect(groupItems(chatStore.getItems(THREAD))).toEqual(['t1']);
  });
});

describe('an error is never folded away', () => {
  test('a run that died after opening its stream shows the reason at the place it happened', () => {
    // `abortStream` patches the error onto the phase being written, and that phase carries the
    // run. Folded, the reader got a header saying "error" and had to open it to learn why.
    const items = [userText('u'), tool('t1'), failedPhase('p-dead', 'what to try next')];
    expect(rowsOf(items)).toEqual(['u', 'g:r1', 'p-dead']);
    expect(groupItems(items)).toEqual(['t1']);
  });

  test('an error in the middle of a run cuts the fold in two, in order', () => {
    const items = [userText('u'), tool('t1'), failedPhase('p-dead', 'retrying'), tool('t2'), prose('a', 'recovered')];
    // The row keeps its place: the work before the failure, the failure, then the work after it,
    // and the message after that.
    expect(rowsOf(items)).toEqual(['u', 'g:r1', 'p-dead', 'g:r1', 'a']);
    const groups = buildRows(items).filter(row => row.kind === 'group');
    expect(groups.map(group => (group.kind === 'group' ? group.items.map(i => i.id) : []))).toEqual([['t1'], ['t2']]);
  });

  test('a failed tool call is work and stays folded', () => {
    // A command that came back non-zero is what the run did, not why it stopped. `isHoisted`
    // stops on the kind before it ever looks at an outcome. The prose that follows it is a
    // message, and stays.
    const items = [userText('u'), tool('t1'), failedTool('t-bad'), prose('a', 'done anyway')];
    expect(rowsOf(items)).toEqual(['u', 'g:r1', 'a']);
    expect(groupItems(items)).toEqual(['t1', 't-bad']);
    expect(isHoisted(failedTool('t-bad'))).toBe(false);
  });

  test('the failure bubble that belongs to no run is unchanged: a row, where it landed', () => {
    // The server's own `failure` entry, and the bubble `abortStream` invents, carry no run at all.
    // `isHoisted` is only ever consulted for an item inside a terminal run, so nothing about them
    // moves -- they were rows before and they are rows now.
    const items = [userText('u'), tool('t1'), phase('p1', 'thinking'), errorBubble('err')];
    expect(rowsOf(items)).toEqual(['u', 'g:r1', 'err']);
    expect(groupItems(items)).toEqual(['t1', 'p1']);
  });

  test('isHoisted takes an error bubble out of the fold, and only a text one', () => {
    expect(isHoisted(failedPhase('p', 'thinking'))).toBe(true);
    // An answer that then failed is hoisted rather than elected. The reader sees the same order
    // either way while it is the last item, which is why only the predicate is asserted here:
    // a row-order case for it would be a test no mutation can fail.
    expect(isHoisted(failedPhase('p', 'thinking', 'with prose too'))).toBe(true);
    expect(isHoisted(phase('p', 'thinking'))).toBe(false);
    expect(isHoisted(prose('a', 'words'))).toBe(false);
    expect(isHoisted(failedTool('t'))).toBe(false);
  });
});

/**
 * The header reads its counts off the items it holds, so a phase that stays folded must not
 * inflate what the collapsed row claims -- the point of the fix is the order, and trading it for
 * a wrong count would be no better.
 */
describe('what the folded header counts', () => {
  test('a phase left in the group is not counted as a tool call', () => {
    const items = [userText('u'), tool('t1'), tool('t2'), phase('p1', 'thinking'), phase('p2', 'still thinking')];
    const group = buildRows(items).find(row => row.kind === 'group');
    const held = group?.kind === 'group' ? group.items : [];
    // What RunGroup draws its headline from: `kind === 'tool'` and the first tool's name.
    expect(held.filter(item => item.kind === 'tool')).toHaveLength(2);
    expect(held.find(item => item.kind === 'tool')?.name).toBe('bash');
    expect(held).toHaveLength(4);
  });
});
