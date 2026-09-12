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

## The rule, and where it is checked

**A focusable surface either fits the space above the keyboard, or scrolls inside itself with its
actions pinned outside that scroll. Nothing is allowed to be unreachable.** A surface rendered
outside the shell's `KeyboardAvoidingView` pads itself with `useSheetBottomInset`.

Two traps make this less obvious than it sounds on Android:

- **`adjustResize` is inert here.** The app draws edge to edge -- and it does so whether or not
  `edgeToEdgeEnabled` says otherwise: RN forces the flag on API 36 (`WindowUtil.kt`), and on API 35
  it derives it from the theme, which declares no opt-out. So Android never resizes the window for
  the keyboard and **never scrolls a focused input into view** either. `AndroidManifest.xml`
  already carries `adjustResize` for Android 14 and below, where the window really does shrink; it
  is left there for that, not for this.
- **The thread is the scroll area, and it will not share.** A scroller inside the inverted list
  loses every drag to the list, which is measured, not feared (`docs/text-selection.md`). A surface
  that needs to scroll therefore cannot be a row of the conversation.

That second trap is what moved the question form. It used to be a row of the thread, at the point
the run stopped, and the pane left by the keyboard is smaller than the form: the thread could show
the question or the field, never both, and the reveal could only choose a slice. It is a surface
above the composer now (`ChatScreen`), capped at `70%` of the pane and scrolling itself, with its
title and its Send pinned outside that scroll, so the field and Send are both visible while it is
typed into. The thread keeps the tool call, which is the record of what was asked.

| Surface | Container | Why it is fine |
| --- | --- | --- |
| Conversation, editors, settings | the one `KeyboardAvoidingView` | it gives up exactly the overlap |
| ActionSheet, PromptSheet | absolute, outside it | pad themselves (`useSheetBottomInset`) |
| Drawer, ModelSheet | absolute, outside it | their field is at the top, nothing under the keyboard |
| The question form | above the composer | capped, scrolls itself, title and Send pinned |
| Long forms (ProviderEdit, ModelEdit, AgentFile) | a scroller each | reachable by scrolling; nothing is auto-revealed, and a field you cannot see is a field you cannot tap |

## Test

`src/app/__tests__/keyboardAvoidance.test.tsx` drives the real component: a layout, then the same
keyboard announcement twice, then a taller one, then the hide. It asserts the room left for the
conversation rather than the style that produced it, so it holds whichever way the avoidance is
spelled. Put `behavior="height"` back and it reports 240 where it wanted 1290.

`src/app/__tests__/questionKeyboard.test.tsx` holds the form's half of the rule: the form is drawn
above the composer and outside the list, the reveal happens in the card's own scroll area, and the
thread is not scrolled for it. `src/components/__tests__/questionCard.test.tsx` holds the pinning:
the title and Send are outside the scroller, the question is inside it.
