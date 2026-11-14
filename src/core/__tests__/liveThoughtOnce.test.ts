/**
 * The same thinking is drawn once, live as well as after a reload.
 *
 * The streamer cuts a turn into one bubble per reasoning block; the log writes the phases the
 * provider reported. A provider that reports the turn whole leaves one phase holding the thinking
 * and the prose while the screen has two bubbles, so the ids cannot be paired -- the recorder pairs
 * the tail, which is what lines the answer up (`run-recorder.ts`), and the thought is left under an
 * id the page does not carry. Keeping both drew the reasoning twice: alone in the fold, then again
 * above the answer. A reload, which holds the phase alone, made it go away (owner, 2026-11-14:
 * "en live et refresh j'ai des message/reasoning en double").
 *
 * What the page carries in its own words is dropped; a thought whose words the page does not carry
 * is the only record of that thinking and stays.
 */

import { chatStore } from '../chat';
import { buildRows, type ChatRow } from '../runRows';
import type { ChatItem } from '../chat';
import type { HistoryEntry } from '../protocol';

const T = 'thought-once';
const runMeta = { id: 'r1', status: 'running' as const, startTs: '2026-01-01T00:00:00.000Z' };

beforeEach(() => chatStore.clearAll());

const labelOfRow = (row: ChatRow): string => {
  if (row.kind === 'group') return `g[${row.items.map(item => item.id).join(',')}]`;
  if (row.kind === 'item') return `i:${row.item.id}`;
  return row.kind;
};

/** The turn as the page writes it: one phase, holding the thinking and the words. */
const pageOf = (reasoning: string): HistoryEntry[] => [
  { role: 'user', id: 'u1', ts: '2026-01-01T00:00:00.000Z', text: 'go', run: runMeta },
  { role: 'assistant', id: 'answer', ts: '2026-01-01T00:00:01.000Z', text: 'la reponse', reasoning, run: runMeta },
] as HistoryEntry[];

/** What the screen held: a thought of its own, then the answer streaming. */
function streamed(): void {
  chatStore.addUserMessage(T, 'u1', 'go');
  chatStore.startRun(T, 'r1');
  chatStore.startStream(T, 'think-1');
  chatStore.appendReasoning(T, 'think-1', 'et le raisonnement');
  chatStore.endStream(T, 'think-1');
  chatStore.startStream(T, 'answer');
  chatStore.appendDelta(T, 'answer', 'la reponse');
}

const thoughts = (): ChatItem[] =>
  buildRows(chatStore.getItems(T)).flatMap(row => (row.kind === 'group' ? row.items : []));

test('a delta that carries the thinking leaves one copy of it', () => {
  streamed();
  chatStore.handleSyncResult(T, pageOf('et le raisonnement'), 'head', 'head', true);

  const shown = buildRows(chatStore.getItems(T)).map(labelOfRow);
  expect(shown).toEqual(['i:u1', 'g[answer~reasoning]', 'i:answer']);
  expect(thoughts().filter(item => item.kind === 'text' && item.reasoning)).toHaveLength(1);
});

test('a window that carries it leaves one copy too', () => {
  streamed();
  chatStore.handleSyncResult(T, pageOf('et le raisonnement'), 'head', 'head', true, undefined, false, true, 10);

  expect(thoughts().filter(item => item.kind === 'text' && item.reasoning)).toHaveLength(1);
});

test('a thought the page does not carry is the only record of it, and stays', () => {
  // Two calls, two thoughts: the page names the second one's words, not the first's.
  chatStore.addUserMessage(T, 'u1', 'go');
  chatStore.startRun(T, 'r1');
  chatStore.startStream(T, 'think-1');
  chatStore.appendReasoning(T, 'think-1', 'premier raisonnement');
  chatStore.endStream(T, 'think-1');
  chatStore.startToolCall(T, 'c1', 'bash', { command: 'ls' });

  chatStore.handleSyncResult(
    T,
    [
      { role: 'user', id: 'u1', ts: '2026-01-01T00:00:00.000Z', text: 'go', run: runMeta },
      { role: 'tool', id: 'c1', ts: '2026-01-01T00:00:02.000Z', name: 'bash', args: { command: 'ls' }, ok: true, output: '', truncated: false, run: runMeta },
      { role: 'assistant', id: 'a2', ts: '2026-01-01T00:00:03.000Z', text: 'deuxieme', reasoning: 'deuxieme raisonnement', run: runMeta },
    ] as HistoryEntry[],
    'head',
    'head',
    true,
  );

  const ids = thoughts().map(item => item.id);
  expect(ids).toContain('think-1');
  expect(ids).toContain('a2~reasoning');
});
