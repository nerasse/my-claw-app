/**
 * A tool card left in flight when its run ended.
 *
 * Measured on the owner's phone: a `bash` card spinning at "220m 25s" under an error bubble
 * three and a half hours old, while the server had settled that very call in 25 s. The run died
 * on an API error with the card in flight, no result frame ever landed, and the card counted from
 * its own start against the current clock for as long as the screen stayed open.
 *
 * The card has to reach a terminal state at the run's end, with a frozen duration -- and the
 * server's settled card has to win over it the moment the history brings one back.
 */
import { chatStore } from '../chat';
import type { ChatItem, ToolItem } from '../chat';
import type { HistoryEntry } from '../protocol';

const THREAD = 'thread-under-test';

const toolOf = (items: ChatItem[], id: string): ToolItem => {
  const item = items.find(entry => entry.id === id);
  if (!item || item.kind !== 'tool') throw new Error(`no tool card ${id}`);
  return item;
};

const card = (id: string): ToolItem => toolOf(chatStore.getItems(THREAD), id);

beforeEach(() => {
  chatStore.clearAll();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a card in flight when the run ends', () => {
  test('a run that dies on an API error settles its card instead of leaving it spinning', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T13:25:00.000Z'));
    chatStore.startRun(THREAD, 'run-1');
    chatStore.startToolCall(THREAD, 't-1', 'bash', { command: 'make' });
    expect(card('t-1').running).toBe(true);

    jest.setSystemTime(new Date('2026-01-01T13:25:25.000Z'));
    // What the server sends when the provider refuses mid-run: the stream aborts, the run ends.
    chatStore.abortStream(THREAD, 's-dead', 'API Error: 529 Overloaded');
    chatStore.endRun(THREAD, 'error');

    const settled = card('t-1');
    expect(settled.running).toBe(false);
    expect(settled.interrupted).toBe(true);
    expect(settled.durationMs).toBe(25_000);

    // Three hours later, nothing has moved: a terminal card never measures against the clock.
    jest.setSystemTime(new Date('2026-01-01T16:58:00.000Z'));
    expect(card('t-1').durationMs).toBe(25_000);
  });

  test('a stop settles every card still in flight, and leaves the ones already settled alone', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
    chatStore.startRun(THREAD, 'run-1');
    chatStore.startToolCall(THREAD, 't-done', 'read', { path: '/tmp/a' });
    chatStore.addToolCall(THREAD, {
      id: 't-done',
      name: 'read',
      args: { path: '/tmp/a' },
      ok: true,
      output: 'body',
      truncated: false,
      durationMs: 12,
    });
    chatStore.startToolCall(THREAD, 't-live-1', 'bash', { command: 'sleep 300' });
    chatStore.startToolCall(THREAD, 't-live-2', 'web_search', { query: 'anything' });

    jest.setSystemTime(new Date('2026-01-01T10:00:08.000Z'));
    chatStore.endRun(THREAD, 'aborted');

    expect(card('t-live-1')).toMatchObject({ running: false, interrupted: true, durationMs: 8_000 });
    expect(card('t-live-2')).toMatchObject({ running: false, interrupted: true, durationMs: 8_000 });
    // The call that reported keeps the server's own duration and says nothing about being cut off.
    expect(card('t-done')).toMatchObject({ running: false, ok: true, output: 'body', durationMs: 12 });
    expect(card('t-done').interrupted).toBeFalsy();
  });

  test('only the cards of the run that ended are settled', () => {
    chatStore.startRun(THREAD, 'run-1');
    chatStore.startToolCall(THREAD, 't-1', 'bash', { command: 'first' });
    chatStore.endRun(THREAD, 'done');
    chatStore.startRun(THREAD, 'run-2');
    chatStore.startToolCall(THREAD, 't-2', 'bash', { command: 'second' });

    expect(card('t-1').interrupted).toBe(true);
    // The second run is still answering: its card is live and must keep its spinner.
    expect(card('t-2')).toMatchObject({ running: true });
    expect(card('t-2').interrupted).toBeUndefined();
  });

  test('a page the server serves with no active run settles the card its lost end left behind', () => {
    // The end frame never arrived (the socket was down when the run died). The next page says
    // there is no run in flight, which closes it -- and the card with it.
    chatStore.startRun(THREAD, 'run-1');
    chatStore.startToolCall(THREAD, 't-1', 'bash', { command: 'make' });
    chatStore.handleSyncResult(
      THREAD,
      [
        {
          id: 'e-1',
          role: 'assistant',
          text: 'done',
          ts: '2026-01-01T13:26:00.000Z',
          run: { id: 'run-1', status: 'done', startTs: '2026-01-01T13:25:00.000Z', endTs: '2026-01-01T13:26:00.000Z' },
        } as HistoryEntry,
      ],
      'e-1',
      'e-1',
      false,
    );
    expect(card('t-1')).toMatchObject({ running: false, interrupted: true });
  });

  test('a session list that no longer holds the thread settles its card too', () => {
    chatStore.startRun(THREAD, 'run-1');
    chatStore.startToolCall(THREAD, 't-1', 'bash', { command: 'make' });
    chatStore.seedRuns([]);
    expect(card('t-1')).toMatchObject({ running: false, interrupted: true });
  });

  test('a run still listed as active leaves its cards alone: a dropped socket is not a dead run', () => {
    // What a reconnect does: `session.list.result` first, then the sync. Both say the run is
    // still going, so the card keeps its spinner and its live counter.
    chatStore.startRun(THREAD, 'run-1');
    chatStore.startToolCall(THREAD, 't-1', 'bash', { command: 'sleep 600' });
    chatStore.seedRuns([THREAD]);
    chatStore.handleSyncResult(
      THREAD,
      [
        {
          id: 'e-1',
          role: 'user',
          text: 'go',
          ts: '2026-01-01T13:25:00.000Z',
          run: { id: 'run-1', status: 'running', startTs: '2026-01-01T13:25:00.000Z' },
        } as HistoryEntry,
      ],
      'e-1',
      'e-1',
      true,
    );

    expect(card('t-1')).toMatchObject({ running: true });
    expect(card('t-1').interrupted).toBeUndefined();
    expect(chatStore.hasActiveRun(THREAD)).toBe(true);
  });

  test('a sub-agent card is left to its own lifecycle', () => {
    // `spawn`/`send`/`delegate_browser_task` are drawn by SubAgentCard, which has no counter and
    // whose state machine has guards of its own against delayed frames.
    chatStore.startRun(THREAD, 'run-1');
    chatStore.startToolCall(THREAD, 'card-1', 'spawn', { name: 'researcher', mode: 'run' });
    chatStore.endRun(THREAD, 'error');
    expect(card('card-1')).toMatchObject({ running: true });
    expect(card('card-1').interrupted).toBeUndefined();
  });
});

