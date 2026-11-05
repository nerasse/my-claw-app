import type { ViewProps } from 'react-native';

/**
 * DOM-only props, handed to a View as a spread so no component has to know which platform it is
 * on. Empty here: Android has no right-click and its Text is selectable already.
 */

export function contextMenuProps(_open: () => void): Partial<ViewProps> {
  return {};
}

export function recordingGestureProps(): Partial<ViewProps> {
  return {};
}

export function selectableProps(): Partial<ViewProps> {
  return {};
}

export function onAccentProps(): Partial<ViewProps> {
  return {};
}

/**
 * Grows a text field to its content, up to a ceiling. Web only: the browser's textarea has one
 * height, while an Android EditText grows within its `maxHeight` by itself.
 *
 * True when the field now scrolls, which is what the composer's overflow mark reads: a field that
 * scrolls gives no sign of it, and the lines below the frame are there only if you think to drag.
 * The phone answers for itself with the input's own content height.
 */
export function autoGrow(_node: unknown, _maxHeight: number): boolean {
  return false;
}

/**
 * Pointer movement on a surface whose own controls hide themselves (the full-screen viewers).
 * A phone has no pointer to move, and its tap already flips the bars: nothing to do here.
 */
export function pointerActivityProps(_activity: () => void): Partial<ViewProps> {
  return {};
}

/** A pointer resting on the bars, which holds them up. Same story: touch has no hover. */
export function pointerHoverProps(_onHover: (hovering: boolean) => void): Partial<ViewProps> {
  return {};
}

