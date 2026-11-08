/**
 * When the composer's history pill is drawn -- see `src/core/historyPill.ts`.
 *
 * The pill floats over the thread, so every condition here is about getting out of the way: the
 * owner closed the keyboard on 2026-11-08 and it stayed, with the caret still in the field, over
 * the text it was covering.
 */
import { historyPillVisible, type HistoryPillState } from '../historyPill';

const base: HistoryPillState = {
  focused: true,
  keyboardUp: true,
  draft: '',
  recallArmed: false,
  hasHistory: true,
  pointerFine: false,
};

describe('the history pill', () => {
  test('is drawn for an empty field with the keyboard up', () => {
    expect(historyPillVisible(base)).toBe(true);
  });

  test('goes away when the keyboard is dismissed, caret or not', () => {
    expect(historyPillVisible({ ...base, keyboardUp: false })).toBe(false);
  });

  test('is not drawn before the field holds the caret', () => {
    expect(historyPillVisible({ ...base, focused: false })).toBe(false);
  });

  test('stays while a recalled line is walked, and leaves as soon as it is edited', () => {
    expect(historyPillVisible({ ...base, draft: 'un message', recallArmed: true })).toBe(true);
    expect(historyPillVisible({ ...base, draft: 'un message', recallArmed: false })).toBe(false);
  });

  test('nothing to walk, nothing drawn', () => {
    expect(historyPillVisible({ ...base, hasHistory: false })).toBe(false);
  });

  /**
   * A desktop browser has the arrow keys already: the pill is a phone's stand-in for them, and over
   * a thread on a laptop it is a control for a keyboard nobody is missing (owner, 2026-11-08).
   */
  test('is never drawn for a fine pointer, keyboard up or not', () => {
    expect(historyPillVisible({ ...base, pointerFine: true })).toBe(false);
    expect(historyPillVisible({ ...base, pointerFine: true, keyboardUp: false })).toBe(false);
  });
});
