import { chatStore } from '../chat';
import type { HistoryEntry } from '../protocol';

const THREAD = 't1';

const toolEntry: HistoryEntry = {
  role: 'tool',
  ts: '2026-01-01T00:00:02.000Z',
  id: 'h-2',
  name: 'bash',
  args: { command: 'echo hi' },
  durationMs: 4,
  ok: true,
  output: 'hi',
  truncated: false,
};

beforeEach(() => {
  chatStore.clearAll();
});

describe('chatStore streaming', () => {
  test('a stream becomes one agent bubble and empty streams leave nothing behind', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'hel');
    chatStore.appendDelta(THREAD, 's1', 'lo');
    expect(chatStore.getItems(THREAD)).toHaveLength(1);

    chatStore.endStream(THREAD, 's1');
    const [item] = chatStore.getItems(THREAD);
    expect(item).toMatchObject({ kind: 'text', role: 'agent', text: 'hello', streaming: false });

    chatStore.startStream(THREAD, 's2');
    chatStore.endStream(THREAD, 's2');
    expect(chatStore.getItems(THREAD)).toHaveLength(1);
  });

  test('deltas for an unknown stream are ignored', () => {
    chatStore.appendDelta(THREAD, 'ghost', 'x');
    expect(chatStore.getItems(THREAD)).toHaveLength(0);
  });

  test('an abort without a stream still surfaces the error', () => {
    chatStore.abortStream(THREAD, 'a1', 'boom');
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ error: 'boom', streaming: false });
  });

  test('a failed send is marked on the user bubble', () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hi');
    chatStore.markSendFailed(THREAD, 'u1');
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ role: 'user', error: 'not sent' });
  });
});

describe('chatStore attachment merge', () => {
  const image = { id: 'm1', type: 'image' as const, filename: 'x.png' };

  test('an attachment-only delivery lands on the bubble that just streamed', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'here you go');
    chatStore.endStream(THREAD, 's1');
    chatStore.addAgentMessage(THREAD, 'final', '', [image]);
    const items = chatStore.getItems(THREAD);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 's1', text: 'here you go', streaming: false, attachments: [image] });
  });

  test('a text message after a stream still appends its own bubble', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'streamed');
    chatStore.endStream(THREAD, 's1');
    chatStore.addAgentMessage(THREAD, 'f1', 'final text', []);
    const items = chatStore.getItems(THREAD);
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ id: 'f1', text: 'final text' });
  });

  test('without a stream, an attachment-only message is its own bubble', () => {
    chatStore.addAgentMessage(THREAD, 'a1', '', [image]);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ id: 'a1', attachments: [image] });
  });

  test('a stream that vanished leaves no bubble for the delivery to land on', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.endStream(THREAD, 's1');
    chatStore.addAgentMessage(THREAD, 'a1', '', [image]);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ id: 'a1' });
  });
});

describe('chatStore tool cards', () => {
  test('a tool call becomes its own item and repeats are ignored', () => {
    const payload = { id: 'c1', name: 'bash', args: {}, ok: true, output: 'out', truncated: false };
    chatStore.addToolCall(THREAD, payload);
    chatStore.addToolCall(THREAD, payload);
    const items = chatStore.getItems(THREAD);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'tool', name: 'bash', output: 'out' });
  });
});

describe('chatStore.seedHistory', () => {
  test('replaces what is on screen so an old rendering cannot survive a reopen', () => {
    chatStore.addUserMessage(THREAD, 'stale', 'old');
    chatStore.seedHistory(THREAD, [
      { id: 'h-1', role: 'user', text: 'check', ts: '2026-01-01T00:00:01.000Z' },
      toolEntry,
    ]);
    const items = chatStore.getItems(THREAD);
    expect(items.map(item => item.kind)).toEqual(['text', 'tool']);
    expect(items.find(item => item.id === 'stale')).toBeUndefined();
  });

  test('keeps live items while a stream is running', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'in progress');
    chatStore.seedHistory(THREAD, [{ id: 'h-1', role: 'user', text: 'old', ts: '2026-01-01T00:00:01.000Z' }]);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ id: 's1', streaming: true });
  });

  test('an empty history never wipes the thread', () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hi');
    chatStore.seedHistory(THREAD, []);
    expect(chatStore.getItems(THREAD)).toHaveLength(1);
  });

  test('a run in flight keeps the thread it already shows, page or no page', () => {
    chatStore.seedRuns([THREAD]);
    chatStore.addUserMessage(THREAD, 'u1', 'la question');
    chatStore.addToolCall(THREAD, { ...toolEntry, id: 'live-tool' });
    chatStore.seedHistory(THREAD, [{ id: 'h-1', role: 'user', text: 'tour precedent', ts: '2026-01-01T00:00:01.000Z' }]);
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['u1', 'live-tool']);
    chatStore.seedRuns([]);
  });

  test('a run in flight still seeds a thread the app has nothing of', () => {
    chatStore.seedRuns([THREAD]);
    chatStore.seedHistory(THREAD, [{ id: 'h-1', role: 'user', text: 'reconnecte', ts: '2026-01-01T00:00:01.000Z' }]);
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['h-1']);
    chatStore.seedRuns([]);
  });

  test('tool entries keep their arguments, duration and output', () => {
    chatStore.seedHistory(THREAD, [toolEntry]);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({
      kind: 'tool',
      name: 'bash',
      args: { command: 'echo hi' },
      durationMs: 4,
      output: 'hi',
    });
  });
});

