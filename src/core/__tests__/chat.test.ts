import { summarizeArgs } from '../utils';
import { chatStore, isSubAgentTool } from '../chat';
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

  /**
   * A `session.sync` in the middle of a run replays the turn in flight. The window that asks for
   * it is usually the one that was already watching -- a blip, a thread left and reopened, a
   * refresh -- so it still holds the bubble, and the replay carries the whole text rather than the
   * chunks. Appending it is how the answer ended up on screen twice.
   */
  test('a replayed bubble replaces what the window already had, it does not stack onto it', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'un ');
    chatStore.appendDelta(THREAD, 's1', 'deux ');

    chatStore.appendDelta(THREAD, 's1', 'un deux trois', true);

    expect(chatStore.getItems(THREAD)).toHaveLength(1);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ text: 'un deux trois' });
  });

  test('a replay lands whole on a window that never saw the run', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'un deux trois', true);

    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ text: 'un deux trois' });
  });

  test('a live delta still appends: only a replay replaces', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'un ');
    chatStore.appendDelta(THREAD, 's1', 'deux');

    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ text: 'un deux' });
  });

  test('a tool frame missing its args does not become a card that throws on render', () => {
    // parseServerFrame validates `type` and nothing else, so this shape reaches the store. It was
    // then summarizeArgs, deep in a card, that threw -- and the screen boundary took the whole
    // conversation with it, on every open, because the item was in the store.
    chatStore.addToolCall(THREAD, { id: 't-broken', name: 'bash', ok: true, output: 'done', truncated: false, args: undefined as never });

    const card = chatStore.getItems(THREAD).find(item => item.id === 't-broken');
    if (card?.kind !== 'tool') throw new Error('expected a tool card');
    // `toMatchObject({ args: {} })` would pass on undefined too: the point is that a card always
    // hands the render path an object.
    expect(card.args).toEqual({});
    expect(() => summarizeArgs(card.args)).not.toThrow();
  });

  test('a replayed tool card replaces its output too', () => {
    chatStore.startToolCall(THREAD, 't1', 'bash', { command: 'ls' });
    chatStore.appendToolOutput(THREAD, 't1', { stdout: 'ligne un' });
    chatStore.appendToolOutput(THREAD, 't1', { stdout: 'ligne un\nligne deux', replay: true });

    const card = chatStore.getItems(THREAD).find(item => item.id === 't1');
    expect(card).toMatchObject({ output: 'ligne un\nligne deux' });
  });

  test('an abort without a stream still surfaces the error', () => {
    chatStore.abortStream(THREAD, 'a1', 'boom');
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ error: 'boom', streaming: false });
  });

  // A stop settles every streamer of the session, and most of them never opened a bubble here:
  // one per message folded into the running turn. Each used to leave an empty bubble behind, so a
  // single stop read as four of them.
  test('an abort with nothing to say about a bubble we never had leaves nothing behind', () => {
    chatStore.abortStream(THREAD, 'never-opened', undefined);
    expect(chatStore.getItems(THREAD)).toHaveLength(0);
  });

  test('the bubble a stop does end keeps its text and stops spinning', () => {
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'moitie de la reponse');
    chatStore.abortStream(THREAD, 's1', undefined);
    expect(chatStore.getItems(THREAD)).toHaveLength(1);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ text: 'moitie de la reponse', streaming: false });
  });

  test('a send the device refused waits on the user bubble, it is not called lost', () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hi');
    chatStore.markUndelivered(THREAD, 'u1');
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ role: 'user', pending: false, queuedReason: 'undelivered' });
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

