/**
 * A run the server went down under, and the Continue it must offer.
 *
 * 2026-10-04, thread "CubeFlow Desk 1": a `pkill` took the server down while the orchestrator waited
 * on a sub-agent. No end was ever written. The thread showed no Continue (the run was settled as
 * `done`, by the session list dropping it and by the page served with no run active) and the
 * sub-agent's card kept spinning. The server now reads such a run as `interrupted`, on its pages
 * and in `lastRun` for a delta that carries none of its entries.
 */
const mockSend = jest.fn<Promise<void>, [string]>(() => Promise.resolve());
jest.mock('../connection', () => ({ connection: { send: (frame: string) => mockSend(frame) } }));

import { chatStore } from '../chat';
import { continueTarget } from '../runRows';
import type { HistoryEntry, RunMeta } from '../protocol';

const THREAD = 'thread-under-test';
const ISO = (ms: number): string => new Date(ms).toISOString();
const T0 = Date.parse('2026-10-04T20:36:22.000Z');

const interrupted = (id: string): RunMeta => ({ id, status: 'interrupted', startTs: ISO(T0), endTs: ISO(T0 + 60_000) });

function delta(entries: HistoryEntry[], lastRun?: RunMeta): void {
  chatStore.handleSyncResult(THREAD, entries, 'head', 'head', false, undefined, false, undefined, undefined, lastRun);
}

beforeEach(() => {
  chatStore.clearAll();
  mockSend.mockClear();
});

describe('a run watched live when the server went down', () => {
  test('the verdict of the next sync offers Continue, whatever the session list settled it as', () => {
    chatStore.addUserMessage(THREAD, 'u1', 'lance le point 3');
    chatStore.startRun(THREAD, 'r1');
    chatStore.startStream(THREAD, 'b1');
    chatStore.appendDelta(THREAD, 'b1', 'Je lance le point 3.');
    // Reconnected: the session list no longer holds a run for the thread.
    chatStore.seedRuns([]);
    expect(continueTarget(chatStore.getItems(THREAD))).toBeUndefined();

    // The delta has nothing new to say: the server wrote nothing after the kill.
    delta([], interrupted('r1'));

    const run = continueTarget(chatStore.getItems(THREAD));
    expect(run).toMatchObject({ id: 'r1', status: 'interrupted' });
    expect(run?.endTs).toBe(T0 + 60_000);
  });

  test('a run that ended on its own keeps its end: a verdict of done offers nothing', () => {
    chatStore.addUserMessage(THREAD, 'u1', 'q');
    chatStore.startRun(THREAD, 'r1');
    chatStore.startStream(THREAD, 'b1');
    chatStore.appendDelta(THREAD, 'b1', 'answer');
    chatStore.seedRuns([]);
    delta([], { ...interrupted('r1'), status: 'done' });
    expect(continueTarget(chatStore.getItems(THREAD))).toBeUndefined();
  });

  test('a run that drew nothing signs its message, so the message can be continued', () => {
    chatStore.addUserMessage(THREAD, 'u1', 'q');
    chatStore.startRun(THREAD, 'r1');
    chatStore.seedRuns([]);
    delta([], interrupted('r1'));
    expect(continueTarget(chatStore.getItems(THREAD))?.id).toBe('r1');
  });
});

describe('a thread opened after the server came back', () => {
  test('its interrupted run offers Continue, and its sub-agent card stops spinning', () => {
    const run = interrupted('r1');
    chatStore.handleSyncResult(
      THREAD,
      [
        { id: 'u1', role: 'user', text: 'lance le point 3', ts: ISO(T0) },
        { id: 'p1', role: 'assistant', text: 'Je lance le point 3.', ts: ISO(T0 + 1_000), run },
        {
          id: 't-call-1',
          role: 'tool',
          name: 'spawn',
          args: { type: 'general', mode: 'run', task: 'lua lookup' },
          ok: false,
          output: '',
          truncated: false,
          ts: ISO(T0 + 2_000),
          run,
          spawn: {
            subagentId: 'subagent/lua',
            displayName: 'lua-member-lookup',
            agentType: 'general',
            mode: 'run',
            action: 'spawn',
            status: 'interrupted',
            startedAt: ISO(T0 + 2_000),
          },
        },
      ],
      't-call-1',
      't-call-1',
      false,
      undefined,
      false,
      false,
      0,
      run,
    );
    const card = chatStore.getItems(THREAD).find(item => item.id === 't-call-1');
    expect(card?.kind === 'tool' && card.running).toBeFalsy();
    expect(card?.kind === 'tool' && card.spawn?.status).toBe('interrupted');
    expect(continueTarget(chatStore.getItems(THREAD))).toMatchObject({ id: 'r1', status: 'interrupted' });
  });
});
