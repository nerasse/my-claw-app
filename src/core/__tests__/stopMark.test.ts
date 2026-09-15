/**
 * One stop per cycle, held on this side too.
 *
 * The server answers nothing to a stop requested while the abort of the same cycle is already
 * travelling ("stopping"): a second request from this device can only cost a round-trip, and the
 * "Running /stop…" placeholder the server draws for a typed command would never be resolved by
 * anything. The mark is armed when a stop is sent -- against a run, or against the compaction a
 * stop can also abort -- and lifted by every witness that the cycle ended, the run end first of
 * all (a stopped run ends `aborted`, whatever the motive).
 */
const mockSend = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.mock('../connection', () => ({ connection: { send: (frame: string) => mockSend(frame) } }));

import { chatStore } from '../chat';
import { questionStore } from '../questionStore';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import type { HistoryEntry, QuestionAskFrame, ServerFrame } from '../protocol';

const handlers = {
  activeThreadId: () => null,
  subagentParent: () => null,
} as unknown as ServerFrameHandlers;
const THREAD = 't1';

function route(frame: ServerFrame): void {
  routeServerFrame(frame, handlers);
}

const oneEntry = (): HistoryEntry[] => [
  { id: 'u-1', role: 'user', text: 'go', ts: '2026-01-01T10:00:00.000Z' },
];

const ask = (): QuestionAskFrame => ({
  type: 'question.ask',
  id: 'q1',
  threadId: THREAD,
  questions: [{ header: 'h', question: 'q', options: [{ label: 'a' }] }],
  ts: '2026-01-01T10:00:00.000Z',
});

beforeEach(() => {
  mockSend.mockClear();
  chatStore.clearAll();
  questionStore.clear();
});

describe('the stop mark', () => {
  test('armed by a stop sent against a run, refused while it is in flight, lifted by the run end', () => {
    chatStore.startRun(THREAD, 'r1');
    expect(chatStore.claimStop(THREAD)).toBe(true);
    expect(chatStore.isStopping(THREAD)).toBe(true);
    // A second request while the abort travels: refused, so nothing is sent.
    expect(chatStore.claimStop(THREAD)).toBe(false);
    // A run a stop cut ends `aborted`, and that end is what lifts the mark.
    expect(chatStore.endRun(THREAD, 'aborted')).toBe(true);
    expect(chatStore.isStopping(THREAD)).toBe(false);
    // The next cycle's stop is free to go again.
    chatStore.startRun(THREAD, 'r2');
    expect(chatStore.claimStop(THREAD)).toBe(true);
  });

  test('the chat.run.end frame itself lifts it, whatever the motive', () => {
    chatStore.startRun(THREAD, 'r1');
    chatStore.claimStop(THREAD);
    route({ type: 'chat.run.end', threadId: THREAD, reason: 'aborted' });
    expect(chatStore.isStopping(THREAD)).toBe(false);
  });

  test('nothing to stop: the request may go, but no mark is armed', () => {
    // "Nothing running." is answered at once and no run end will ever come -- a mark set here
    // would silence the next stop, the one that matters.
    expect(chatStore.claimStop(THREAD)).toBe(true);
    expect(chatStore.isStopping(THREAD)).toBe(false);
  });

  test('the end of a compaction lifts it: a compaction is a cycle a stop can abort', () => {
    chatStore.setCompacting(THREAD, Date.now());
    expect(chatStore.claimStop(THREAD)).toBe(true);
    expect(chatStore.isStopping(THREAD)).toBe(true);
    chatStore.setCompacting(THREAD, undefined);
    expect(chatStore.isStopping(THREAD)).toBe(false);
  });

  test('a session list that no longer holds the run lifts it, lost end frame included', () => {
    chatStore.startRun(THREAD, 'r1');
    chatStore.claimStop(THREAD);
    chatStore.seedRuns([]);
    expect(chatStore.isStopping(THREAD)).toBe(false);
  });

  test('a page that says no run is active lifts it', () => {
    chatStore.startRun(THREAD, 'r1');
    chatStore.claimStop(THREAD);
    chatStore.seedHistory(THREAD, oneEntry(), false);
    expect(chatStore.isStopping(THREAD)).toBe(false);
  });
});

