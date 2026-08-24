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
/**
 * Marks a block as "scrolls vertically, and only vertically". The rule itself is in
 * webTheme.web.ts: `overflow: scroll` in a React Native style means *both* axes and a permanent
 * pair of bars, which is what put a horizontal scrollbar over and under every tool output.
 */
export function blockScrollProps(): Partial<ViewProps> {
  return { dataSet: { clawScroll: 'y' } } as Partial<ViewProps>;
}

/**
 * Makes the wheel work over a capped block inside the thread.
 *
 * A block nested in the inverted chat list has to answer the wheel itself, for two reasons.
 *
 * The event must stop here while the block can still move, or the thread behind it scrolls at
 * the same time. And the direction cannot be assumed: react-native-web renders the inverted list
 * as a `scaleY(-1)` on the list and a second one on each row, so a block may sit under an even
 * number of flips (upright, the browser is right) or an odd one (upside down, every delta is
 * backwards). Which one depends on where the block hangs in the tree, so it is measured rather
 * than hardcoded -- guessing it got the direction wrong for every tool block once already.
 *
 * At either end of the block the event is let through and the thread takes over, which is what a
 * reader expects from a scroll area nested in another.
 */
export function attachBlockWheel(node: unknown): () => void {
  if (!(node instanceof HTMLElement)) return () => {};
  // Cached after the first wheel: the transforms are static, and walking to the body on every
  // notch of a scroll would be paid on the one gesture that must stay smooth.
  let sign: number | undefined;
  const onWheel = (event: WheelEvent): void => {
    const max = node.scrollHeight - node.clientHeight;
    if (max <= 0) return;
    if (sign === undefined) sign = verticalSign(node);
    const next = Math.min(Math.max(node.scrollTop + sign * event.deltaY, 0), max);
    if (next === node.scrollTop) return;
    node.scrollTop = next;
    event.preventDefault();
    event.stopPropagation();
  };
  // Not passive: the whole point is to be able to keep the thread from scrolling too.
  node.addEventListener('wheel', onWheel, { passive: false });
  return () => node.removeEventListener('wheel', onWheel);
}

/**
 * +1 when the element is drawn the right way up, -1 when an odd number of ancestors flips it
 * vertically. Reads the `d` term of each ancestor's transform matrix, which is the vertical
 * scale: negative means mirrored.
 */
function verticalSign(node: HTMLElement): number {
  let sign = 1;
  for (let el: HTMLElement | null = node; el; el = el.parentElement) {
    const transform = getComputedStyle(el).transform;
    if (!transform || transform === 'none') continue;
    const matrix = new DOMMatrixReadOnly(transform);
    if (matrix.d < 0) sign = -sign;
  }
  return sign;
}

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
