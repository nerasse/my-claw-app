import { messageSelectionBody } from '../textSelection';

/**
 * What a reader gets when they ask to select a message: one string, in the order the message was
 * written, so a single drag can cross from the thinking into the answer.
 */

test('a message hands over its thinking, its answer and its summary as one source', () => {
  const body = messageSelectionBody({
    text: 'the command replied',
    reasoning: 'weighing two options',
    details: 'kept: the file paths',
  });

  expect(body).toBe('## Reasoning\n\nweighing two options\n\nthe command replied\n\n## Summary\n\nkept: the file paths');
  // The order is the order of the bubble: thinking, answer, then what a compaction kept.
  expect(body.indexOf('weighing')).toBeLessThan(body.indexOf('the command replied'));
  expect(body.indexOf('the command replied')).toBeLessThan(body.indexOf('kept:'));
});

test('an absent block leaves no heading and no hole behind it', () => {
  expect(messageSelectionBody({ text: 'just an answer' })).toBe('just an answer');
  expect(messageSelectionBody({ text: 'just an answer', reasoning: '   ', details: '' })).toBe('just an answer');
  // A bubble that is only a reasoning trace (the model is still thinking) is not empty either.
  expect(messageSelectionBody({ text: '', reasoning: 'still going' })).toBe('## Reasoning\n\nstill going');
});
