# Making room for the keyboard

One rule: **the shell gives up exactly one keyboard's worth of room, and it derives that from the
frame it is standing in right now.** There is a single `KeyboardAvoidingView` in the app, in
`AppShell`, wrapping everything but the bottom sheets. Its behavior is `padding`, on every
platform. Never `height`.

## The bug that fixed the rule

Coming back to the app and tapping the composer flashed the conversation away: header and input
stacked as a strip at the top of the screen, then a band of background where the messages should
be, then the keyboard. It corrected itself as soon as the keyboard went down, which is what made
it look like a rendering glitch rather than a layout one.

`behavior="height"` renders the shell as

```js
{ height: this._initialFrameHeight - bottom, flex: 0 }
```

and computes `bottom` as

```js
Math.max(this.state.bottom + frame.y + frame.height - keyboardY, 0)
```

Two things there are stateful. `_initialFrameHeight` is captured at the **first** layout and never
measured again (`if (!this._initialFrameHeight)`), and the new `bottom` **adds the shrink already
applied**. That addition is not a bug on its own: `frame.height` has normally shrunk by the same
amount, so the two cancel. They cancel only while every keyboard event is separated by a layout
pass.

Resume does not grant that. Android restores the IME with the activity and the field takes focus
right after, so two announcements land back to back on a frame that has not been re-measured:

| step | `frame.height` | `bottom` | applied height |
| --- | --- | --- | --- |
| measured, keyboard down | 2340 | 0 | flex (2340) |
| keyboard announced | 2340 | 0 + 2340 - 1290 = **1050** | 1290 |
| announced again, no layout yet | 2340 (stale) | 1050 + 2340 - 1290 = **2100** | **240** |

240px of a 2340px screen: the header and the composer, nothing else. That is the screenshot.

`padding` has neither term. The inset is `max(frame.y + frame.height - keyboardY, 0)`, read from
the live frame every time, so a stale frame costs one frame of overshoot instead of compounding,
and a repeat of the same event is idempotent. It is also correct on both Android modes without
knowing which one is in play: if the window was resized by `adjustResize`, the frame already ends
where the keyboard begins, the overlap is zero and nothing is padded; if the window was not resized
(edge to edge, the IME arriving as an inset), the overlap is the keyboard and it is padded. The
`flex: 0` the `height` branch forces on the shell goes away with it.

## What this does not cover

The bottom sheets are absolute layers rendered outside this view, so nothing lifts them: they pad
themselves through `useSheetBottomInset`, and `combineBottomInset` carries the platform asymmetry
(`src/core/keyboard.ts`). That is a separate mechanism on purpose, and it is stateless too.

And it does not scroll. `KeyboardAvoidingView` adjusts padding, height or position and nothing else
-- `padding` here cannot bring a field the keyboard covers into view, it only stops the shell from
being covered. Whatever reveals a field is ours, and on the question form it is the pair of steps
described under "The reveal, measured in two halves" below.

## The rule, and where it is checked

**Nothing is allowed to be unreachable, and the thread is the only scroll area in a conversation.**
The question form is a row of the thread, so scrolling the conversation scrolls it: a form pinned
above the composer was tried (`0.6.58` to `0.6.60`) and rejected by the owner, because a form that
does not move with the thread reads as an overlay the conversation slides behind. What that costs is
that a form taller than what the keyboard leaves is read in slices, by scrolling the thread, which
is the accepted price of having one scroll area. A surface outside the shell's `KeyboardAvoidingView`
pads itself with `useSheetBottomInset`.

Two traps make this less obvious than it sounds on Android:

- **`adjustResize` is inert here.** The app draws edge to edge -- and it does so whether or not
  `edgeToEdgeEnabled` says otherwise: RN forces the flag on API 36 (`WindowUtil.kt`), and on API 35
  it derives it from the theme, which declares no opt-out. So Android never resizes the window for
  the keyboard. `AndroidManifest.xml` already carries `adjustResize` for Android 14 and below,
  where the window really does shrink; it is left there for that, not for this.
