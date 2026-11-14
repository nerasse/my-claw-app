import { chatStore } from '../chat';
import { msOf } from '../utils';

/**
 * The stamps a thread does arithmetic on.
 *
 * Measured 2026-11-14, on a live run: the header of the fold read `running · 0 ms` and, once the
 * first card in it settled, `running · NaN h`. Three holes, one type:
 *
 * - `addToolCall` spread the whole `chat.tool` frame onto the card, and that frame stamps `ts` as
 *   an **ISO string**. `ts` is typed `number`, so nothing complained, and every reader that
 *   subtracted from it got `NaN` -- the fold's live clock, the day dividers, a thought's hour.
 * - `startStream` dated a bubble from its parent with `parent.ts + 1`, which is a concatenation
 *   when the parent's stamp is that same string: `2026-11-14T21:27:07.504Z1`.
 * - The counters themselves captured "now" once at mount, so a component mounted before its
 *   instant existed read a negative delta and drew `0 ms` for as long as it lived.
 *
 * Everything here is about the first two; the third is `useElapsed`, pinned in its own test.
 */

beforeEach(() => chatStore.clearAll());

test('a settled tool card keeps the numeric stamp it was opened with', () => {
  const T = 'stamp-tool';
  chatStore.addUserMessage(T, 'u1', 'go');
  chatStore.startRun(T, 'r1');
  chatStore.startToolCall(T, 'c1', 'bash', { command: 'ls' });
  const opened = chatStore.getItems(T).find(item => item.id === 'c1')!;

  // The settle frame the server sends, verbatim: same id, and its own ISO `ts`.
  chatStore.addToolCall(T, {
    id: 'c1',
    name: 'bash',
    args: { command: 'ls' },
    ok: true,
    output: 'x',
    truncated: false,
    ts: '2026-11-14T21:26:35.361Z',
    turnId: 'r1',
  } as never);

  const settled = chatStore.getItems(T).find(item => item.id === 'c1')!;
  expect(typeof settled.ts).toBe('number');
  expect(settled.ts).toBe(opened.ts);
});

test('a bubble opened under a card stamped as a string is still dated as a number', () => {
  const T = 'stamp-parent';
  chatStore.addUserMessage(T, 'u1', 'go');
  chatStore.startRun(T, 'r1');
  chatStore.startToolCall(T, 'c1', 'bash', { command: 'ls' });
  // A parent's stamp forced to the shape the wire can produce, so the concatenation would show.
  const items = chatStore.getItems(T);
  const patched = items.map(item => (item.id === 'c1' ? { ...item, ts: '2026-11-14T21:26:35.361Z' as never } : item));
  (chatStore as unknown as { threads: Map<string, typeof patched> }).threads.set(T, patched);

  chatStore.startStream(T, 'b1', 'c1');
  const bubble = chatStore.getItems(T).find(item => item.id === 'b1')!;
  expect(typeof bubble.ts).toBe('number');
  expect(Number.isFinite(bubble.ts)).toBe(true);
});

test('the live fold of a run whose first card settled reads a real span, not NaN', () => {
  const T = 'stamp-group';
  chatStore.addUserMessage(T, 'u1', 'go');
  chatStore.startRun(T, 'r1');
  chatStore.startToolCall(T, 'c1', 'bash', { command: 'ls' });
  chatStore.addToolCall(T, {
    id: 'c1', name: 'bash', args: { command: 'ls' }, ok: true, output: 'x', truncated: false,
    ts: new Date().toISOString(), turnId: 'r1',
  } as never);
  chatStore.startToolCall(T, 'c2', 'bash', { command: 'pwd' });

  // What `RunGroup` reads to date its segment, on a group whose first card came from a frame.
  const first = chatStore.getItems(T).find(item => item.id === 'c1')!;
  expect(msOf(first.ts as never)).toBeDefined();
  expect(Number.isNaN(msOf(first.ts as never))).toBe(false);
});

test('msOf reads both shapes the wire uses, and refuses what it cannot', () => {
  expect(msOf(1_700_000_000_000)).toBe(1_700_000_000_000);
  expect(msOf('2026-11-14T21:26:35.361Z')).toBe(Date.parse('2026-11-14T21:26:35.361Z'));
  // A bare count travels as a string in a few old places: `Date.parse` would read it as a year.
  expect(msOf('1794691461885')).toBe(1794691461885);
  expect(msOf('not a date')).toBeUndefined();
  expect(msOf(Number.NaN)).toBeUndefined();
  expect(msOf(undefined)).toBeUndefined();
});

test('a thinking span that a window joined mid-thought still shows the whole span', () => {
  // The contract `docs` states for `since`: the server dates the frame that opens a phase, so a
  // window that reloads mid-thought resumes the counter rather than starting from its own arrival.
  // The span is measured from that same instant, which is what the app and its server share here.
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-14T21:00:00.000Z'));
  const T = 'span-anchor';
  chatStore.addUserMessage(T, 'u1', 'go');
  chatStore.startRun(T, 'r1');
  chatStore.startStream(T, 'b1');
  chatStore.appendReasoning(T, 'b1', 'je pense', true, '2026-11-14T20:59:48.000Z');

  jest.setSystemTime(new Date('2026-11-14T21:00:12.000Z'));
  chatStore.appendDelta(T, 'b1', 'la reponse');

  const item = chatStore.getItems(T).find(entry => entry.id === 'b1') as { reasoningMs?: number };
  expect(item.reasoningMs).toBe(24_000);
  jest.useRealTimers();
});
