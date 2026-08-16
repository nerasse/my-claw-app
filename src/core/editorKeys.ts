import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

/** What a keystroke in the composer means, once the platform has had its say. */
export type EditorIntent = 'submit' | 'complete' | 'menu-up' | 'menu-down' | 'recall' | null;

export interface EditorState {
  /** The slash-command menu is showing: the arrows belong to it. */
  menuOpen: boolean;
  /** Nothing typed yet, so Up can mean "bring back what I sent last". */
  empty: boolean;
}

/**
 * Android: a soft keyboard has no Enter that means "send" (Enter is a newline in a multiline
 * field, and that is what people expect on a phone), and no Tab. Only a hardware keyboard's
 * arrows do anything, and only for the command menu.
 */
export function editorIntent(
  event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  state: EditorState,
): EditorIntent {
  if (!state.menuOpen) return null;
  const key = event.nativeEvent.key;
  if (key === 'ArrowUp') return 'menu-up';
  if (key === 'ArrowDown') return 'menu-down';
  return null;
}