describe('a stop aimed at a waiting question', () => {
  test('the request may go, but no mark is armed: the next press is the real stop', () => {
    // The server reads a stop while a question is pending as "cancel the question" -- the run
    // carries on, and the second press is what aborts it. A mark armed here would swallow that
    // second press for as long as the run kept working.
    chatStore.startRun(THREAD, 'r1');
    questionStore.ask(ask());

    expect(chatStore.claimStop(THREAD)).toBe(true);
    expect(chatStore.isStopping(THREAD)).toBe(false);

    // The question is gone (canceled by that stop): a press now arms, and sends.
    questionStore.resolve('q1');
    expect(chatStore.claimStop(THREAD)).toBe(true);
    expect(chatStore.isStopping(THREAD)).toBe(true);
  });

  test('the cancellation of the question lifts the mark of a stop that raced ahead of the ask', () => {
    // The race: the app sent its stop before the ask reached it, so it armed a mark for a stop
    // the server answered by canceling the question instead of aborting. The resolve is what
    // closes that gap.
    chatStore.startRun(THREAD, 'r1');
    chatStore.claimStop(THREAD);
    expect(chatStore.isStopping(THREAD)).toBe(true);

    route({ type: 'question.resolved', id: 'q1', threadId: THREAD, reason: 'canceled' });
    expect(chatStore.isStopping(THREAD)).toBe(false);
  });

  test('an answered question leaves the mark alone: an abort can still be in flight', () => {
    chatStore.startRun(THREAD, 'r1');
    chatStore.claimStop(THREAD);
    route({ type: 'question.resolved', id: 'q1', threadId: THREAD, reason: 'answered' });
    expect(chatStore.isStopping(THREAD)).toBe(true);
  });
});

describe('a command bubble a stop left in flight', () => {
  test('the "Running /stop…" of a crossed stop is resolved by the end of the run', () => {
    // The cross case: the web stopped the thread a moment before, this device sent its own
    // `/stop` as a message anyway, and no frame at all is coming for it -- the server answers
    // nothing while the abort travels. Left alone, the placeholder spins for good.
    chatStore.startRun(THREAD, 'r1');
    chatStore.addUserMessage(THREAD, 'send-1', '/stop', []);
    route({ type: 'chat.command.pending', threadId: THREAD, replyToId: 'send-1', text: 'Running /stop…' });
    expect(chatStore.getItems(THREAD).find(item => item.id === 'cmd-send-1')).toMatchObject({
      kind: 'text',
      command: true,
      streaming: true,
    });

    route({ type: 'chat.run.end', threadId: THREAD, reason: 'aborted' });

    const items = chatStore.getItems(THREAD);
    expect(items.find(item => item.id === 'cmd-send-1')).toBeUndefined();
    // No text was invented for it: the owner's own send is all that stays.
    expect(items.filter(item => item.kind === 'text' && item.role === 'agent')).toHaveLength(0);
    expect(items.find(item => item.id === 'send-1')).toMatchObject({ kind: 'text', text: '/stop' });
  });

  test('a result that still lands afterwards re-materialises the answer under the same id', () => {
    chatStore.startRun(THREAD, 'r1');
    chatStore.addUserMessage(THREAD, 'send-1', '/stop', []);
    route({ type: 'chat.command.pending', threadId: THREAD, replyToId: 'send-1', text: 'Running /stop…' });
    route({ type: 'chat.run.end', threadId: THREAD, reason: 'aborted' });
    route({ type: 'chat.command.result', threadId: THREAD, replyToId: 'send-1', text: 'Stopped.' });
    expect(chatStore.getItems(THREAD).find(item => item.id === 'cmd-send-1')).toMatchObject({
      kind: 'text',
      text: 'Stopped.',
      command: true,
      streaming: false,
    });
  });
});

/**
 * The state the server sends (`chat.run.stopping`).
 *
 * One frame per cycle when a stop is claimed, replayed to a window that syncs while the abort
 * travels: it is what shows a stop taken on another surface over here, and what a window that
 * reloaded mid-stop is handed back. It lives beside the local mark and reads through the same
 * `isStopping`, so a stop taken on the web refuses a second press exactly like one taken here.
 */
