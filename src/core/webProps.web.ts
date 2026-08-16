/// <reference lib="dom" />
import type { ViewProps } from 'react-native';

/**
 * DOM-only props. react-native-web forwards `onContextMenu` and `dataSet` straight to the
 * element it renders, but React Native's own types know nothing about them, so they are built
 * here and spread as `Partial<ViewProps>` instead of being cast at every call site.
 */

/** Right-click opens the same menu a long press opens on the phone. */
export function contextMenuProps(open: () => void): Partial<ViewProps> {
  return {
    onContextMenu: (event: { preventDefault: () => void }) => {
      event.preventDefault();
      open();
    },
  } as Partial<ViewProps>;
}

/**
 * Opts a subtree back into text selection. `Text` ships `user-select: none` in
 * react-native-web, which on a phone stops a tap from selecting a word and on a desktop stops a
 * conversation from being copied at all.
 */
export function selectableProps(): Partial<ViewProps> {
  return { dataSet: { clawSelect: 'text' } } as Partial<ViewProps>;
}

/**
 * Grows a multiline field with its content, up to a ceiling. A textarea has one fixed height in
 * a browser: the composer would otherwise stay two lines tall while a paragraph scrolls inside.
 */
export function autoGrow(node: unknown, maxHeight: number): void {
  if (!(node instanceof HTMLTextAreaElement)) return;
  node.style.height = 'auto';
  const wanted = Math.min(node.scrollHeight, maxHeight);
  node.style.height = `${wanted}px`;
  node.style.overflowY = node.scrollHeight > maxHeight ? 'auto' : 'hidden';
}