describe('sub-agent tools', () => {
  test('a delegated browser task is a sub-agent card, like a spawn and a send', () => {
    // The card is what gives the run a door, a live status and a replay after a reload; a plain
    // tool row has none of those, which is what the browser call was.
    expect(isSubAgentTool('spawn', {})).toBe(true);
    expect(isSubAgentTool('send', {})).toBe(true);
    expect(isSubAgentTool('delegate_browser_task', { url: 'https://a.fr', instructions: 'go' })).toBe(true);
    expect(isSubAgentTool('bash', {})).toBe(false);
  });

  test('the kept windows, asked through the same door, are a plain tool row: no run is started', () => {
    // A sub-agent card with no run behind it would wait for a lifecycle that never comes.
    expect(isSubAgentTool('delegate_browser_task', { kept: 'list' })).toBe(false);
    expect(isSubAgentTool('delegate_browser_task', { kept: 'release', window: 2 })).toBe(false);
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
    chatStore.clearQueued(THREAD, undefined, ['compaction']);
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

describe('an injected send waits for the run to read it, not for it to speak', () => {
  test('the segments of the turn in flight do not lift the badge', () => {
    // The send is parked in the mailbox of a run that is mid-turn. That run keeps talking: the
    // streamer seals a segment and opens another at every reasoning block and after every tool
    // round, and it may answer with a notice too. None of that means it has drained the mailbox.
    chatStore.addUserMessage(THREAD, 'm1', 'en fait, plutot ceci');
    chatStore.markQueued(THREAD, 'm1', 'injection');
    const held = () => chatStore.getItems(THREAD).some(item => item.kind === 'text' && item.queuedSince !== undefined);

    // What the router does on chat.stream.start and chat.message, for the current turn.
    chatStore.clearQueued(THREAD, undefined, ['compaction']);
    expect(held()).toBe(true);

    // The drain: the run reached a turn boundary and read it. This is the real acceptance.
    chatStore.clearQueued(THREAD, 'm1');
    expect(held()).toBe(false);
  });

  test('a compaction hold still goes on any sign of life', () => {
    // The other wait, unchanged: nothing is on the wire during a compaction, so a stream starting
    // is proof it is over -- and three frames clear it so a lost one cannot strand the badge.
    chatStore.addUserMessage(THREAD, 'm1', 'pendant la compaction');
    chatStore.markQueued(THREAD, 'm1', 'compaction');
    chatStore.clearQueued(THREAD, undefined, ['compaction']);
    expect(chatStore.getItems(THREAD).some(item => item.kind === 'text' && item.queuedSince !== undefined)).toBe(false);
  });

  test('a send born while a compaction runs is born parked by it', () => {
    // The bubble must say what it waits for on its first frame. Born without the mark, it was
    // ordered as an ordinary message and jumped under the rule when the ack landed.
    chatStore.setCompacting(THREAD, 1000);
    chatStore.addUserMessage(THREAD, 'm1', 'le vocal pendant la compaction');

    const [item] = chatStore.getItems(THREAD);
    expect(item).toMatchObject({ queuedReason: 'compaction' });
    expect((item as { queuedSince?: number }).queuedSince).toBeGreaterThan(0);

    // The ack the server sends is the no-op it should be: the same mark, not a second one.
    const born = (item as { queuedSince: number }).queuedSince;
    chatStore.markQueued(THREAD, 'm1', 'compaction');
    expect((chatStore.getItems(THREAD)[0] as { queuedSince: number }).queuedSince).toBe(born);
  });

  test('a send born with nothing running carries no wait', () => {
    chatStore.addUserMessage(THREAD, 'm1', 'bonjour');
    const [item] = chatStore.getItems(THREAD);
    expect((item as { queuedSince?: number }).queuedSince).toBeUndefined();
    expect((item as { queuedReason?: string }).queuedReason).toBeUndefined();
  });

  test('a compaction boundary is drawn once, however many times the server names it', () => {
    chatStore.addCompactionBoundary(THREAD, 'e-42', 'ce qui precede', 813);
    // The same cut again: live first, then a history load. One rule, not two.
    chatStore.addCompactionBoundary(THREAD, 'e-42', 'ce qui precede', 813);

    const items = chatStore.getItems(THREAD);
    expect(items).toHaveLength(1);
    const boundary = items[0] as { role?: string; text?: string; summaryOf?: number };
    expect(boundary.summaryOf).toBe(813);
    expect(boundary.text).toBe('ce qui precede');
    // Stored under the role the prompt needs, never drawn as one: `summaryOf` is what ChatScreen
    // routes on, and a count of 0 would be falsy and fall back to a bubble in the owner's voice.
    expect(boundary.role).toBe('user');
    chatStore.addCompactionBoundary(THREAD, 'e-0', 'resume', 0);
    expect((chatStore.getItems(THREAD)[1] as { summaryOf?: number }).summaryOf).toBeTruthy();
  });

  test('a compaction in flight is state on the thread, not a bubble in it', () => {
    // It was a bubble (id `compacting`, streaming, a command): one more live item that every
    // delta re-appended at the end of the thread, that a fresh page dropped and a replay
    // recreated, and that only one frame could ever remove. Two ghosts of it were seen wandering
    // through a run an hour after the compaction had ended. As state there is one per thread by
    // construction, nothing moves it, and several signs of life can end it.
    const started = Date.now() - 42_000;
    chatStore.setCompacting(THREAD, started);
    expect(chatStore.getCompacting(THREAD)).toMatchObject({ since: started });
    expect(chatStore.getItems(THREAD)).toHaveLength(0);

    // A replay names the same start; a second compaction names its own. Last word wins.
    chatStore.setCompacting(THREAD, started + 5_000);
    expect(chatStore.getCompacting(THREAD)).toMatchObject({ since: started + 5_000 });

    chatStore.setCompacting(THREAD, undefined);
    expect(chatStore.getCompacting(THREAD)).toBeUndefined();
  });

  test('the boundary it wrote ends it, even when the end frame was lost', () => {
    // The end travels as one frame and is replayed to nobody once settled. The boundary is also
    // written to history, so it arrives on every path a window can take; a compaction that has
    // produced its boundary is over whatever else was heard.
    chatStore.setCompacting(THREAD, Date.now());
    chatStore.addCompactionBoundary(THREAD, 'e-7', 'ce qui precede', 12);
    expect(chatStore.getCompacting(THREAD)).toBeUndefined();
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['e-7']);
  });

  test('the end of the run and the start of an answer end it too', () => {
    // A compaction runs inside its run (a gate at the start, an overflow retry in the middle) and
    // the summarizer never streams: a run closing or a stream opening on the thread means the
    // operation is behind us, whatever became of its own end frame.
    chatStore.startRun(THREAD, 'r1');
    chatStore.setCompacting(THREAD, Date.now());
    chatStore.endRun(THREAD, 'aborted');
    expect(chatStore.getCompacting(THREAD)).toBeUndefined();

    chatStore.setCompacting(THREAD, Date.now());
    chatStore.startStream(THREAD, 'a1', 'm1');
    expect(chatStore.getCompacting(THREAD)).toBeUndefined();
  });

  test('a fresh page lets go of a compaction, a delta does not', () => {
    // A page that replaces the thread post-dates the compaction (one still running is replayed
    // right after it, which sets the state again). A delta arrives while the server is holding
    // the run's frames back for the compaction: what the state says is still true.
    chatStore.setCompacting(THREAD, 1_800_000_000_000);
    chatStore.handleSyncResult(
      THREAD,
      [{ id: 'u1', role: 'user', text: 'hello', ts: '2026-01-01T00:00:00.000Z' } as HistoryEntry],
      'u1',
      'u1',
      false,
      'unknown-cursor',
    );
    expect(chatStore.getCompacting(THREAD)).toBeUndefined();
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['u1']);

    chatStore.setCompacting(THREAD, 1_800_000_000_000);
    chatStore.handleSyncResult(THREAD, [], 'u1', 'u1', false);
    expect(chatStore.getCompacting(THREAD)).toMatchObject({ since: 1_800_000_000_000 });

    chatStore.clearThread(THREAD);
    expect(chatStore.getCompacting(THREAD)).toBeUndefined();
  });

  test('the notice of the command that started it gives way to the compaction', () => {
    // The server sends `chat.command.pending` after 400ms, and a compaction announces its start
    // once the session log is loaded -- longer than that on a long thread. Either order: one
    // sign of the operation, the compaction's own, and no "Running /compact..." bubble left to
    // outlive it (a successful /compact answers with no bubble, the boundary is its report).
    chatStore.addUserMessage(THREAD, 'send-1', '/compact');
    chatStore.addCommandPending(THREAD, 'send-1', 'Running /compact...');
    chatStore.setCompacting(THREAD, 1_800_000_000_000);
    expect(chatStore.getItems(THREAD).map(item => (item as { text?: string }).text)).toEqual(['/compact']);
    expect(chatStore.getCompacting(THREAD)).toMatchObject({ since: 1_800_000_000_000 });

    chatStore.addCommandPending(THREAD, 'send-1', 'Running /compact...');
    expect(chatStore.getItems(THREAD).map(item => (item as { text?: string }).text)).toEqual(['/compact']);
  });

  test('a compaction that failed still shows the reason it gives', () => {
    // The real order: the server settles the compaction inside a finally, so the state frame
    // always precedes the command's own answer. The refusal lands as its own bubble.
    chatStore.addUserMessage(THREAD, 'send-1', '/compact');
    chatStore.addCommandPending(THREAD, 'send-1', 'Running /compact...');
    chatStore.setCompacting(THREAD, 1_800_000_000_000);
    chatStore.setCompacting(THREAD, undefined);
    chatStore.addCommandResult(THREAD, 'cmd-send-1', 'Compaction failed.', 'send-1');

    const texts = chatStore.getItems(THREAD).map(item => (item.kind === 'text' ? item.text : ''));
    expect(texts).toEqual(['/compact', 'Compaction failed.']);
  });

  test('a compaction boundary does not step over a send parked behind the run', () => {
    // The boundary belongs to the run in flight, like its tool cards, not to the owner. Stored
    // under `role: 'user'`, it would otherwise take the fast path meant for a typed message and
    // land under a bubble that has not started.
    chatStore.addUserMessage(THREAD, 'm1', 'la suite');
    chatStore.markQueued(THREAD, 'm1', 'injection');
    chatStore.addCompactionBoundary(THREAD, 'e-7', 'ce qui precede', 12);

    const ids = chatStore.getItems(THREAD).map(item => item.id);
    expect(ids).toEqual(['e-7', 'm1']);
  });

  test('the end of the run lifts an injection the run never acked', () => {
    // A run can die, or be stopped, without ever reaching the boundary that would have drained
    // its mailbox. chat.run.end clears everything for that reason: it is the backstop.
    chatStore.addUserMessage(THREAD, 'm1', 'jamais lu');
    chatStore.markQueued(THREAD, 'm1', 'injection');
    chatStore.clearQueued(THREAD);
    expect(chatStore.getItems(THREAD).some(item => item.kind === 'text' && item.queuedSince !== undefined)).toBe(false);
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

  test('a replayed chunk whose head the server dropped marks the card truncated', () => {
    // The server caps what it keeps of a run in flight, so a window that reloads mid-`bash` can be
    // handed the tail of an output. `truncated` is what offers the round-trip that fetches the
    // whole thing; without it the card reads as a short, complete output.
    chatStore.startToolCall(THREAD, 'c9', 'bash', { command: 'noisy.sh' });
    chatStore.appendToolOutput(THREAD, 'c9', { stdout: 'tail of it\n', clipped: true });
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ truncated: true, output: 'tail of it\n' });
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

  test('a stopped compaction is carried through as its own rule, empty body included', () => {
    // The boundary's stopped sibling: same rule, same count of turns, no summary -- nothing was
    // folded, so the turns it names are all still there. `compactionStopped` is what labels it
    // "kept" instead of "summarized", and `summaryOf` is what keeps it hoisted out of a run
    // group, so the rule never reads as a bubble in the owner's own voice.
    chatStore.seedHistory(THREAD, [
      { id: 'h-1', role: 'user', text: 'avant', ts: '2026-01-01T00:00:01.000Z' },
      {
        id: 'h-2',
        role: 'user',
        text: '',
        ts: '2026-01-01T00:00:02.000Z',
        summaryOf: 12,
        compactionStopped: true,
      },
    ]);
    const items = chatStore.getItems(THREAD);
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ kind: 'text', summaryOf: 12, compactionStopped: true, text: '' });
    expect(items[0]).not.toHaveProperty('compactionStopped');
  });

  test('a send the server never mirrors is dropped on reset (sync model)', () => {
    // With sync, unmirrored sends are dropped on reset. The old 30s window is gone.
    // A `/status` that the server never journalizes as a turn is lost after a reset.
    chatStore.addUserMessage(THREAD, 'send-3', '/status');
    const page = [{ id: 'h-1' as const, role: 'user' as const, text: 'avant', ts: '2026-01-01T00:00:01.000Z' }];
    chatStore.seedHistory(THREAD, page);
    // The send is dropped because it's not streaming and the server doesn't have it
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['h-1']);
  });

  test('only streaming bubbles survive a reset (sync model)', () => {
    // With sync, sealed (non-streaming) bubbles are dropped on reset.
    // Only actively streaming bubbles survive because they can't be in the server's response.
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'phase une');
    // While streaming, it survives the reset
    chatStore.seedHistory(THREAD, [{ id: 'h-1', role: 'user', text: 'la question', ts: '2026-01-01T00:00:01.000Z' }], true);
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['h-1', 's1']);
    // After sealing (endStream), a reset drops it because it's no longer streaming
    chatStore.endStream(THREAD, 's1');
    chatStore.seedHistory(THREAD, [{ id: 'h-1', role: 'user', text: 'la question', ts: '2026-01-01T00:00:01.000Z' }], true);
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['h-1']);
  });

  test('a card of the turn in progress survives the page', () => {
    chatStore.startToolCall(THREAD, 'call-1', 'bash', { command: 'ls' });
    chatStore.seedHistory(THREAD, [{ id: 'h-1', role: 'user', text: 'la question', ts: '2026-01-01T00:00:01.000Z' }], true);
    // The call started after the assistant message was written, so no page holds it.
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['h-1', 'call-1']);
    expect(chatStore.getItems(THREAD)[1]).toMatchObject({ kind: 'tool', running: true });
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

  test('a command page replaces its live input and answer by their shared ids', () => {
    chatStore.addUserMessage(THREAD, 'send-command', '/compact');
    chatStore.addCommandResult(THREAD, 'cmd-send-command', 'fait', 'send-command');
    chatStore.handleSyncResult(
      THREAD,
      [
        { id: 'send-command', role: 'user', text: '/compact', ts: '2026-01-01T00:00:01.000Z' },
        { id: 'cmd-send-command', role: 'assistant', text: 'fait', command: true, ts: '2026-01-01T00:00:02.000Z' },
      ],
      'cmd-send-command',
      'cmd-send-command',
      false,
      undefined,
    );
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['send-command', 'cmd-send-command']);
  });

  test('a duplicated command result frame is idempotent', () => {
    chatStore.addCommandResult(THREAD, 'cmd-1', 'first');
    chatStore.addCommandResult(THREAD, 'cmd-1', 'second');
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['cmd-1']);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ text: 'second', command: true });
  });

  test('a send during a run is dropped on reset (use delta sync to preserve)', () => {
    // With sync, sends during a run should use delta mode (handleSyncResult with no reset).
    // A reset (seedHistory) drops non-streaming items.
    chatStore.seedRuns([THREAD]);
    chatStore.addUserMessage(THREAD, 'send-2', 'pendant la compaction');
    chatStore.seedHistory(THREAD, [{ id: 'h-1', role: 'user', text: 'tour precedent', ts: '2026-01-01T00:00:01.000Z' }]);
    // The send is dropped because it's not streaming and the server's reset doesn't have it
    expect(chatStore.getItems(THREAD).map(item => item.id)).toEqual(['h-1']);
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

describe('seedHistory during a live run', () => {
  const T = 'thread-reseed-live';

  afterEach(() => chatStore.clearThread(T));

  // With sync, sealed phases are dropped on reset. The server should include them in a delta
  // sync, not a reset. This tests the new reset behavior.
  it('drops sealed phases on reset (use delta sync to preserve)', () => {
    chatStore.startRun(T);
    chatStore.addAgentMessage(T, 'phase-1', 'first I check the cache', []);
    chatStore.seedHistory(T, [
      { id: 'h-0', role: 'user', text: 'why is it slow', ts: '2026-01-01T10:00:00.000Z' },
    ]);
    const texts = chatStore.getItems(T).map(item => (item.kind === 'text' ? item.text : ''));
    // With sync reset, sealed phases are dropped (only streaming survives)
    expect(texts).toContain('why is it slow');
    expect(texts).not.toContain('first I check the cache');
  });

  // Once the run is over the session is the truth, and a bubble it does not carry is one the server
  // will never mirror: keeping it would pin it to the end of the thread for good.
  it('drops them once the run has ended', () => {
    chatStore.startRun(T);
    chatStore.addAgentMessage(T, 'phase-1', 'first I check the cache', []);
    chatStore.endRun(T);
    chatStore.seedHistory(T, [
      { id: 'h-0', role: 'user', text: 'why is it slow', ts: '2026-01-01T10:00:00.000Z' },
    ]);
    const texts = chatStore.getItems(T).map(item => (item.kind === 'text' ? item.text : ''));
    expect(texts).not.toContain('first I check the cache');
  });
});

describe('handleSyncResult: a reload mid-run', () => {
  const T = 'thread-reload';

  afterEach(() => chatStore.clearThread(T));

  /**
   * Captured against a live server: two session.sync requests race out of a reload with the same
   * null cursor, so the second re-delivers a page the live tool card already sits behind. Appending
   * it blind hoisted the card above the user bubble it answers.
   */
  test('a page re-delivered under a live tool card leaves it last', () => {
    const page = [
      { id: 'e-user', role: 'user' as const, text: 'run something slow', ts: '2026-01-01T00:00:00.000Z', attachments: [] },
      { id: 'e-agent', role: 'assistant' as const, text: '', ts: '2026-01-01T00:00:03.000Z', attachments: [] },
    ];
    chatStore.handleSyncResult(T, page, 'e-agent', 'e-agent', true, undefined);
    chatStore.startToolCall(T, 'call-live', 'bash', { command: 'sleep 30' });
    // The second request, still carrying the null cursor: the same page all over again.
    chatStore.handleSyncResult(T, page, 'e-agent', 'e-agent', true, undefined);

    expect(chatStore.getItems(T).map(item => item.id)).toEqual(['e-user', 'e-agent', 'call-live']);
  });

  test('a streaming bubble stays under the entries a duplicate page re-delivers', () => {
    const page = [
      { id: 'e-user', role: 'user' as const, text: 'hello', ts: '2026-01-01T00:00:00.000Z', attachments: [] },
    ];
    chatStore.handleSyncResult(T, page, 'e-user', 'e-user', true, undefined);
    chatStore.startStream(T, 'stream-1');
    chatStore.appendDelta(T, 'stream-1', 'thinking');
    chatStore.handleSyncResult(T, page, 'e-user', 'e-user', true, undefined);

    expect(chatStore.getItems(T).map(item => item.id)).toEqual(['e-user', 'stream-1']);
  });

  test('an older page delivered twice stays where it was, instead of jumping below the newer one', () => {
    // The general shape of the same race: a delta replaces matching ids by dropping them and
    // re-appending at the end, so a page the thread already holds does not settle in place, it
    // moves. Two exchanges become one conversation read backwards -- the first question landing
    // under the answer to the second.
    const first = [
      { id: 'u-1', role: 'user' as const, text: 'premiere question', ts: '2026-01-01T00:00:00.000Z', attachments: [] },
      { id: 'a-1', role: 'assistant' as const, text: 'premiere reponse', ts: '2026-01-01T00:00:01.000Z', attachments: [] },
    ];
    chatStore.handleSyncResult(T, first, 'a-1', 'a-1', false, undefined);
    chatStore.handleSyncResult(
      T,
      [
        { id: 'u-2', role: 'user' as const, text: 'seconde question', ts: '2026-01-01T00:00:02.000Z', attachments: [] },
        { id: 'a-2', role: 'assistant' as const, text: 'seconde reponse', ts: '2026-01-01T00:00:03.000Z', attachments: [] },
      ],
      'a-2',
      'a-2',
      false,
      undefined,
    );
    expect(chatStore.getItems(T).map(item => item.id)).toEqual(['u-1', 'a-1', 'u-2', 'a-2']);

    // The racing request, still carrying the null cursor it left with.
    chatStore.handleSyncResult(T, first, 'a-2', 'a-2', false, undefined);

    expect(chatStore.getItems(T).map(item => item.id)).toEqual(['u-1', 'a-1', 'u-2', 'a-2']);
  });

  test('a card re-delivered with its result settles in place, it does not move to the end', () => {
    chatStore.handleSyncResult(
      T,
      [
        { id: 'call-1', role: 'tool', ts: '2026-01-01T00:00:01.000Z', name: 'bash', args: {}, output: '', ok: true, attachments: [] } as never,
        { id: 'a-after', role: 'assistant', text: 'suite', ts: '2026-01-01T00:00:02.000Z', attachments: [] },
      ],
      'a-after',
      'a-after',
      false,
      undefined,
    );

    // The same card, now carrying its output: replacing it must not reorder the thread.
    chatStore.handleSyncResult(
      T,
      [{ id: 'call-1', role: 'tool', ts: '2026-01-01T00:00:01.000Z', name: 'bash', args: {}, output: 'done', ok: true, attachments: [] } as never],
      'a-after',
      'a-after',
      false,
      undefined,
    );

    const items = chatStore.getItems(T);
    expect(items.map(item => item.id)).toEqual(['call-1', 'a-after']);
    expect(items[0]).toMatchObject({ output: 'done' });
  });

  test('a settled card is not treated as live, so a later delta still lands after it', () => {
    chatStore.handleSyncResult(
      T,
      [{ id: 'call-1', role: 'tool', ts: '2026-01-01T00:00:01.000Z', name: 'bash', args: {}, output: 'done', ok: true, attachments: [] } as never],
      'call-1',
      'call-1',
      true,
      undefined,
    );
    chatStore.handleSyncResult(
      T,
      [{ id: 'e-next', role: 'assistant', text: 'and here is why', ts: '2026-01-01T00:00:02.000Z', attachments: [] }],
      'e-next',
      'e-next',
      false,
      undefined,
    );

    expect(chatStore.getItems(T).map(item => item.id)).toEqual(['call-1', 'e-next']);
  });
});

describe('handleSyncResult: tool cards in flight', () => {
  const T = 'thread-tool-sync';
  
  afterEach(() => chatStore.clearThread(T));

  test('a running tool card survives a sync delta and is replaced when settled', () => {
    // 1. A tool card starts running mid-run
    chatStore.startToolCall(T, 'call-1', 'bash', { command: 'sleep 10' });
    expect(chatStore.getItems(T)).toHaveLength(1);
    expect(chatStore.getItems(T)[0]).toMatchObject({ kind: 'tool', id: 'call-1', running: true });

    // 2. A sync result arrives mid-run (delta, no reset)
    // The server doesn't have the tool yet (still running), so entries is empty or has other items
    chatStore.handleSyncResult(
      T,
      [{ id: 'h-1', role: 'user', text: 'run something slow', ts: '2026-01-01T00:00:00.000Z', attachments: [] }],
      'h-1', // head
      'h-1', // leaf
      true,  // activeRun
      undefined, // no reset = delta
    );
    
    // The running card must survive (it's not in the server's entries, so it would be lost on reset)
    // With delta mode, new entries are appended, existing items with matching ids are replaced
    const itemsAfterDelta = chatStore.getItems(T);
    expect(itemsAfterDelta.map(i => i.id)).toContain('call-1');
    expect(itemsAfterDelta.find(i => i.id === 'call-1')).toMatchObject({ kind: 'tool', running: true });

    // 3. The settled entry arrives in a subsequent delta
    chatStore.handleSyncResult(
      T,
      [{
        id: 'call-1',
        role: 'tool',
        ts: '2026-01-01T00:00:05.000Z',
        name: 'bash',
        args: { command: 'sleep 10' },
        ok: true,
        output: 'done',
        truncated: false,
        durationMs: 5000,
      }],
      'call-1', // head
      'call-1', // leaf
      false,    // run ended
      undefined, // no reset = delta
    );

    // 4. The card must be replaced, not duplicated
    const finalItems = chatStore.getItems(T);
    const toolCards = finalItems.filter(i => i.id === 'call-1');
    expect(toolCards).toHaveLength(1);
    const settledCard = toolCards[0]!;
    expect(settledCard).toMatchObject({
      kind: 'tool',
      id: 'call-1',
      ok: true,
      output: 'done',
      durationMs: 5000,
    });
    // running should be falsy (undefined or false), not true
    expect(settledCard.kind === 'tool' && settledCard.running).toBeFalsy();
  });

  test('a running tool card outlives a reset because the server has not seen it yet', () => {
    // A tool card starts but then a reset happens (unknown-cursor or branch-switch)
    chatStore.startToolCall(T, 'call-2', 'read', { path: '/etc/hosts' });
    expect(chatStore.getItems(T)[0]).toMatchObject({ kind: 'tool', running: true });

    // A reset arrives, but the running card is not in the server's entries yet. The run is still
    // answering, which is the only thing that makes the card live rather than abandoned.
    chatStore.handleSyncResult(
      T,
      [{ id: 'h-1', role: 'user', text: 'hello', ts: '2026-01-01T00:00:00.000Z', attachments: [] }],
      'h-1',
      'h-1',
      true,
      'unknown-cursor', // reset
    );

    // Running tool card survives a reset (it's still running, server doesn't have it yet)
    const items = chatStore.getItems(T);
    expect(items.find(i => i.id === 'call-2')).toMatchObject({ kind: 'tool', running: true });
  });

  test('the same reset, with no run answering, settles that card instead of keeping its spinner', () => {
    // `activeRun: false` is the server saying nothing is executing on this thread, so a card the
    // page does not carry is one whose result frame was lost with the run. Kept running it spun
    // for good and counted from its own start against the current clock.
    chatStore.startToolCall(T, 'call-3', 'read', { path: '/etc/hosts' });
    chatStore.handleSyncResult(
      T,
      [{ id: 'h-1', role: 'user', text: 'hello', ts: '2026-01-01T00:00:00.000Z', attachments: [] }],
      'h-1',
      'h-1',
      false,
      'unknown-cursor',
    );
    expect(chatStore.getItems(T).find(i => i.id === 'call-3')).toMatchObject({
      kind: 'tool',
      running: false,
      interrupted: true,
    });
  });
});

describe('chatStore run grouping', () => {
  const runEntry = (id: string, status: 'running' | 'done' | 'aborted' | 'error', ts = '2026-01-01T00:00:00.000Z'): HistoryEntry =>
    ({
      id,
      role: 'assistant',
      text: 'x',
      ts,
      run: { id, status, startTs: ts, ...(status === 'running' ? {} : { endTs: '2026-01-01T00:01:00.000Z' }) },
    }) as HistoryEntry;

  test('items created during a run carry the open run and seal on end', () => {
    chatStore.startRun(THREAD);
    chatStore.startStream(THREAD, 's1');
    chatStore.addToolCall(THREAD, { id: 'c1', name: 'bash', args: {}, ok: true, output: 'o', truncated: false });
    // The synthetic run is live until the server's id lands.
    const before = chatStore.getItems(THREAD);
    expect(before.every(i => i.run?.id.startsWith('live-'))).toBe(true);
    expect(before.every(i => i.run?.status === 'running')).toBe(true);

    chatStore.endRun(THREAD, 'done');
    const after = chatStore.getItems(THREAD);
    expect(after.every(i => i.run?.status === 'done')).toBe(true);
    expect(after.every(i => i.run?.endTs !== undefined)).toBe(true);
    expect(chatStore.hasActiveRun(THREAD)).toBe(false);
  });

  test('a start frame that names the run gives the live items that name at once, and the page agrees without renaming', () => {
    // Since server 0.6.3 the run_start marker carries the same id chat.run.start announced, so
    // what is painted live and what the page holds name the run alike from the first frame.
    chatStore.startRun(THREAD, 'c0ffee42');
    chatStore.startToolCall(THREAD, 'c1', 'bash', { command: 'ls' });
    expect(chatStore.getItems(THREAD).every(i => i.run?.id === 'c0ffee42')).toBe(true);
    chatStore.handleSyncResult(THREAD, [runEntry('c0ffee42', 'running')], 'c0ffee42', null, true);
    expect(chatStore.getItems(THREAD).every(i => i.run?.id === 'c0ffee42')).toBe(true);
    chatStore.endRun(THREAD, 'done');
    expect(new Set(chatStore.getItems(THREAD).map(i => i.run?.id))).toEqual(new Set(['c0ffee42']));
  });

  test('a start frame id from an older server, whose pages name runs otherwise, is still renamed by the page', () => {
    chatStore.startRun(THREAD, 'deadbeef');
    chatStore.startStream(THREAD, 's1');
    chatStore.handleSyncResult(THREAD, [runEntry('run-1', 'running')], 'run-1', null, true);
    expect(chatStore.getItems(THREAD).every(i => i.run?.id === 'run-1')).toBe(true);
  });

  test('a sync page adopts the server run id, renaming synthetic items', () => {
    chatStore.startRun(THREAD);
    chatStore.startStream(THREAD, 's1');
    chatStore.handleSyncResult(THREAD, [runEntry('run-1', 'running')], 'run-1', null, true);
    const items = chatStore.getItems(THREAD);
    expect(items[0]).toMatchObject({ run: { id: 'run-1', status: 'running' } });
    expect(items.every(i => i.run?.id === 'run-1')).toBe(true);
  });

  test('incoming terminal entries win over a stale live running state', () => {
    chatStore.startRun(THREAD);
    chatStore.startStream(THREAD, 's1');
    chatStore.handleSyncResult(THREAD, [runEntry('run-1', 'error')], 'run-1', null, false);
    const items = chatStore.getItems(THREAD);
    expect(items[0]).toMatchObject({ run: { id: 'run-1', status: 'error' } });
    expect(chatStore.hasActiveRun(THREAD)).toBe(false);
  });

  test('a page that closes the run gives what was painted live the server run: one id, one duration', () => {
    // Seen on a real thread: the tool cards painted live kept a synthetic run (and a stale one, whose
    // start was a question earlier), the phases came back from the page under the server run, and
    // the same run drew as three groups, one of them "52 min" long inside a 7-minute answer. The
    // rename only ran while the run was still in flight; a page arriving after its end never did it.
    chatStore.startRun(THREAD);
    chatStore.startStream(THREAD, 's1');
    chatStore.addToolCall(THREAD, { id: 'c1', name: 'web_search', args: {}, ok: true, output: 'o', truncated: false });
    chatStore.handleSyncResult(THREAD, [runEntry('run-1', 'done')], 'run-1', null, false);
    const items = chatStore.getItems(THREAD);
    expect(items.length).toBe(3);
    expect(items.every(i => i.run?.id === 'run-1')).toBe(true);
    expect(items.every(i => i.run?.status === 'done')).toBe(true);
    expect(items.every(i => i.run?.endTs === Date.parse('2026-01-01T00:01:00.000Z'))).toBe(true);
    expect(chatStore.hasActiveRun(THREAD)).toBe(false);
  });

  test('a tool card arriving with no run open gets a run of its own, and folds with the rest once the end lands', () => {
    // Seen on a phone: one expanded card standing between two folded groups of the same run. The
    // server of the day had ended the run early (once per message folded into it), so the cards
    // painted after that had no run to belong to, and nothing ever grouped them.
    chatStore.startToolCall(THREAD, 'c1', 'bash', { command: 'ls' });
    expect(chatStore.hasActiveRun(THREAD)).toBe(true);
    chatStore.addToolCall(THREAD, { id: 'c1', name: 'bash', args: {}, ok: true, output: 'o', truncated: false });
    chatStore.startStream(THREAD, 's1');
    const live = chatStore.getItems(THREAD);
    expect(live.every(i => i.run?.id.startsWith('live-') && i.run.status === 'running')).toBe(true);
    expect(new Set(live.map(i => i.run?.id)).size).toBe(1);

    chatStore.endRun(THREAD, 'done');
    expect(chatStore.getItems(THREAD).every(i => i.run?.status === 'done')).toBe(true);
  });

  test('a history page without activeRun settles a trailing running run as done', () => {
    chatStore.seedHistory(THREAD, [runEntry('run-1', 'done'), runEntry('run-2', 'running')], false);
    const items = chatStore.getItems(THREAD);
    // The server marked the last run running, but no run is active: its end was lost, so it
    // closes as done and the finished run before it stays untouched.
    expect(items[0]).toMatchObject({ run: { id: 'run-1', status: 'done' } });
    expect(items[1]).toMatchObject({ run: { status: 'done' } });
    expect(chatStore.hasActiveRun(THREAD)).toBe(false);
  });

  test('a history page opened mid-run keeps the run open and adopts its id', () => {
    chatStore.seedHistory(THREAD, [runEntry('run-1', 'running')], true);
    expect(chatStore.hasActiveRun(THREAD)).toBe(true);
    // Frames that follow paint under the same run.
    chatStore.startStream(THREAD, 's1');
    expect(chatStore.getItems(THREAD)[1]).toMatchObject({ run: { id: 'run-1' } });
  });

  test('seedRuns settles the open run of a thread the server no longer lists', () => {
    chatStore.startRun(THREAD);
    chatStore.startStream(THREAD, 's1');
    chatStore.seedRuns([]);
    expect(chatStore.hasActiveRun(THREAD)).toBe(false);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ run: { status: 'done' } });
  });

  test('an abort seals its run as aborted', () => {
    chatStore.startRun(THREAD);
    chatStore.startStream(THREAD, 's1');
    chatStore.endRun(THREAD, 'aborted');
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ run: { status: 'aborted' } });
  });
});

