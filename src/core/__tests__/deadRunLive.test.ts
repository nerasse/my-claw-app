/**
 * What a finished run leaves live on this device, and what a page does with it.
 *
 * Measured 2026-09-22 on thread 4d5775e7: after a reload, a "Reasoning 23 min 43 s" bubble sat
 * under the last answer, its counter still climbing. It was the thinking of a run stopped at
 * 22:35 -- the server writes nothing of a call a Stop cuts, and the bubble had never been told it
 * was over. `streaming: true` was stored and never lifted, and every page trusted it: "only
 * genuinely local items survive a reset", re-appended after the page, for good.
 *
 * The same night, a dead run opened later read "run · 1 h 41 min" for a run that lived 47: the
 * trailing run was sealed at the clock of the moment the thread was opened.
 */
const mockSend = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.mock('../connection', () => ({ connection: { send: (frame: string) => mockSend(frame) } }));

import { chatStore } from '../chat';
import type { TextItem } from '../chat';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import type { HistoryEntry, RunMeta } from '../protocol';

const THREAD = 'thread-under-test';
const ISO = (ms: number): string => new Date(ms).toISOString();
const T0 = Date.parse('2026-09-22T20:34:00.000Z');

const bubble = (id: string): TextItem | undefined => {
  const item = chatStore.getItems(THREAD).find(entry => entry.id === id);
  return item?.kind === 'text' ? item : undefined;
};

/** The newest page of the branch, as the server answers a null-cursor sync. */
function window(entries: HistoryEntry[], activeRun: boolean): void {
  chatStore.handleSyncResult(THREAD, entries, entries[entries.length - 1]!.id, entries[entries.length - 1]!.id, activeRun, undefined, false, false, 0);
}

const meta = (id: string, over: Partial<RunMeta> = {}): RunMeta => ({ id, status: 'done', startTs: ISO(T0), endTs: ISO(T0 + 60_000), ...over });

beforeEach(() => {
  chatStore.clearAll();
  mockSend.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a bubble a stopped run left open', () => {
  test('stops streaming when its run ends, its thinking span frozen at the end', () => {
    jest.useFakeTimers();
    jest.setSystemTime(T0);
    chatStore.startRun(THREAD, 'run-stopped');
    chatStore.startStream(THREAD, 'b-think');
    chatStore.appendReasoning(THREAD, 'b-think', 'weighing the options');

    jest.setSystemTime(T0 + 80_000);
    // The Stop: the run ends, and no abort frame ever names this bubble.
    chatStore.endRun(THREAD, 'aborted');

    const sealed = bubble('b-think');
    expect(sealed?.streaming).toBe(false);
    expect(sealed?.reasoningMs).toBe(80_000);
    // Twenty minutes later nothing moves: a sealed span never measures against the clock.
    jest.setSystemTime(T0 + 20 * 60_000);
    expect(bubble('b-think')?.reasoningMs).toBe(80_000);
  });

  test('does not outlive the next page: the thread is what the log holds', () => {
    chatStore.startRun(THREAD, 'run-stopped');
    chatStore.startStream(THREAD, 'b-think');
    chatStore.appendReasoning(THREAD, 'b-think', 'weighing the options');
    chatStore.endRun(THREAD, 'aborted');

    window(
      [
        { id: 'u1', role: 'user', text: 'first', ts: ISO(T0 - 1_000) },
        { id: 'u2', role: 'user', text: 'second', ts: ISO(T0 + 100_000) },
        { id: 'a2', role: 'assistant', text: 'the answer', ts: ISO(T0 + 200_000), run: meta('run-next') },
      ],
      false,
    );

    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['u1', 'u2', 'a2']);
  });

  test('a bubble with no run is dead too once the server says nothing is answering', () => {
    // A stream the device opened before any run id reached it: nothing ties it to a run, so only
    // the server's word can close it.
    chatStore.startStream(THREAD, 'b-orphan');
    chatStore.appendReasoning(THREAD, 'b-orphan', 'half a thought');

    window([{ id: 'u1', role: 'user', text: 'q', ts: ISO(T0) }], false);
    expect(bubble('b-orphan')).toBeUndefined();
  });

  test('while a run is answering, its own bubble in flight is kept after the page', () => {
    chatStore.startStream(THREAD, 'b-live');
    chatStore.appendReasoning(THREAD, 'b-live', 'still thinking');

    window([{ id: 'u1', role: 'user', text: 'q', ts: ISO(T0) }], true);
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['u1', 'b-live']);
    expect(bubble('b-live')?.streaming).toBe(true);
  });

  test('the owner\'s own parked send survives a page with no run: it is this device\'s to keep', () => {
    chatStore.addUserMessage(THREAD, 'u-parked', 'wait for me', []);
    chatStore.markQueued(THREAD, 'u-parked', 'compaction');

    window([{ id: 'u1', role: 'user', text: 'q', ts: ISO(T0) }], false);
    expect(chatStore.getItems(THREAD).map(item => item.id)).toContain('u-parked');
  });
});

describe('a dead run on a page', () => {
  test('is sealed at its last own entry, never at the clock of the moment it is opened', () => {
    jest.useFakeTimers();
    // Opened an hour after the run died.
    jest.setSystemTime(T0 + 60 * 60_000);
    const running = meta('run-dead', { status: 'running', endTs: undefined });
    window(
      [
        { id: 'u1', role: 'user', text: 'continue', ts: ISO(T0) },
        { id: 'p1', role: 'assistant', text: 'working', ts: ISO(T0 + 47 * 60_000), run: running },
      ],
      false,
    );

    const phase = chatStore.getItems(THREAD).find(item => item.id === 'p1');
    expect(phase?.run?.status).toBe('done');
    expect(phase?.run?.endTs).toBe(T0 + 47 * 60_000);
  });
});

describe('the end of a stopped run on the thread on screen', () => {
  const onScreen = { activeThreadId: () => THREAD, subagentParent: () => null } as unknown as ServerFrameHandlers;

  test('asks for the newest page, so the screen becomes what the log holds', () => {
    chatStore.startRun(THREAD, 'run-stopped');
    routeServerFrame({ type: 'chat.run.end', threadId: THREAD, reason: 'aborted' }, onScreen);

    const syncs = mockSend.mock.calls.map(([frame]) => JSON.parse(frame)).filter(frame => frame.type === 'session.sync');
    expect(syncs).toHaveLength(1);
    // A null cursor is what makes the server answer with the window instead of a delta.
    expect(syncs[0].since ?? null).toBeNull();
    expect(syncs[0].threadId).toBe(THREAD);
  });

  test('a finished run does not: it and the log agree by construction', () => {
    chatStore.startRun(THREAD, 'run-done');
    routeServerFrame({ type: 'chat.run.end', threadId: THREAD, reason: 'done' }, onScreen);

    const syncs = mockSend.mock.calls.map(([frame]) => JSON.parse(frame)).filter(frame => frame.type === 'session.sync');
    expect(syncs).toHaveLength(0);
  });
});
