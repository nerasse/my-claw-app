import type { ChatItem } from '../chat';
import { newerLine, olderLine, recallLines, recallsDraft } from '../recall';

/** A message of the owner's, with nothing but what the walk reads. */
function sent(id: string, text: string, extra: Partial<ChatItem> = {}): ChatItem {
  return { kind: 'text', id, role: 'user', text, attachments: [], streaming: false, ts: 0, ...extra } as ChatItem;
}

const thread: ChatItem[] = [
  sent('m1', 'first'),
  { kind: 'text', id: 'a1', role: 'agent', text: 'an answer', attachments: [], streaming: false, ts: 0 },
  sent('m2', 'second'),
  // A command's output is a `user` turn with no owner behind it: never part of the history.
  sent('c1', '/status', { command: true }),
  sent('m3', 'third'),
];

test('the history is the owner’s messages, oldest first, and nothing else', () => {
  expect(recallLines(thread)).toEqual(['first', 'second', 'third']);
});

test('a recording comes back as the words that were heard, not as the line a document writes', () => {
  const lines = recallLines([
    sent('v1', '', {
      attachments: [{ id: 'rec1', type: 'audio' } as never],
      transcripts: { rec1: 'book the table' },
    }),
  ]);
  expect(lines).toEqual(['book the table']);
});

test('a caption and a recording come back in the order the message carried them', () => {
  const lines = recallLines([
    sent('v2', 'have a look at this', {
      attachments: [{ id: 'rec2', type: 'audio' } as never],
      transcripts: { rec2: ' the second paragraph ' },
    }),
  ]);
  expect(lines).toEqual(['have a look at this\n\nthe second paragraph']);
});

test('Up walks back one message at a time and stops at the oldest', () => {
  expect(olderLine(['first', 'second', 'third'], '')).toBe('third');
  expect(olderLine(['first', 'second', 'third'], 'third')).toBe('second');
  expect(olderLine(['first', 'second', 'third'], 'second')).toBe('first');
  expect(olderLine(['first', 'second', 'third'], 'first')).toBeNull();
  expect(olderLine([], '')).toBeNull();
});

test('a draft the owner wrote starts the walk at the newest message, it is not searched for', () => {
  expect(olderLine(['first', 'second', 'third'], 'half-written')).toBe('third');
  // A draft that happens to repeat an old message takes the newest occurrence, like a shell.
  expect(olderLine(['same', 'later', 'same'], 'same')).toBe('later');
});

test('Down walks forward and past the newest the field empties again', () => {
  expect(newerLine(['first', 'second', 'third'], 'first')).toBe('second');
  expect(newerLine(['first', 'second', 'third'], 'third')).toBeNull();
  // Not a recalled line: Down belongs to the caret, so nothing is answered at all.
  expect(newerLine(['first', 'second'], 'half-written')).toBeUndefined();
});

test('only an untouched recall arms the history arrows', () => {
  expect(recallsDraft('second', 'second')).toBe(true);
  expect(recallsDraft('second', 'second, edited')).toBe(false);
  expect(recallsDraft(null, '')).toBe(false);
});
