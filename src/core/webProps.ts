import type { ViewProps } from 'react-native';

/**
 * DOM-only props, handed to a View as a spread so no component has to know which platform it is
 * on. Empty here: Android has no right-click and its Text is selectable already.
 */

export function contextMenuProps(_open: () => void): Partial<ViewProps> {
  return {};
}

export function selectableProps(): Partial<ViewProps> {
  return {};
}

export function autoGrow(_node: unknown, _maxHeight: number): void {}

/** Web only: a capped block scrolls natively on a touchscreen, there is no wheel to fix. */
export function blockScrollProps(): Partial<ViewProps> {
  return {};
}

export function attachBlockWheel(_node: unknown): () => void {
  return () => {};
}
