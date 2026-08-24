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

/**
 * A prompt typed in one window has to appear in the others, or the answer streams in under
 * nothing: `startStream` looks its parent up by id, finds none, and drops the bubble at the end
 * of the thread with a fresh timestamp.
 */
describe('chatStore prompt echo', () => {
  test('an echo from another window becomes the user bubble the answer replies to', () => {
    chatStore.echoUserMessage(THREAD, 'm1', 'from the phone');
    chatStore.startStream(THREAD, 's1', 'm1');

    const items = chatStore.getItems(THREAD);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: 'm1', role: 'user', text: 'from the phone' });
    // Anchored on the question, not on the clock: the answer sorts right after it.
    expect(items[1]!.ts).toBe(items[0]!.ts + 1);
  });

  test('the window that sent it keeps one bubble, whatever the server mirrors back', () => {
    chatStore.addUserMessage(THREAD, 'm1', 'typed here');
    chatStore.echoUserMessage(THREAD, 'm1', 'typed here');
    expect(chatStore.getItems(THREAD)).toHaveLength(1);
  });

  test('an echo carries what the bubble needs to draw itself', () => {
    const shot = { id: 'f1', type: 'image' as const, filename: 'shot.png' };
    const here = { latitude: 48.85, longitude: 2.35, accuracyMeters: 12, capturedAt: '2026-01-01T00:00:00.000Z' };
    chatStore.echoUserMessage(THREAD, 'm2', 'look', [shot], here);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ attachments: [shot], location: here });
  });
});

