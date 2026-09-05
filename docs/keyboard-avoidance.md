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

## Test

`src/app/__tests__/keyboardAvoidance.test.tsx` drives the real component: a layout, then the same
keyboard announcement twice, then a taller one, then the hide. It asserts the room left for the
conversation rather than the style that produced it, so it holds whichever way the avoidance is
spelled. Put `behavior="height"` back and it reports 240 where it wanted 1290.