describe('the server settled card wins over the interrupted one', () => {
  /** The call as the server journalled it: settled, with the duration it really took. */
  const settledEntry: HistoryEntry = {
    role: 'tool',
    ts: '2026-01-01T13:25:00.000Z',
    id: 't-1',
    name: 'bash',
    args: { command: 'make' },
    durationMs: 25_300,
    ok: true,
    output: 'built',
    truncated: false,
  };

  function interruptedCard(): void {
    chatStore.startRun(THREAD, 'run-1');
    chatStore.startToolCall(THREAD, 't-1', 'bash', { command: 'make' });
    chatStore.endRun(THREAD, 'error');
    expect(card('t-1').interrupted).toBe(true);
  }

  test('a late result frame replaces the mark, the output and the duration', () => {
    interruptedCard();
    chatStore.addToolCall(THREAD, {
      id: 't-1',
      name: 'bash',
      args: { command: 'make' },
      ok: true,
      output: 'built',
      truncated: false,
      durationMs: 25_300,
    });
    expect(card('t-1')).toMatchObject({ running: false, interrupted: false, ok: true, output: 'built', durationMs: 25_300 });
  });

  /**
   * Both refresh doors in one case, because they answer one question and needed no new guard:
   * the entry the server serves carries the card's id, and matching on it is what already makes
   * the page authoritative. This is the check, not the mechanism.
   */
  test('a refresh draws the settled card, through the delta door and through a fresh page', () => {
    interruptedCard();
    // Door one: a sync delta, which patches the held card where it sits.
    chatStore.handleSyncResult(THREAD, [settledEntry], 't-1', 't-1', false);
    expect(card('t-1')).toMatchObject({ ok: true, output: 'built', durationMs: 25_300 });
    expect(card('t-1').interrupted).toBeUndefined();
    expect(card('t-1').running).toBeUndefined();

    // Door two: the thread reopened, which replaces it outright.
    chatStore.clearThread(THREAD);
    interruptedCard();
    chatStore.seedHistory(
      THREAD,
      [{ id: 'e-0', role: 'user', text: 'build it', ts: '2026-01-01T13:24:00.000Z' }, settledEntry],
      false,
    );
    const items = chatStore.getItems(THREAD);
    // One card, and it is the server's: no ghost re-appended after the page.
    expect(items.filter(item => item.kind === 'tool')).toHaveLength(1);
    expect(toolOf(items, 't-1')).toMatchObject({ ok: true, output: 'built', durationMs: 25_300 });
    expect(toolOf(items, 't-1').interrupted).toBeUndefined();
  });
});
