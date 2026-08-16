/// <reference lib="dom" />
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';

export type EditorIntent = 'submit' | 'complete' | 'menu-up' | 'menu-down' | 'recall' | null;

export interface EditorState {
  menuOpen: boolean;
  empty: boolean;
}

/**
 * The composer's keyboard on a desktop.
 *
 * Enter sends and Shift+Enter breaks the line: react-native-web will not do it on its own,
 * because it only calls `onSubmitEditing` when the field is single-line or blurs on submit, and
 * this one is neither. So the newline is cancelled here and the send is raised instead.
 *
 * react-native-web hands `onKeyPress` the React synthetic event, whose `preventDefault` reaches
 * the DOM event: that is what stops the character from being inserted.
 */
export function editorIntent(
  event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  state: EditorState,
): EditorIntent {
  const synthetic = event as unknown as {
    key?: string;
    shiftKey?: boolean;
    altKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    preventDefault?: () => void;
    nativeEvent?: { isComposing?: boolean };
  };
  const key = synthetic.key ?? event.nativeEvent.key;
  // An IME is mid-word: Enter is validating a candidate, not sending a message.
  if (synthetic.nativeEvent?.isComposing) return null;

  if (key === 'Enter') {
    if (synthetic.shiftKey || synthetic.altKey || synthetic.ctrlKey || synthetic.metaKey) return null;
    synthetic.preventDefault?.();
    return 'submit';
  }
  if (key === 'Tab' && state.menuOpen) {
    synthetic.preventDefault?.();
    return 'complete';
  }
  if (key === 'ArrowUp') {
    if (state.menuOpen) {
      synthetic.preventDefault?.();
      return 'menu-up';
    }
    if (state.empty) {
      synthetic.preventDefault?.();
      return 'recall';
    }
    return null;
  }
  if (key === 'ArrowDown' && state.menuOpen) {
    synthetic.preventDefault?.();
    return 'menu-down';
  }
  return null;
}
