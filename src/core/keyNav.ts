import { TextInput, type ViewProps } from 'react-native';
import type { RefObject } from 'react';

/**
 * The keyboard on Android -- docs/keyboard.md.
 *
 * Walking menus and pages is Android's own focus there: the arrows, Tab and Enter move between and
 * press the focusable views, and a sheet is a dialog of its own, which keeps them inside it. What
 * the web does with the DOM, these few do with the focused text field.
 */
export type KeyLayer = 'menu' | 'page' | 'list' | 'off';

export function keyLayerProps(_layer: KeyLayer): Partial<ViewProps> {
  return {};
}

/** A sheet is a dialog on Android: while one is open, the shortcuts never reach the shell. */
export function menuOpen(): boolean {
  return false;
}

/** Only the web's live page takes the keyboard whole: on Android it types through a field. */
export function keysOwnedByPage(): boolean {
  return false;
}

export function typingInField(): boolean {
  return TextInput.State.currentlyFocusedInput() != null;
}

/** Escape leaves a field before it leaves a page: the second press goes back. */
export function leaveField(): boolean {
  const input = TextInput.State.currentlyFocusedInput();
  if (!input) return false;
  TextInput.State.blurTextInput(input);
  return true;
}

export function useKeyNav(): void {}

/** The fields a shortcut can put the caret in, by label (the web finds them in the DOM). */
const fields = new Map<string, RefObject<TextInput | null>>();

/** Registers a field under its label for `focusField`; returns what unregisters it. */
export function keyField(label: string, ref: RefObject<TextInput | null>): () => void {
  fields.set(label, ref);
  return () => {
    if (fields.get(label) === ref) fields.delete(label);
  };
}

export function focusField(label: string): boolean {
  const input = fields.get(label)?.current;
  if (!input) return false;
  input.focus();
  return true;
}
