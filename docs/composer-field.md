# The field the owner types in

The composer is one frame: a border and a radius around a text field, with the actions on the row
under it. Two things about that field have been wrong in ways the web could not show.

## It is sized by its text, never by the bar under it

The field sits in a column whose height comes from its content. It used to carry `flex: 1`, which
gives a child a flex basis of 0: the field then took its height from whatever the actions bar
measured and stayed **one line tall** while the EditText scrolled inside it.

The web hid this for months. `autoGrow` (`core/webProps.web.ts`) writes an explicit pixel height on
a textarea whenever the text changes, which overrides the flex sizing -- so every browser rendered
a growing field and the phone rendered a single line, whatever was typed (owner, 2026-11-05).
Android has no such helper: a `TextInput` with `multiline` grows itself, but only up to the space
its parent gives it.

The field is therefore `flexGrow: 0, flexShrink: 1`. The text sizes the field, the field sizes the
shell. `MAX_TEXT_HEIGHT` is the ceiling, and it is the same number in the stylesheet and in
`autoGrow`, which is why there is one of it.

`__tests__/composerHeight.test.tsx` pins the style (no `flex`, `flexGrow: 0`) next to the measure
timing it already covered.

## A field that scrolls says so

Past the ceiling the text scrolls, and a field that scrolls gives no sign of it: the text simply
stops at the frame's edge, and the lines below are there only if you think to drag.

The browser draws its own scrollbar, so the web needed nothing. Android draws none inside an
`EditText`, so the composer draws the same 3 pt thumb every list in the app draws
(`ScrollIndicator`), fed from `onContentSizeChange` and `onScroll`, and only while the text is
taller than the ceiling. Two rules worth keeping:

- It is hidden on the web (`Platform.OS !== 'web'`), where a second bar beside the browser's own
  would be one too many.
- It rides the field's frame, not the window: absolute inside the shell, so a long message never
  puts a bar beside the send button.

## Ceilings

`MAX_TEXT_HEIGHT` is per variant, and the phone's is deliberately short of the thread: 94 pt is
about four lines. Past that the message is a page, not a line, and the field would eat the
conversation it is written into. A desktop gets 188 (a mouse can scroll, and there is room) and the
hero variant on an empty thread gets 218.
