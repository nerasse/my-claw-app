/// <reference lib="dom" />
import type { ViewProps } from 'react-native';

/**
 * DOM-only props. react-native-web forwards `onContextMenu` and `dataSet` straight to the
 * element it renders, but React Native's own types know nothing about them, so they are built
 * here and spread as `Partial<ViewProps>` instead of being cast at every call site.
 */

/**
 * Right-click on the desktop. The browser's own context menu is the right tool there (native
 * selection and copy already work, see platform.chatSelectable), and every action is one tap
 * away behind the ⋯ button. Intercepting the event to open the phone-style sheet fought the
 * user's muscle memory, so the web build no longer touches the context menu at all.
 */
export function contextMenuProps(_open: () => void): Partial<ViewProps> {
  return {};
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
 *
 * The borders are added back on purpose. `scrollHeight` is content plus padding and excludes them,
 * while react-native-web sets `box-sizing: border-box` on everything it renders, so assigning it
 * as the height leaves the content short by exactly the border: the field then scrolls by those
 * pixels for good and the first line is sliced by the top edge. That was the composer's broken
 * border on the web, and it moved with the caret, which is what made it look intermittent.
 */
export function autoGrow(node: unknown, maxHeight: number): void {
  if (!(node instanceof HTMLTextAreaElement)) return;
  // A textarea is two rows tall by default, and that intrinsic height is a floor `scrollHeight`
  // never goes under: one line of text measured as two, and the composer stood 8pt taller than
  // the round buttons beside it.
  node.rows = 1;
  node.style.height = 'auto';
  const style = getComputedStyle(node);
  const frame =
    (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  const needed = node.scrollHeight + frame;
  node.style.height = `${Math.min(needed, maxHeight)}px`;
  node.style.overflowY = needed > maxHeight ? 'auto' : 'hidden';
}
