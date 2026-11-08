/**
 * Where a slash command sits in a thread -- live, mid-run, and after a reload.
 *
 * A command is journalled by the server when it *answers*, which for a `/compact` sent while a run
 * is going is minutes later: its entry lands after the run, after the compaction boundary it wrote,
 * after the messages queued behind it. Live, the app draws its own bubble at send time, so the two
 * have to agree -- and a `/compact` typed mid-run belongs where it was typed, not under its own
 * effect (owner, 2026-11-08). The order is measured here rather than described.
 */

import { chatStore } from '../chat';
import { routeServerFrame, type ServerFrameHandlers } from '../frameRouter';
import type { HistoryEntry, ServerFrame } from '../protocol';

const handlers = {
  activeThreadId: () => null,
  openThread: () => {},
} as unknown as ServerFrameHandlers;

function route(frame: ServerFrame): void {
  routeServerFrame(frame, handlers);
}

function sync(entries: HistoryEntry[]): void {
  route({ type: 'session.sync.result', threadId: THREAD, entries, head: 'x', leaf: 'y' } as ServerFrame);
}

const THREAD = 't1';

const indexOf = (items: { id: string }[], id: string): number => items.findIndex(item => item.id === id);

const at = (iso: string): number => new Date(iso).getTime();

function userEntry(id: string, words: string, ts: string): HistoryEntry {
  return { role: 'user', id, text: words, ts } as HistoryEntry;
}

function agentEntry(id: string, words: string, ts: string): HistoryEntry {
  return { role: 'assistant', id, text: words, ts } as HistoryEntry;
}

beforeEach(() => chatStore.clearAll());

describe('a command typed mid-run', () => {
  test('its answer lands under the command, not at the bottom of the run it waited for', () => {
    chatStore.addUserMessage(THREAD, 'q1', 'fais le menage');
    chatStore.startStream(THREAD, 's1', 'q1');
    chatStore.appendDelta(THREAD, 's1', 'je regarde');
    // Mid-run: `/compact`, then a message queued behind it.
    chatStore.addUserMessage(THREAD, 'send-1', '/compact');
    chatStore.addUserMessage(THREAD, 'send-2', 'et ensuite ?');
    chatStore.endStream(THREAD, 's1');

    chatStore.addCommandPending(THREAD, 'send-1', 'Running /compact...');
    chatStore.addCommandResult(THREAD, 'cmd-send-1', 'Context compacted, 3 turns', 'send-1');
    // The run goes on writing after the command, the way it does live.
    chatStore.startStream(THREAD, 's2', 'send-2');
    chatStore.appendDelta(THREAD, 's2', 'c est fait');

    const items = chatStore.getItems(THREAD);
    // Said plainly: the answer sits right under the command, and what comes after it stays after.
    expect(indexOf(items, 'cmd-send-1')).toBe(indexOf(items, 'send-1') + 1);
    expect(indexOf(items, 's2')).toBeGreaterThan(indexOf(items, 'cmd-send-1'));
    expect(indexOf(items, 'send-2')).toBeGreaterThan(indexOf(items, 'cmd-send-1'));
  });

  test('a pending notice replaces in place, so a second one never opens a gap', () => {
    chatStore.addUserMessage(THREAD, 'q1', 'question');
    chatStore.addUserMessage(THREAD, 'send-1', '/compact');
    chatStore.startStream(THREAD, 's1', 'q1');

    chatStore.addCommandPending(THREAD, 'send-1', 'Running /compact...');
    chatStore.addCommandPending(THREAD, 'send-1', 'Waiting for the current run to finish, then compacting…');

    const items = chatStore.getItems(THREAD);
    expect(items.filter(item => item.id === 'cmd-send-1')).toHaveLength(1);
    expect(indexOf(items, 'cmd-send-1')).toBe(indexOf(items, 'send-1') + 1);
  });

  test('a page that arrives mid-run puts the local command back where it was typed', () => {
    // What the server has written: the question and the answer, then the messages queued behind
    // the command. The command itself has no entry yet -- it is journalled when it answers.
    chatStore.addUserMessage(THREAD, 'q1', 'fais le menage');
    chatStore.addUserMessage(THREAD, 'send-1', '/compact');
    // The run wrote before the command and goes on writing after it.
    const now = Date.now();
    chatStore.handleSyncResult(
      THREAD,
      [
        userEntry('q1', 'fais le menage', new Date(now - 10_000).toISOString()),
        agentEntry('s1', 'je regarde', new Date(now - 5_000).toISOString()),
        agentEntry('s2', "c'est fait", new Date(now + 5_000).toISOString()),
      ],
      'h',
      'l',
      true,
      undefined,
      false,
      true,
      0,
    );

    const items = chatStore.getItems(THREAD);
    const command = items.find(item => item.id === 'send-1');
    expect(command).toBeDefined();
    // The command's own clock puts it between the work written before it and the work after it --
    // never at the bottom, which is what appending every survivor did.
    expect(items.map(item => item.id)).toEqual(['q1', 's1', 'send-1', 's2']);
  });

  test('a fresh page keeps a genuinely newer send at the end', () => {
    chatStore.seedHistory(
      THREAD,
      [
        userEntry('q1', 'question', '2026-11-08T10:00:00.000Z'),
        agentEntry('s1', 'reponse', '2026-11-08T10:00:05.000Z'),
      ],
      false,
    );
    chatStore.addUserMessage(THREAD, 'send-9', 'et maintenant ?');
    const items = chatStore.getItems(THREAD);
    expect(items[items.length - 1]!.id).toBe('send-9');
  });
});

describe('the order the server replays', () => {
  /**
   * The reload path: the entry carries the instant of the send (`anchorTs`) and the server has
   * already placed it where it belongs. The app inserts a delta by that clock, so the two agree.
   */
  test('a journalled command arrives between the entries it was sent between', () => {
    chatStore.seedHistory(
      THREAD,
      [
        userEntry('q1', 'fais le menage', '2026-11-08T10:00:00.000Z'),
        agentEntry('s1', 'je regarde', '2026-11-08T10:00:05.000Z'),
      ],
      true,
    );
    sync([
      { role: 'user', id: 'send-1', text: '/compact', ts: '2026-11-08T10:00:06.000Z' } as HistoryEntry,
      {
        role: 'assistant',
        id: 'cmd-send-1',
        text: 'Context compacted, 3 turns',
        ts: '2026-11-08T10:00:06.000Z',
        command: true,
      } as HistoryEntry,
    ]);
    sync([agentEntry('s2', "c'est fait", '2026-11-08T10:00:20.000Z')]);

    const items = chatStore.getItems(THREAD);
    const order = items.map(item => item.id);
    expect(order).toEqual(['q1', 's1', 'send-1', 'cmd-send-1', 's2']);
    expect(at('2026-11-08T10:00:06.000Z')).toBeGreaterThan(0);
  });
});
