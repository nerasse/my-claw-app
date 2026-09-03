import { useQuestionKeys as nativeKeys } from '../questionKeys';
import { isEditableTarget, questionKeyIntent } from '../questionKeys.web';

/**
 * Bare Left/Right walk the pages of a question form on the web, and that shortcut is one rule
 * away from being a bug: the same keys move the caret. Every case where the form must keep its
 * hands off is pinned here, because the failure is silent -- a letter typed in the wrong place,
 * or a page that turns while someone is writing.
 */

const key = (over: Partial<Parameters<typeof questionKeyIntent>[0]> = {}) => ({
  key: 'ArrowRight',
  ...over,
});

const element = (tagName: string, contentEditable = false): Element =>
  ({ tagName, isContentEditable: contentEditable }) as unknown as Element;

test('the arrows walk the form', () => {
  expect(questionKeyIntent(key({ key: 'ArrowRight' }), false)).toBe('next');
  expect(questionKeyIntent(key({ key: 'ArrowLeft' }), false)).toBe('prev');
});

test('a caret in a field wins, always', () => {
  // The free-text answer of the form itself is a field, and so is the composer underneath it.
  expect(questionKeyIntent(key({ key: 'ArrowRight' }), true)).toBeNull();
  expect(questionKeyIntent(key({ key: 'ArrowLeft' }), true)).toBeNull();
});

test('a modified arrow belongs to the browser or to a selection', () => {
  expect(questionKeyIntent(key({ altKey: true }), false)).toBeNull();
  expect(questionKeyIntent(key({ ctrlKey: true }), false)).toBeNull();
  expect(questionKeyIntent(key({ metaKey: true }), false)).toBeNull();
  expect(questionKeyIntent(key({ shiftKey: true }), false)).toBeNull();
});

test('an IME candidate window keeps its arrows', () => {
  expect(questionKeyIntent(key({ isComposing: true }), false)).toBeNull();
});

test('anything else is not ours', () => {
  expect(questionKeyIntent(key({ key: 'ArrowUp' }), false)).toBeNull();
  expect(questionKeyIntent(key({ key: 'Enter' }), false)).toBeNull();
  expect(questionKeyIntent(key({ key: 'a' }), false)).toBeNull();
});

test('what counts as a field', () => {
  // react-native-web renders a multiline TextInput as a textarea and a single-line one as an
  // input; a Markdown block rendered editable would carry the caret too.
  expect(isEditableTarget(element('TEXTAREA'))).toBe(true);
  expect(isEditableTarget(element('INPUT'))).toBe(true);
  expect(isEditableTarget(element('SELECT'))).toBe(true);
  expect(isEditableTarget(element('DIV', true))).toBe(true);
  expect(isEditableTarget(element('DIV'))).toBe(false);
  expect(isEditableTarget(null)).toBe(false);
});

test('a phone binds nothing at all', () => {
  // Called outside a component on purpose: the native hook must be a no-op, not a hook.
  expect(() => nativeKeys(true, { onPrev: () => {}, onNext: () => {} })).not.toThrow();
});
