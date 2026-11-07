import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

/** What a keystroke in the composer means, once the platform has had its say. */
export type EditorIntent = 'submit' | 'complete' | 'menu-up' | 'menu-down' | 'recall' | 'recall-newer' | null;

export interface EditorState {
  /** The slash-command menu is showing: the arrows belong to it. */
  menuOpen: boolean;
  /** Nothing typed yet, so Up can mean "bring back what I sent last". */
  empty: boolean;
  /** A recalled message sits in the field, untouched: the arrows walk through the history. */
  historyArmed?: boolean;
}

/**
 * Android: a soft keyboard has no Enter that means "send" (Enter is a newline in a multiline
 * field, and that is what people expect on a phone), and no Tab. A hardware keyboard drives the
 * command menu with the arrows, and walks the sent history when the field is empty or holds a
 * recalled message.
 */
export function editorIntent(
  event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  state: EditorState,
): EditorIntent {
  const key = event.nativeEvent.key;
  if (state.menuOpen) {
    if (key === 'ArrowUp') return 'menu-up';
    if (key === 'ArrowDown') return 'menu-down';
    return null;
  }
  if (key === 'ArrowUp' && (state.empty || state.historyArmed)) return 'recall';
  if (key === 'ArrowDown' && state.historyArmed) return 'recall-newer';
  return null;
}
