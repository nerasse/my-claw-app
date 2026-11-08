/**
 * Whether the composer draws the history arrows.
 *
 * A soft keyboard has no Up and Down, so the walk the desktop gets from those keys is offered as a
 * pill at the bottom left. It floats over the thread, which is why every condition here is one that
 * keeps it from being in the way rather than one that makes it useful:
 *
 * - the field holds the caret (nothing to step through otherwise);
 * - the keyboard is up. Android keeps the caret in a field when the IME is dismissed, so focus
 *   alone left the pill floating over the text it was covering with nothing to type into
 *   (owner, 2026-11-08);
 * - there is a sent message to walk to;
 * - the field is empty, or shows a line this walk put there. Anything else is a draft nobody asked
 *   to lose, and Up/Down belong to the caret.
 */
export interface HistoryPillState {
  focused: boolean;
  keyboardUp: boolean;
  draft: string;
  /** The field holds a line the walk itself recalled, unchanged. */
  recallArmed: boolean;
  hasHistory: boolean;
}

export function historyPillVisible(state: HistoryPillState): boolean {
  if (!state.focused || !state.keyboardUp || !state.hasHistory) return false;
  return state.draft === '' || state.recallArmed;
}