describe('a parked send holds the bottom of the thread', () => {
  const ids = (): string[] => chatStore.getItems(THREAD).map(item => item.id);

  /** What the server does when a send lands mid-run: park it, keep calling tools. */
  function parkDuringRun(): void {
    chatStore.startToolCall(THREAD, 't-1', 'bash', { command: 'first' });
    chatStore.addUserMessage(THREAD, 'm1', 'wait, do this instead');
    chatStore.markQueued(THREAD, 'm1', 'injection');
  }

  test('the tool cards of the run it interrupted stay above it', () => {
    parkDuringRun();
    // The run had not finished: these cards belong to the turn before the message.
    chatStore.startToolCall(THREAD, 't-2', 'read', { path: '/tmp/a' });
    chatStore.startToolCall(THREAD, 't-3', 'read', { path: '/tmp/b' });
    expect(ids()).toEqual(['t-1', 't-2', 't-3', 'm1']);
  });

  test('what the run says while the message waits stays above it too', () => {
    parkDuringRun();
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'still on the previous request');
    chatStore.endStream(THREAD, 's1');
    expect(ids()).toEqual(['t-1', 's1', 'm1']);
  });

  test('once drained, the answer to it lands below it', () => {
    parkDuringRun();
    chatStore.startToolCall(THREAD, 't-2', 'read', { path: '/tmp/a' });
    // chat.send.acked: the run reached the turn boundary and took the message.
    chatStore.clearQueued(THREAD, 'm1');
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'on it');
    chatStore.endStream(THREAD, 's1');
    chatStore.startToolCall(THREAD, 't-9', 'bash', { command: 'the new work' });
    expect(ids()).toEqual(['t-1', 't-2', 'm1', 's1', 't-9']);
  });

  test('the owner typing again lands after the message already parked, never before it', () => {
    parkDuringRun();
    chatStore.addUserMessage(THREAD, 'm2', 'and this too');
    chatStore.markQueued(THREAD, 'm2', 'injection');
    // Both wait, in the order they were typed, and the run keeps working above both.
    chatStore.startToolCall(THREAD, 't-2', 'read', { path: '/tmp/a' });
    expect(ids()).toEqual(['t-1', 't-2', 'm1', 'm2']);
  });

  test('a message mirrored from another window also lands last', () => {
    parkDuringRun();
    chatStore.echoUserMessage(THREAD, 'm2', 'from the phone');
    expect(ids()).toEqual(['t-1', 'm1', 'm2']);
  });

  test('nothing parked, nothing moved: arrival order is still the order', () => {
    chatStore.addUserMessage(THREAD, 'm1', 'do this');
    chatStore.startStream(THREAD, 's1');
    chatStore.appendDelta(THREAD, 's1', 'here');
    chatStore.endStream(THREAD, 's1');
    chatStore.startToolCall(THREAD, 't-1', 'bash', { command: 'work' });
    expect(ids()).toEqual(['m1', 's1', 't-1']);
  });

  test('a history delta of the running turn does not hoist itself above the waiting message', () => {
    // The same trap the live path had, by another road: a delta is newer than what is persisted
    // but not newer than a send the server is still holding in a mailbox.
    parkDuringRun();
    chatStore.handleSyncResult(THREAD, [toolEntry], null, null, true);
    expect(ids()[ids().length - 1]).toBe('m1');
  });

  test('a reset keeps the waiting message instead of dropping it', () => {
    // Branch switch or unknown cursor: the server replaces the thread. It cannot send back a
    // message it has not written yet, so dropping every local item took the bubble with it.
    parkDuringRun();
    chatStore.handleSyncResult(THREAD, [toolEntry], null, null, true, 'branch-switch');
    expect(ids()).toContain('m1');
    expect(ids()[ids().length - 1]).toBe('m1');
  });
});