- **Android does scroll a focused child into view, and it did not when this was written.** RN 0.86
  turned that on by default (`scrollsChildToFocus`, PR #55143, whose motivation names "virtualized
  lists that manage their own scroll positions"); before it, reaching a focused field took a
  keystroke. It computes its delta in layout coordinates, and a list inverted with
  `transform: scale(-1)` mirrors those, so on the thread it is a second writer on one offset with
  arithmetic that does not know about the flip. The thread passes `scrollsChildToFocus={false}`,
  and the reveal owns the offset alone.
- **The thread is the scroll area, and it will not share.** A scroller inside the inverted list
  loses every drag to the list, which is measured, not feared (`docs/text-selection.md`). A surface
  that needs to scroll therefore cannot be a row of the conversation.

That second trap is why the form reveals its field by scrolling the thread, and why it is a row of
the thread rather than a surface of its own. It was moved out, above the composer, with its own
scroll and its title and Send pinned (`0.6.58` to `0.6.60`), and the owner rejected it: a block
pinned over the thread does not move when the conversation is scrolled, so the conversation appeared
to slide behind it. The reveal on focus is what keeps it usable in place, since the field is the
last thing in the form and sits under the keyboard the moment it opens.

| Surface | Container | Why it is fine |
| --- | --- | --- |
| Conversation, editors, settings | the one `KeyboardAvoidingView` | it gives up exactly the overlap |
| The question form | a row of the thread | the thread is its scroll area, and the reveal measures the field to bring it up |
| ActionSheet, PromptSheet | absolute, outside it | pad themselves (`useSheetBottomInset`) |
| Drawer, ModelSheet | absolute, outside it | their field is at the top, nothing under the keyboard |
| Long forms (ProviderEdit, ModelEdit, AgentFile) | a scroller each | reachable by scrolling; nothing is auto-revealed, and a field you cannot see is a field you cannot tap |

## The reveal, measured in two halves

The free-text answer of a question card is the one field in this app that is not at the top of its
surface and not inside a scroller that can reach it. It is a row of the thread, near the bottom of
it, and it takes focus while the keyboard is still opening. So its reveal is two steps.

1. **At focus**, the thread scrolls to offset 0 -- "the newest content, where the form is". Cheap,
   and the half that is right when the reader had scrolled away from the bottom.
2. **At `keyboardDidShow`**, the field is measured with `measureInWindow` and lifted by exactly
   what the keyboard covers (`src/core/revealField.ts`). On Android nothing exists to measure
   before this event: the platform reports the keyboard once it is up, so a step 1 offset is a
   request against a viewport that is about to shrink.

The lift is `max(0, offset - covered)`, and the clamp is the interesting part rather than a
precaution. The list is inverted: offset 0 is the newest content and there is nothing behind it, so
a field covered while the list is already at 0 **cannot be revealed by scrolling at all**. That is
the case the numbers are for, and step 2 reports them (field, keyboard top and height, offset
before and after) as a device diagnostic, once per focus. A "still behind the keyboard" report then
arrives with a measurement attached instead of being argued from a screenshot.

A repeat of the same event is settled by its own result: the second measurement is of a field that
moved, so a keyboard re-announcement (the IME changing height) re-runs the lift and finds nothing
left to do.

## Test

`src/app/__tests__/keyboardAvoidance.test.tsx` drives the real component: a layout, then the same
keyboard announcement twice, then a taller one, then the hide. It asserts the room left for the
conversation rather than the style that produced it, so it holds whichever way the avoidance is
spelled. Put `behavior="height"` back and it reports 240 where it wanted 1290.

`src/app/__tests__/questionKeyboard.test.tsx` holds the form's half of the rule: the form is a row
of the thread, focusing its field scrolls the thread, and the card itself never scrolls. The
table above is the audit of the other surfaces: each one is either inside the one
`KeyboardAvoidingView`, or pads itself, or keeps its field at the top.

`src/core/__tests__/revealField.test.ts` holds the measurement: what a lift is worth, that it never
asks for an offset before the newest message, that a field already clear is left alone, and that one
which cannot answer is reported as unmeasured rather than lifted on a guess. The reveal is the one
part of this that no test can settle on its own -- it is arithmetic about a geometry only the device
has -- which is exactly why the arithmetic is a pure function and the geometry is passed in.

## The third half: the space the scroll cannot give (2026-09-14)

The device settled it, and not the way the two halves assumed. Four measurements, from the owner's
phone, all the same shape:

```
question field reveal: field=565..605 keyboardTop=426 keyboardHeight=339 offset=0->0
```

The field was under the keyboard and `liftFor` had answered "0 again" -- correctly, because offset 0
is the newest content of an inverted list and a lift is a step back towards 0. There was nothing left
to scroll into, and the two halves of the reveal were both working exactly as written. What that
proves is the *other* hypothesis on this page: the viewport never shrank. The app is edge to edge,
`adjustResize` is inert, so the keyboard does not resize anything -- it covers. No arithmetic about
an offset can move a field out from under a rectangle that overlays it.

So the reveal has a third half, and it does not go through the offset at all: space *inside the
content* (`padFor`, `src/core/revealField.ts`). Space added at the start of an inverted list's
content container is space at the bottom of the screen -- the container is not flipped, the scroll
view is, which is the same reason the list header is the bottom of the thread. The pad is the exact
remainder: what the scroll could not deliver, and nothing when the scroll could deliver all of it,
so the two halves never move the thread twice for one keyboard.

The pad is applied by `ChatScreen`, not by the card, because a card is a row of the thread and
unmounts when the keyboard's report arrives. It is dropped on blur and on `keyboardDidHide`: it
exists for a field that is on screen.

And the line now carries the proof rather than the attempt: `pad=176 settled=300..360`, a second
measurement of the field taken after the space was given two frames to lay out. A pad that does not
move the field is a finding too, and this is the only reading that can tell it from a pad that was
never applied.
