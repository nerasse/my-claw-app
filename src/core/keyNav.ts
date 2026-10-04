import type { ViewProps } from 'react-native';

/** Keyboard walking of menus is the web build's (docs/keyboard.md): a phone has no arrows. */
export type KeyLayer = 'menu' | 'page' | 'list' | 'off';

export function keyLayerProps(_layer: KeyLayer): Partial<ViewProps> {
  return {};
}

export function menuOpen(): boolean {
  return false;
}

export function typingInField(): boolean {
  return false;
}

export function leaveField(): boolean {
  return false;
}

export function useKeyNav(): void {}

export function focusField(_label: string): boolean {
  return false;
}