describe('a send waits for its receipt', () => {
  // A socket a NAT timeout or a VPN switch killed stays OPEN for the browser: the send left, the
  // server never got it, and nothing said so. The server receipts every send (0.6.3); a bubble
  // still waiting after the delay is marked undelivered, and the app retries it on its own rather
  // than leave the owner a verdict to clear by hand (2026-09-16).
  afterEach(() => {
    jest.useRealTimers();
  });
  const textAt = (index: number) => {
    const item = chatStore.getItems(THREAD)[index];
    return item?.kind === 'text' ? item : undefined;
  };

  test('the receipt lifts the wait; none within the delay leaves the bubble waiting, and retrying', () => {
    jest.useFakeTimers();
    chatStore.addUserMessage(THREAD, 'u1', 'hello');
    chatStore.expectReceipt(THREAD, 'u1', 15_000);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ pending: true });

    chatStore.markDelivered(THREAD, 'u1');
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ pending: false });
    jest.advanceTimersByTime(20_000);
    expect(textAt(0)?.error).toBeUndefined();
    expect(textAt(0)?.queuedReason).toBeUndefined();

    chatStore.addUserMessage(THREAD, 'u2', 'lost');
    chatStore.expectReceipt(THREAD, 'u2', 15_000);
    jest.advanceTimersByTime(14_999);
    expect(textAt(1)?.queuedReason).toBeUndefined();
    jest.advanceTimersByTime(1);
    expect(chatStore.getItems(THREAD)[1]).toMatchObject({ pending: false, queuedReason: 'undelivered' });
    // The failure is not a verdict: nothing to clear by hand, and the retry does not restart the
    // clock the bubble counts its wait from.
    const waitedSince = textAt(1)?.queuedSince;
    chatStore.expectReceipt(THREAD, 'u2', 15_000);
    jest.advanceTimersByTime(15_000);
    expect(textAt(1)?.queuedSince).toBe(waitedSince);
    expect(chatStore.getItems(THREAD)[1]).toMatchObject({ queuedReason: 'undelivered' });
  });

  test('sending again waits anew, and a late receipt for the first try settles the bubble', () => {
    jest.useFakeTimers();
    chatStore.addUserMessage(THREAD, 'u1', 'hello');
    chatStore.expectReceipt(THREAD, 'u1', 15_000);
    jest.advanceTimersByTime(15_000);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ queuedReason: 'undelivered' });

    chatStore.expectReceipt(THREAD, 'u1', 15_000);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ pending: true, queuedReason: 'undelivered' });
    // No timer is left for this one: the first try did reach the server, and the bubble goes back
    // to being an answered message rather than sitting under a mark nothing would clear.
    chatStore.markDelivered(THREAD, 'u1');
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ pending: false });
    expect(textAt(0)?.queuedReason).toBeUndefined();
    expect(textAt(0)?.queuedSince).toBeUndefined();
  });

  test('a receipt for a bubble nobody waits on, or that is gone, changes nothing', () => {
    chatStore.addUserMessage(THREAD, 'u1', 'hello');
    chatStore.markDelivered(THREAD, 'u1');
    chatStore.markDelivered(THREAD, 'ghost');
    expect(chatStore.getItems(THREAD)).toHaveLength(1);
    expect(textAt(0)?.pending).toBeUndefined();
  });

  test('a socket that refuses the frame stops the wait: one state, not two', () => {
    jest.useFakeTimers();
    chatStore.addUserMessage(THREAD, 'u1', 'hello');
    chatStore.expectReceipt(THREAD, 'u1', 15_000);
    chatStore.markUndelivered(THREAD, 'u1');
    jest.advanceTimersByTime(20_000);
    expect(chatStore.getItems(THREAD)[0]).toMatchObject({ pending: false, queuedReason: 'undelivered' });
    expect(textAt(0)?.error).toBeUndefined();
  });
});