describe('chatStore compaction hold', () => {
  test('the badge goes from every send the hold parked, not just the last one', () => {
    chatStore.addUserMessage(THREAD, 'm1', 'first');
    chatStore.addUserMessage(THREAD, 'm2', 'second');
    chatStore.addUserMessage(THREAD, 'm3', 'third');
    chatStore.markQueued(THREAD, 'm1', 'compaction');
    chatStore.markQueued(THREAD, 'm2', 'compaction');
    chatStore.markQueued(THREAD, 'm3', 'compaction');
    expect(chatStore.getItems(THREAD).filter(item => item.kind === 'text' && item.queuedSince)).toHaveLength(3);

    chatStore.clearQueued(THREAD);

    // One compaction holds every send typed while it runs, and the run that follows is one
    // event: whatever ends the wait ends it for all of them.
    expect(chatStore.getItems(THREAD).filter(item => item.kind === 'text' && item.queuedSince)).toHaveLength(0);
  });

  test('a prompt mirrored from another window can be marked as held', () => {
    // The window that did not type it has no local bubble: the mark names the sender's id, so it
    // only lands because the echo created the bubble under that same id.
    chatStore.echoUserMessage(THREAD, 'm1', 'from the phone');
    chatStore.markQueued(THREAD, 'm1', 'compaction');
    const item = chatStore.getItems(THREAD)[0];
    expect(item!.kind === 'text' ? item!.queuedSince : undefined).toBeGreaterThan(0);

    // What the router does on chat.stream.start, in that order: the wait is over, the run writes.
    chatStore.clearQueued(THREAD);
    chatStore.startStream(THREAD, 's1', 'm1');
    const cleared = chatStore.getItems(THREAD)[0];
    expect(cleared!.kind === 'text' ? cleared!.queuedSince : undefined).toBeUndefined();
  });

  test('the mark is stamped once, so a repeated hold does not restart the clock', () => {
    chatStore.addUserMessage(THREAD, 'm1', 'first');
    chatStore.markQueued(THREAD, 'm1', 'compaction');
    const first = chatStore.getItems(THREAD)[0];
    const since = first!.kind === 'text' ? first!.queuedSince : undefined;
    chatStore.markQueued(THREAD, 'm1', 'compaction');
    const again = chatStore.getItems(THREAD)[0];
    expect(again!.kind === 'text' ? again!.queuedSince : undefined).toBe(since);
  });

  test('an injection hold names its reason, and acking one bubble lifts only that mark', () => {
    // Two sends land while a run is active: both are queued in its mailbox, the run drains the
    // first at a turn boundary before the second. acked names the id so the first lift does not
    // take the second's mark with it.
    chatStore.addUserMessage(THREAD, 'm1', 'first');
    chatStore.addUserMessage(THREAD, 'm2', 'second');
    chatStore.markQueued(THREAD, 'm1', 'injection');
    chatStore.markQueued(THREAD, 'm2', 'injection');
    const items = () => chatStore.getItems(THREAD).filter(item => item.kind === 'text' && item.queuedSince) as Array<{ id: string; queuedReason?: string }>;
    expect(items()).toHaveLength(2);
    expect(items().find(i => i.id === 'm1')?.queuedReason).toBe('injection');

    chatStore.clearQueued(THREAD, 'm1');
    const held = items();
    expect(held).toHaveLength(1);
    expect(held[0].id).toBe('m2');
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

  test('a start frame opens a spinner card and the end frame upserts the result onto it', () => {
    chatStore.startToolCall(THREAD, 'c2', 'bash', { command: 'ls' });
    const started = chatStore.getItems(THREAD);
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ kind: 'tool', id: 'c2', name: 'bash', running: true, output: '' });

    chatStore.addToolCall(THREAD, { id: 'c2', name: 'bash', args: { command: 'ls' }, ok: true, output: 'file.txt', truncated: false });
    const finished = chatStore.getItems(THREAD);
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ kind: 'tool', id: 'c2', name: 'bash', running: false, output: 'file.txt', ok: true });
  });

  test('live delta chunks append to the running card output, and settle to the final output', () => {
    chatStore.startToolCall(THREAD, 'c3', 'bash', { command: 'count.sh' });
    chatStore.appendToolOutput(THREAD, 'c3', { stdout: 'line 1\n' });
    chatStore.appendToolOutput(THREAD, 'c3', { stdout: 'line 2\n', stderr: 'warn' });
    const live = chatStore.getItems(THREAD)[0] as { output: string; running: boolean };
    expect(live.running).toBe(true);
    expect(live.output).toContain('line 1');
    expect(live.output).toContain('line 2');
    expect(live.output).toContain('STDERR: warn');

    // Settling replaces the streamed text with the final output (the server sends the full
    // accumulated output in the end frame).
    chatStore.addToolCall(THREAD, { id: 'c3', name: 'bash', args: { command: 'count.sh' }, ok: true, output: 'line 1\nline 2\n', truncated: false });
    const settled = chatStore.getItems(THREAD)[0] as { output: string; running: boolean };
    expect(settled.running).toBe(false);
    expect(settled.output).toBe('line 1\nline 2\n');
  });
});

