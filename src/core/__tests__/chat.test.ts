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
