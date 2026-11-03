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

/** Set before touch down: changing touch-action during a drag cannot prevent browser panning. */
export function recordingGestureProps(): Partial<ViewProps> {
  const props = {
    style: { cursor: 'pointer' as const, touchAction: 'none', userSelect: 'none', WebkitTouchCallout: 'none' },
    onContextMenu: (event: Event) => event.preventDefault(),
    onDragStart: (event: Event) => event.preventDefault(),
  };
  return props;
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
 * Marks a surface that is filled with the accent colour, so the selection highlight can flip on
 * it (webTheme.web.ts).
 *
 * Without it a drag over a user bubble selects nothing visible: the bubble is already
 * `accent` with `accentText` on top, which is exactly what `::selection` paints.
 */
export function onAccentProps(): Partial<ViewProps> {
  return { dataSet: { clawOnAccent: '1' } } as Partial<ViewProps>;
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
 * Pointer movement on the surface that shows a picture full screen.
 *
 * On a desktop the bars are hidden after five seconds of idleness, and the only thing that used to
 * bring them back was a click -- which on a zoomable picture is also a zoom, so the gesture that
 * reveals the controls is the gesture that changes what you were looking at. Every lightbox ever
 * written answers to a mouse move instead. Spread as `Partial<ViewProps>`; React forwards
 * `onPointerMove` and `onPointerEnter` to the div react-native-web renders.
 */
export function pointerActivityProps(activity: () => void): Partial<ViewProps> {
  return { onPointerMove: activity, onPointerEnter: activity } as Partial<ViewProps>;
}

/**
 * A pointer resting on the bars themselves. They hold while it is there: the close cross must not
 * vanish from under a mouse that is on its way to press it.
 */
export function pointerHoverProps(onHover: (hovering: boolean) => void): Partial<ViewProps> {
  return {
    onPointerEnter: () => onHover(true),
    onPointerLeave: () => onHover(false),
  } as Partial<ViewProps>;
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
  // An empty field is measured on its placeholder, wrapped at whatever width it had then: "message"
  // in a field caught narrow mid-layout came out seven lines tall, and stayed so until a keystroke.
  // A placeholder is a hint, never a reason to grow: the empty field is measured without it.
  const placeholder = node.value === '' ? node.placeholder : '';
  if (placeholder) node.placeholder = '';
  const needed = node.scrollHeight + frame;
  if (placeholder) node.placeholder = placeholder;
  node.style.height = `${Math.min(needed, maxHeight)}px`;
  node.style.overflowY = needed > maxHeight ? 'auto' : 'hidden';
}