/**
 * The order a sync lands entries in -- measured on a real thread (2026-09-10).
 *
 * The owner saw the last message of a run inside the collapsed group that stands for its work,
 * with the group drawn after it. The server's page was correct (`user > header > answer`, replayed
 * from the log): what reordered it was this store. Two ways in, one defect -- an entry that belongs
 * in the middle of the thread was placed after the answer.
 */
describe('handleSyncResult: where a sync puts what it carries', () => {
  const T = 'thread-order';

  afterEach(() => chatStore.clearThread(T));

  const at = (s: number): string => `2026-09-10T09:${String(s).padStart(2, '0')}:00.000Z`;
  const runMeta = { id: 'runA', status: 'done' as const, startTs: at(43), endTs: at(58) };
  const withRun = { run: runMeta };
  const user = { id: 'u1', role: 'user' as const, text: 'go', ts: at(43), attachments: [] };
  const tool = (n: number, extra: Record<string, unknown> = {}) => ({
    id: `t${n}`,
    role: 'tool' as const,
    name: 'bash',
    args: { command: 'x' },
    durationMs: 3,
    ok: true,
    output: 'ok',
    truncated: false,
    ts: at(44 + n),
    ...withRun,
    ...extra,
  });
  const interim = { id: 'p-interim', role: 'assistant' as const, text: 'Rouge attendu.', ts: at(53), attachments: [], ...withRun };
  const answer = { id: 'p-answer', role: 'assistant' as const, text: 'Release 0.7.7 ?', ts: at(58), attachments: [], ...withRun };
  /** The run's work as the server folds it: a header standing for the entries it hides. */
  const header = {
    id: 'run-u1',
    role: 'run' as const,
    ts: at(44),
    run: runMeta,
    toolCount: 2,
    firstTool: 'bash',
    itemCount: 3,
    lastId: 'p-answer',
  };

  /**
   * A folded header is always an id the thread does not hold yet, and its place is where the run
   * began. Appending it as a fresh entry put it after the answer: the reader got the group *below*
   * the message it belongs to.
   */
  test('a folded header arriving in a delta lands at the run it stands for, not after the answer', () => {
    chatStore.handleSyncResult(T, [user, tool(1), tool(2), interim, answer], 'h', 'l', false);
    chatStore.handleSyncResult(T, [header], 'h2', 'l2', false);

    const ids = chatStore.getItems(T).map(item => item.id);
    expect(ids.indexOf('run-u1')).toBeGreaterThan(ids.indexOf('u1'));
    expect(ids.indexOf('run-u1')).toBeLessThan(ids.indexOf('p-answer'));
  });

  /**
   * The other way in, and the one the owner hit: `applyWindow` keeps what only this device holds
   * yet, and a tool card still marked `running` from a run that has since been folded is not that.
   * It was re-appended after the page, and `buildRows` then saw a card as the last item of the run
   * -- so the answer was swallowed into the group instead of standing below it.
   */
  test('a card still running when its run was folded is let go, not re-appended after the answer', () => {
    // The run in flight, as it is while it runs: the page carries it `running`, so the card the
    // live frame opens belongs to it and not to a synthetic run of its own.
    const inFlight = { id: 'runA', status: 'running' as const, startTs: at(43) };
    chatStore.handleSyncResult(T, [{ ...user }, { ...tool(1), run: inFlight, running: true }], 'h', 'l', true);
    chatStore.startToolCall(T, 't-spin', 'bash', { command: 'tail -f' });

    // The run is over and the next page carries it folded.
    chatStore.handleSyncResult(T, [user, header, answer], 'h2', 'l2', false, undefined, undefined, true, 81);

    const ids = chatStore.getItems(T).map(item => item.id);
    expect(ids).not.toContain('t-spin');
    expect(ids.indexOf('run-u1')).toBeLessThan(ids.indexOf('p-answer'));
  });
});