describe('chatStore run lifecycle', () => {
  test('a run is active until its matching end, and only for its own thread', () => {
    chatStore.startRun(THREAD);
    expect(chatStore.hasActiveRun(THREAD)).toBe(true);
    expect(chatStore.hasActiveRun('other')).toBe(false);

    chatStore.endRun(THREAD);
    expect(chatStore.hasActiveRun(THREAD)).toBe(false);
  });

  test('an end without a start is a no-op', () => {
    chatStore.endRun(THREAD);
    expect(chatStore.hasActiveRun(THREAD)).toBe(false);
  });

  test('the run flag survives tool calls: nothing clears it but the end frame', () => {
    chatStore.startRun(THREAD);
    chatStore.startStream(THREAD, 's1');
    chatStore.endStream(THREAD, 's1');
    chatStore.addToolCall(THREAD, { id: 'c1', name: 'bash', args: {}, ok: true, output: 'out', truncated: false });
    expect(chatStore.hasActiveRun(THREAD)).toBe(true);
  });

  test('seedRuns replaces the view with the server list', () => {
    chatStore.startRun(THREAD);
    chatStore.seedRuns([]);
    expect(chatStore.hasActiveRun(THREAD)).toBe(false);

    chatStore.seedRuns([THREAD]);
    expect(chatStore.hasActiveRun(THREAD)).toBe(true);
  });
});

describe('chatStore unread', () => {
  test('unread snapshot keeps its identity between changes', () => {
    const empty = chatStore.getUnreadThreads();
    expect(chatStore.getUnreadThreads()).toBe(empty);

    chatStore.markUnread(THREAD);
    expect(chatStore.getUnreadThreads()).toEqual([THREAD]);
    const snapshot = chatStore.getUnreadThreads();
    chatStore.markUnread(THREAD);
    expect(chatStore.getUnreadThreads()).toBe(snapshot);

    chatStore.markRead(THREAD);
    expect(chatStore.getUnreadThreads()).toHaveLength(0);
  });

  test('notifies subscribers once per mutation', () => {
    const listener = jest.fn();
    const off = chatStore.subscribe(listener);
    chatStore.addUserMessage(THREAD, 'u1', 'a');
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    chatStore.addUserMessage(THREAD, 'u2', 'b');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('what a stream costs its readers', () => {
  test('a token notifies once per frame, not once per token', async () => {
    jest.useFakeTimers();
    try {
      let notifications = 0;
      const stop = chatStore.subscribe(() => {
        notifications += 1;
      });
      chatStore.startStream(THREAD, 's1');
      notifications = 0;

      for (let i = 0; i < 50; i += 1) chatStore.appendDelta(THREAD, 's1', 'x');
      // The text is there immediately: only the notification waits.
      expect(chatStore.getItems(THREAD)[0]).toMatchObject({ text: 'x'.repeat(50) });
      expect(notifications).toBe(0);

      jest.advanceTimersByTime(20);
      expect(notifications).toBe(1);

      // The end of the stream flushes rather than waits.
      chatStore.appendDelta(THREAD, 's1', 'y');
      chatStore.endStream(THREAD, 's1');
      expect(notifications).toBe(2);
      stop();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a growing bubble changes neither the row count nor the spawn cards', () => {
    chatStore.seedHistory(THREAD, [
      {
        role: 'tool',
        ts: '2026-01-01T00:00:01.000Z',
        id: 'h-1',
        name: 'spawn',
        args: { name: 'researcher', mode: 'session' },
        durationMs: 12,
        ok: true,
        output: 'subagent/researcher-a7b3',
        truncated: false,
      },
    ]);
    chatStore.startStream(THREAD, 's1');
    const countBefore = chatStore.getItems(THREAD).length;
    const cardsBefore = chatStore.spawnCardsOf(THREAD);
    expect(cardsBefore).toHaveLength(1);

    chatStore.appendDelta(THREAD, 's1', 'writing');

    // Same identity, so a shell subscribed to these bails out instead of re-rendering.
    expect(chatStore.getItems(THREAD).length).toBe(countBefore);
    expect(chatStore.spawnCardsOf(THREAD)).toBe(cardsBefore);
  });
});