describe('the state the server sends', () => {
  test('received: the thread reads as stopping, with no local press behind it', () => {
    chatStore.startRun(THREAD, 'r1');
    expect(chatStore.isStopping(THREAD)).toBe(false);
    route({ type: 'chat.run.stopping', threadId: THREAD, run: 'r1' });
    expect(chatStore.isStopping(THREAD)).toBe(true);
  });

  test('a stop taken here and one taken elsewhere read as one state: the second press sends nothing', () => {
    chatStore.startRun(THREAD, 'r1');
    route({ type: 'chat.run.stopping', threadId: THREAD, run: 'r1' });
    // The press is refused without arming the local mark: there is nothing left to claim.
    expect(chatStore.claimStop(THREAD)).toBe(false);
    expect(chatStore.isStopping(THREAD)).toBe(true);
  });

  test('the end of the run lifts it, whatever the motive', () => {
    chatStore.startRun(THREAD, 'r1');
    route({ type: 'chat.run.stopping', threadId: THREAD, run: 'r1' });
    route({ type: 'chat.run.end', threadId: THREAD, reason: 'aborted' });
    expect(chatStore.isStopping(THREAD)).toBe(false);
    // The next cycle's stop is free to go again.
    chatStore.startRun(THREAD, 'r2');
    expect(chatStore.claimStop(THREAD)).toBe(true);
  });

  test('a page that says no run is answering lifts it', () => {
    chatStore.startRun(THREAD, 'r1');
    route({ type: 'chat.run.stopping', threadId: THREAD, run: 'r1' });
    chatStore.handleSyncResult(THREAD, oneEntry(), null, null, false);
    expect(chatStore.isStopping(THREAD)).toBe(false);
  });

  test('a session list that no longer holds the run lifts it', () => {
    chatStore.startRun(THREAD, 'r1');
    route({ type: 'chat.run.stopping', threadId: THREAD, run: 'r1' });
    chatStore.seedRuns([]);
    expect(chatStore.isStopping(THREAD)).toBe(false);
  });

  test('the thread going away lifts it', () => {
    chatStore.startRun(THREAD, 'r1');
    route({ type: 'chat.run.stopping', threadId: THREAD, run: 'r1' });
    chatStore.clearThread(THREAD);
    expect(chatStore.isStopping(THREAD)).toBe(false);
  });

  test('a page that replaces the thread drops it, and the replay right after raises it again', () => {
    // A reset is the truth over the range it covers: one still in flight is replayed right after
    // the page (the server sends it last), which sets the state again; one that has settled is
    // not, which is the point.
    chatStore.startRun(THREAD, 'r1');
    route({ type: 'chat.run.stopping', threadId: THREAD, run: 'r1' });
    chatStore.handleSyncResult(THREAD, oneEntry(), null, null, true, 'branch-switch');
    expect(chatStore.isStopping(THREAD)).toBe(false);
    // The replay of the same cycle, as the sync hands it back while the abort still travels.
    route({ type: 'chat.run.stopping', threadId: THREAD, run: 'r1' });
    expect(chatStore.isStopping(THREAD)).toBe(true);
  });

  test('a stop against a compaction goes with the end of the compaction', () => {
    chatStore.setCompacting(THREAD, Date.now());
    route({ type: 'chat.run.stopping', threadId: THREAD });
    expect(chatStore.isStopping(THREAD)).toBe(true);
    chatStore.setCompacting(THREAD, undefined);
    expect(chatStore.isStopping(THREAD)).toBe(false);
  });

  test('stopping then end: the state goes with the cycle it described', () => {
    chatStore.startRun(THREAD, 'r1');
    route({ type: 'chat.run.stopping', threadId: THREAD, run: 'r1' });
    expect(chatStore.isStopping(THREAD)).toBe(true);
    route({ type: 'chat.run.end', threadId: THREAD, reason: 'aborted' });
    expect(chatStore.isStopping(THREAD)).toBe(false);
  });

  test('end then stopping: a frame out of order does not leave the thread stuck', () => {
    // The end travelled first and the cycle is over. Left set, the state would read "Stopping…"
    // for good: nothing is coming to lift it.
    chatStore.startRun(THREAD, 'r1');
    route({ type: 'chat.run.end', threadId: THREAD, reason: 'aborted' });
    route({ type: 'chat.run.stopping', threadId: THREAD, run: 'r1' });
    expect(chatStore.isStopping(THREAD)).toBe(false);
  });
});