/**
 * The thinking span as the history carries it -- added 2026-09-11.
 *
 * The span used to exist only in the app's memory: reopened, a thread showed every thought as an
 * untimed aside, and the reloaded phase read `0s` when the live one had a counter.
 */
describe('a replayed phase keeps how long it thought', () => {
  const T = 'thread-thinking';

  afterEach(() => chatStore.clearThread(T));

  test('the duration the server recorded lands on the bubble', () => {
    chatStore.handleSyncResult(T, [{
      id: 'e-phase',
      role: 'assistant',
      text: 'the answer',
      ts: '2026-09-11T21:00:00.000Z',
      attachments: [],
      reasoning: 'weighing it',
      reasoningMs: 4200,
    }], 'e-phase', 'e-phase', false);

    const [item] = chatStore.getItems(T);
    expect(item).toMatchObject({ kind: 'text', reasoning: 'weighing it', reasoningMs: 4200 });
  });

  test('a phase the server wrote without a span carries none, rather than a zero', () => {
    chatStore.handleSyncResult(T, [{
      id: 'e-old',
      role: 'assistant',
      text: 'the answer',
      ts: '2026-09-11T21:00:00.000Z',
      attachments: [],
      reasoning: 'weighing it',
    }], 'e-old', 'e-old', false);

    expect(chatStore.getItems(T)[0]).toMatchObject({ kind: 'text', reasoning: 'weighing it' });
    expect((chatStore.getItems(T)[0] as { reasoningMs?: number }).reasoningMs).toBeUndefined();
  });
});