describe('chatStore.seedHistory', () => {
  test('replaces what is on screen so an old rendering cannot survive a reopen', () => {
    chatStore.addAgentMessage(THREAD, 'stale', 'old', []);
    chatStore.seedHistory(THREAD, [
      { id: 'h-1', role: 'user', text: 'check', ts: '2026-01-01T00:00:01.000Z' },
      toolEntry,
    ]);
    const items = chatStore.getItems(THREAD);
    expect(items.map(item => item.kind)).toEqual(['text', 'tool']);
    expect(items.find(item => item.id === 'stale')).toBeUndefined();
  });

  // Reloading a page while a tool was executing used to draw the card as finished: the server
  // rebuilt an unanswered call as a successful empty one, and the spinner never came back even
  // though the sub-agent behind it was still running.
  test('a tool still executing keeps its running flag through a reseed', () => {
    chatStore.seedHistory(THREAD, [
      { id: 'h-1', role: 'user', text: 'lance', ts: '2026-01-01T00:00:01.000Z' },
      { ...toolEntry, id: 't-call-1', running: true, ok: true, output: '', durationMs: undefined },
    ]);
    const [, card] = chatStore.getItems(THREAD);
    expect(card).toMatchObject({ kind: 'tool', id: 't-call-1', running: true });
  });

  test('a settled tool is not marked running', () => {
    chatStore.seedHistory(THREAD, [toolEntry]);
    const card = chatStore.getItems(THREAD)[0];
    expect(card.kind).toBe('tool');
    // ToolCard tests `running === true`, so an absent flag is correctly "not running".
    expect(card.kind === 'tool' ? card.running : 'wrong-kind').toBeFalsy();
  });

  // Reported symptom: reload a session while sub-agents run, and as each one finishes a second
  // spawn card appears beside the first, carrying the duration. The end frame could not find the
  // card history had drawn, so it appended its own -- and `spawnCardsOf` then listed both.
  test('a spawn finishing after a reseed leaves one card, not two', () => {
    chatStore.seedHistory(THREAD, [
      {
        role: 'tool', ts: '2026-01-01T00:00:02.000Z', id: 't-call-9', name: 'spawn',
        args: { type: 'general', mode: 'session', task: 'creuse' },
        ok: true, output: '', truncated: false, running: true,
      },
    ]);
    expect(chatStore.spawnCardsOf(THREAD)).toHaveLength(1);

    chatStore.addToolCall(THREAD, {
      id: 't-call-9', name: 'spawn', args: { type: 'general', mode: 'session', task: 'creuse' },
      ok: true, output: 'fini', truncated: false, durationMs: 91_000,
    });

    const cards = chatStore.spawnCardsOf(THREAD);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: 't-call-9', durationMs: 91_000 });
    expect(chatStore.getItems(THREAD).filter(i => i.kind === 'tool')).toHaveLength(1);
  });


  // The card history draws and the card the live stream patches share one id, so the tool
  // finishing after the reload replaces this card instead of appending a second one below it.
  test('a tool finishing after a reseed patches the seeded card instead of adding one', () => {
    chatStore.seedHistory(THREAD, [
      { ...toolEntry, id: 't-call-1', running: true, ok: true, output: '', durationMs: undefined },
    ]);
    chatStore.addToolCall(THREAD, { id: 't-call-1', name: 'bash', args: { command: 'echo hi' }, ok: true, output: 'hi', truncated: false, durationMs: 4 });
    const items = chatStore.getItems(THREAD);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'tool', output: 'hi', running: false });
  });

  // The server stores a compaction summary in a `user` turn because that is the role the prompt
  // needs it in. Without the marker the app drew it as a message the owner had typed.
  test('a compaction boundary is carried through as a boundary, not as a question', () => {
    chatStore.seedHistory(THREAD, [
      { id: 'h-1', role: 'user', text: 'avant', ts: '2026-01-01T00:00:01.000Z' },
      { id: 'h-2', role: 'user', text: 'Prior work: the summary itself.', ts: '2026-01-01T00:00:02.000Z', summaryOf: 8 },
      { id: 'h-3', role: 'user', text: 'apres', ts: '2026-01-01T00:00:03.000Z' },
    ]);
    const items = chatStore.getItems(THREAD);
    expect(items).toHaveLength(3);
    expect(items[1]).toMatchObject({ kind: 'text', summaryOf: 8, text: 'Prior work: the summary itself.' });
    // The turns either side of it are ordinary messages: a boundary hides nothing.
    expect(items[0]).toMatchObject({ text: 'avant' });
    expect(items[0]).not.toHaveProperty('summaryOf');
    expect(items[2]).toMatchObject({ text: 'apres' });
    expect(items[2]).not.toHaveProperty('summaryOf');
  });

  test('a send the server never mirrors does not outlive its window', () => {
    jest.useFakeTimers({ now: 1_800_000_000_000 });
    try {
      // A `/status` is answered as a page and journalled as nothing: no turn is ever mirrored
      // for it, so only the window stops its bubble from sitting there for good.
      chatStore.addUserMessage(THREAD, 'send-3', '/status');
      const page = [{ id: 'h-1' as const, role: 'user' as const, text: 'avant', ts: '2026-01-01T00:00:01.000Z' }];
      chatStore.seedHistory(THREAD, page);
      expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['h-1', 'send-3']);

      jest.setSystemTime(1_800_000_031_000);
      chatStore.seedHistory(THREAD, page);
      expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['h-1']);
    } finally {
      jest.useRealTimers();
    }
  });

  test('the bubble being written survives the page, after it', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'in progress');
    chatStore.seedHistory(THREAD, [{ id: 'h-1', role: 'user', text: 'old', ts: '2026-01-01T00:00:01.000Z' }]);
    // No page can hold a bubble that is still being written, so it is kept -- but the page owns
    // the order, and the question it carries comes first.
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['h-1', 's1']);
    expect(chatStore.getItems(THREAD)[1]).toMatchObject({ id: 's1', streaming: true, text: 'in progress' });
  });

  test('a mirrored question is not duplicated: same bubble, same id', () => {
    chatStore.addUserMessage(THREAD, 'send-1', 'la question');
    chatStore.startStream(THREAD, 's1');
    // The server replays a mirrored user turn under the device's own chat.send id.
    chatStore.seedHistory(THREAD, [{ id: 'send-1', role: 'user', text: 'la question', ts: '2026-01-01T00:00:01.000Z' }]);
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['send-1', 's1']);
  });

  test('a send the server has not turned into a turn yet is kept', () => {
    chatStore.seedRuns([THREAD]);
    chatStore.addUserMessage(THREAD, 'send-2', 'pendant la compaction');
    chatStore.seedHistory(THREAD, [{ id: 'h-1', role: 'user', text: 'tour precedent', ts: '2026-01-01T00:00:01.000Z' }]);
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['h-1', 'send-2']);
    chatStore.seedRuns([]);
  });

  test('page-owned bubbles are never doubled by a local copy', () => {
    chatStore.addToolCall(THREAD, { ...toolEntry, id: 'live-tool' });
    chatStore.addCommandResult(THREAD, 'cmd-1', 'Compacted.', undefined);
    chatStore.abortStream(THREAD, 'dead', 'API Error: 529 Overloaded');
    chatStore.seedHistory(THREAD, [
      { id: 'h-1', role: 'user', text: 'la question', ts: '2026-01-01T00:00:01.000Z' },
      toolEntry,
    ]);
    // Cards, command answers and failures all come back in the page; keeping the local copies
    // would show each of them twice.
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['h-1', toolEntry.id]);
  });

  test('an empty history never wipes the thread', () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hi');
    chatStore.seedHistory(THREAD, []);
    expect(chatStore.getItems(THREAD)).toHaveLength(1);
  });

  test('a run in flight still seeds a thread the app has nothing of', () => {
    chatStore.seedRuns([THREAD]);
    chatStore.seedHistory(THREAD, [{ id: 'h-1', role: 'user', text: 'reconnecte', ts: '2026-01-01T00:00:01.000Z' }]);
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['h-1']);
    chatStore.seedRuns([]);
  });

  test('a replayed failure keeps its error, so a reopened thread still says why', () => {
    chatStore.seedHistory(THREAD, [
      { id: 'h-1', role: 'user', text: 'continue', ts: '2026-01-01T00:00:01.000Z' },
      { id: 'f-1', role: 'assistant', text: '', ts: '2026-01-01T00:00:02.000Z', error: 'API Error: 529 Overloaded' },
    ]);
    expect(chatStore.getItems(THREAD)[1]).toMatchObject({
      kind: 'text',
      role: 'agent',
      text: '',
      error: 'API Error: 529 Overloaded',
    });
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

describe('chatStore live spawn cards', () => {
  const SPAWN_THREAD = 'thread-spawn-live';

  test('startSpawn marks a tool spawn card running and settles it', () => {
    chatStore.startToolCall(SPAWN_THREAD, 'card-1', 'spawn', { name: 'researcher', mode: 'run' });
    chatStore.startSpawn(SPAWN_THREAD, 'card-1', {
      subagentId: 'subagent/run-1',
      displayName: 'researcher',
      type: 'research',
      mode: 'run',
      action: 'spawn',
    });
    const cards = chatStore.spawnCardsOf(SPAWN_THREAD);
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe('running');
    expect(cards[0].subagentId).toBe('subagent/run-1');

    chatStore.settleSpawn(SPAWN_THREAD, 'card-1', { status: 'complete', resultLength: 42 });
    const settled = chatStore.spawnCardsOf(SPAWN_THREAD);
    expect(settled[0].status).toBe('complete');
    const settledTool = chatStore.getItems(SPAWN_THREAD).find(item => item.id === 'card-1');
    expect(settledTool?.kind === 'tool' ? settledTool.running : undefined).toBe(false);
  });

  // `send` drives an existing sub-agent and runs the identical lifecycle: the card must get the
  // same statuses and the same spinner handling, only the label differs.
  test('a send card runs the same lifecycle as a spawn card', () => {
    chatStore.startToolCall(SPAWN_THREAD, 'send-1', 'send', { id: 'subagent/run-1', message: 'again' });
    chatStore.startSpawn(SPAWN_THREAD, 'send-1', {
      subagentId: 'subagent/run-1',
      displayName: 'researcher',
      type: 'research',
      mode: 'session',
      action: 'send',
    });
    const cards = chatStore.spawnCardsOf(SPAWN_THREAD);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: 'send-1', name: 'send', status: 'running', subagentId: 'subagent/run-1' });

    chatStore.settleSpawn(SPAWN_THREAD, 'send-1', { status: 'complete', resultLength: 3 });
    expect(chatStore.spawnCardsOf(SPAWN_THREAD)[0].status).toBe('complete');
    const tool = chatStore.getItems(SPAWN_THREAD).find(item => item.id === 'send-1');
    expect(tool?.kind === 'tool' ? tool.running : undefined).toBe(false);
  });

  test('history replays a terminal send state without a spinner', () => {
    chatStore.seedHistory(SPAWN_THREAD, [{
      role: 'tool',
      id: 'send-history',
      name: 'send',
      args: { id: 'subagent/history', message: 'again' },
      ok: true,
      output: '',
      truncated: false,
      spawn: {
        subagentId: 'subagent/history',
        displayName: 'researcher',
        agentType: 'research',
        mode: 'session',
        action: 'send',
        status: 'error',
        error: 'boom',
        startedAt: '2026-08-24T10:00:00.000Z',
        finishedAt: '2026-08-24T10:00:01.000Z',
      },
      ts: '2026-08-24T10:00:00.000Z',
    }]);
    const card = chatStore.getItems(SPAWN_THREAD)[0];
    expect(card?.kind === 'tool' ? card.running : undefined).toBe(false);
    expect(chatStore.spawnCardsOf(SPAWN_THREAD)[0]).toMatchObject({ status: 'error', error: 'boom' });
  });

  test('a send end clears a reloaded send card even when its start frame was missed', () => {
    chatStore.startToolCall(SPAWN_THREAD, 'send-reloaded', 'send', { id: 'subagent/reloaded', message: 'go' });
    chatStore.settleSpawn(SPAWN_THREAD, 'send-reloaded', { subagentId: 'subagent/reloaded', status: 'aborted' });
    const card = chatStore.getItems(SPAWN_THREAD).find(item => item.id === 'send-reloaded');
    expect(card?.kind === 'tool' ? card.running : undefined).toBe(false);
    expect(chatStore.spawnCardsOf(SPAWN_THREAD)[0]).toMatchObject({ status: 'aborted', subagentId: 'subagent/reloaded' });
  });

  test('startSpawn opens a standalone card for a programmatic spawn', () => {
    chatStore.startSpawn(SPAWN_THREAD, 'subagent/run-2', {
      subagentId: 'subagent/run-2',
      displayName: 'coder',
      type: 'general',
      mode: 'session',
      action: 'spawn',
    });
    const cards = chatStore.spawnCardsOf(SPAWN_THREAD);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('subagent/run-2');
    expect(cards[0].status).toBe('running');
  });

  test('a spawn end clears a reloaded tool card even when its start frame was missed', () => {
    chatStore.startToolCall(SPAWN_THREAD, 'card-reloaded', 'spawn', { name: 'researcher', mode: 'run' });
    chatStore.settleSpawn(SPAWN_THREAD, 'card-reloaded', { subagentId: 'subagent/reloaded', status: 'complete' });
    const card = chatStore.getItems(SPAWN_THREAD).find(item => item.id === 'card-reloaded');
    expect(card?.kind === 'tool' ? card.running : undefined).toBe(false);
    expect(chatStore.spawnCardsOf(SPAWN_THREAD)[0]).toMatchObject({ status: 'complete', subagentId: 'subagent/reloaded' });
  });

  test('history replays the terminal spawn state without a spinner', () => {
    chatStore.seedHistory(SPAWN_THREAD, [{
      role: 'tool',
      id: 'card-history',
      name: 'spawn',
      args: { name: 'researcher', mode: 'run' },
      ok: true,
      output: '',
      truncated: false,
      spawn: {
        subagentId: 'subagent/history',
        displayName: 'researcher',
        agentType: 'research',
        mode: 'run',
        action: 'spawn',
        status: 'complete',
        startedAt: '2026-08-24T10:00:00.000Z',
        finishedAt: '2026-08-24T10:00:01.000Z',
      },
      ts: '2026-08-24T10:00:00.000Z',
    }]);
    const card = chatStore.getItems(SPAWN_THREAD)[0];
    expect(card?.kind === 'tool' ? card.running : undefined).toBe(false);
    expect(chatStore.spawnCardsOf(SPAWN_THREAD)[0]).toMatchObject({ status: 'complete', subagentId: 'subagent/history' });
  });

  // The roster fallback, in the one place that owns it. `chat.spawn.start` is sent once and never
  // replayed, so history from a server that does not persist lifecycle state leaves a running card
  // with no status. The roster is asked for (`subagents.list`), so it still knows the child is going.
  test('the roster recovers a running child on a card history left without a state', () => {
    chatStore.seedHistory(SPAWN_THREAD, [{
      role: 'tool',
      id: 'card-legacy-running',
      name: 'spawn',
      args: { name: 'digger', mode: 'run' },
      ok: false,
      output: '',
      running: true,
      truncated: false,
      ts: '2026-08-24T10:00:00.000Z',
    }]);
    chatStore.reconcileSpawnRoster(SPAWN_THREAD, [{
      id: 'subagent/digger-01',
      threadId: 'subagent/digger-01',
      displayName: 'digger',
      type: 'research',
      status: 'running',
      messageCount: 4,
      visibility: 'private',
      createdAt: '2026-08-24T10:00:00.000Z',
    }]);
    expect(chatStore.spawnCardsOf(SPAWN_THREAD)[0]).toMatchObject({
      subagentId: 'subagent/digger-01',
      status: 'running',
    });
  });

  // A session sub-agent is reusable, so an old settled card naming an agent that is busy again is
  // not a card whose own call is running. `running` on the card is what keeps the two apart.
  test('the roster does not revive a settled card whose named agent is busy again', () => {
    chatStore.seedHistory(SPAWN_THREAD, [{
      role: 'tool',
      id: 'card-settled',
      name: 'spawn',
      args: { name: 'digger', mode: 'run' },
      ok: true,
      output: 'fini',
      truncated: false,
      durationMs: 1200,
      ts: '2026-08-24T10:00:00.000Z',
    }]);
    chatStore.reconcileSpawnRoster(SPAWN_THREAD, [{
      id: 'subagent/digger-02',
      threadId: 'subagent/digger-02',
      displayName: 'digger',
      type: 'research',
      status: 'running',
      messageCount: 1,
      visibility: 'private',
      createdAt: '2026-08-24T10:00:00.000Z',
    }]);
    expect(chatStore.spawnCardsOf(SPAWN_THREAD)[0]?.status).toBeUndefined();
  });

  test('the roster infers nothing for a card whose named agent it does not list', () => {
    chatStore.seedHistory(SPAWN_THREAD, [{
      role: 'tool',
      id: 'card-unknown',
      name: 'spawn',
      args: { name: 'ghost', mode: 'run' },
      ok: false,
      output: '',
      running: true,
      truncated: false,
      ts: '2026-08-24T10:00:00.000Z',
    }]);
    chatStore.reconcileSpawnRoster(SPAWN_THREAD, []);
    expect(chatStore.spawnCardsOf(SPAWN_THREAD)[0]?.status).toBeUndefined();
  });

  test('a legacy running card is not falsely marked complete by an idle roster entry', () => {
    chatStore.seedHistory(SPAWN_THREAD, [{
      role: 'tool',
      id: 'card-legacy',
      name: 'spawn',
      args: { name: 'researcher', mode: 'run' },
      ok: false,
      output: '',
      running: true,
      truncated: false,
      ts: '2026-08-24T10:00:00.000Z',
    }]);
    chatStore.reconcileSpawnRoster(SPAWN_THREAD, [{
      id: 'subagent/legacy',
      threadId: 'subagent/legacy',
      displayName: 'researcher',
      type: 'research',
      status: 'idle',
      messageCount: 2,
      visibility: 'private',
      createdAt: '2026-08-24T10:00:00.000Z',
    }]);
    // On the tool item: `running` is the item's, and it is what `reconcileSpawnRoster` keys off.
    expect(chatStore.getItems(SPAWN_THREAD)[0]).toMatchObject({ running: true });
    expect(chatStore.spawnCardsOf(SPAWN_THREAD)[0]?.status).toBeUndefined();
  });

  test('a delayed spawn start cannot resurrect a terminal card', () => {
    chatStore.startToolCall(SPAWN_THREAD, 'card-order', 'spawn', { name: 'researcher', mode: 'run' });
    chatStore.settleSpawn(SPAWN_THREAD, 'card-order', { subagentId: 'subagent/order', status: 'complete' });
    chatStore.startSpawn(SPAWN_THREAD, 'card-order', {
      subagentId: 'subagent/order',
      displayName: 'researcher',
      type: 'research',
      mode: 'run',
      action: 'spawn',
    });
    expect(chatStore.spawnCardsOf(SPAWN_THREAD)[0]).toMatchObject({ status: 'complete' });
    expect(chatStore.getItems(SPAWN_THREAD)[0]).toMatchObject({ running: false });
  });

  test('clearThread removes the lifecycle state before the thread id is reused', () => {
    chatStore.startSpawn(SPAWN_THREAD, 'subagent/old', {
      subagentId: 'subagent/old',
      displayName: 'old',
      type: 'research',
      mode: 'run',
      action: 'spawn',
    });
    chatStore.clearThread(SPAWN_THREAD);
    expect(chatStore.spawnCardsOf(SPAWN_THREAD)).toHaveLength(0);
  });

  test('settleSpawn on an unknown card is a no-op', () => {
    chatStore.settleSpawn(SPAWN_THREAD, 'nope', { status: 'error' });
    expect(chatStore.spawnCardsOf(SPAWN_THREAD)).toHaveLength(0);
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
