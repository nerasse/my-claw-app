# The composer's field

One rule: **the frame is a wrapper, the text is the child**. Border, background and padding live
on a `View`; the `TextInput` inside carries only typography and its own ceiling.

```
View  (styles.field)     border 1, background, padding 9, minHeight 44, radius pill
└── TextInput (styles.input)  padding 0, fontSize, color, maxHeight = MAX_TEXT_HEIGHT.<variant>
```

## Why, three measured bugs

**Android, the text crossed the border.** With the border and the padding on the `TextInput`
itself, an EditText past its `maxHeight` scrolls its own padding away with the text: the lines came
to sit on the rounded edge, the top one sliced in half. Nothing clips it back, because that padding
is inside the scrollable area. Moving the frame out is the only fix.

**Web, a permanent two-pixel offset.** `autoGrow` sized the textarea from `scrollHeight`, which is
content plus padding and **excludes the borders**, while react-native-web sets
`box-sizing: border-box` on every element it renders (`View/index.js`). The box was therefore short
by exactly the border: the field scrolled by 2px for good and the first line was sliced by the top
edge. It moved with the caret, which is what made it look intermittent. `autoGrow` now adds the
computed border widths back.

**Web, two ceilings that disagreed.** `autoGrow` was called with 180 (240 in hero) while the
stylesheet capped the field at `maxHeight: 112` (200 in dense, and hero inherited 112). Off a
desktop, the inline height was clamped by the CSS while `overflowY` was left `hidden`, because the
overflow test used the other number: a fifth line was neither visible nor reachable by scrolling.
There is now one constant, `MAX_TEXT_HEIGHT`, read by the stylesheet and by the effect.

## Numbers

`MAX_TEXT_HEIGHT` is the **text** ceiling, padding excluded:

| Variant | Text | Frame padding | Field at the ceiling |
| --- | --- | --- | --- |
| compact (phone) | 94 | 9 + 9 | 114 |
| dense (desktop, fine pointer) | 188 | 6 + 6 | 202 |
| hero (empty conversation) | 218 | 11 + 11 | 242 |

Empty, the frame is 44 tall on purpose: the exact height of the send and attach buttons beside it.

`autoGrow` also forces `rows = 1`. A textarea is two rows tall by default and that intrinsic height
is a floor `scrollHeight` never goes under, so one line of text measured as two and the composer
stood 8pt taller than the round buttons next to it.

## Measured, in a real Chromium

A harness rendering the composer alone, bundled with `metro.config.web.js` and driven by
playwright-core:

| Content | Text box | Frame | overflow-y | scrollTop |
| --- | --- | --- | --- | --- |
| one line | 16 | 44 | hidden | 0 |
| two lines | 32 | 52 | hidden | 0 |
| twelve lines | 94 | 114 | auto | 0 until the caret moves |

`scrollHeight == clientHeight` under the ceiling is the assertion that matters: it is what says the
field is not scrolling behind its own border.

## Why the composer is the only field whose first letter got cut

The frame carries the padding and the `TextInput` carries none, and that is deliberate: an
`EditText` past its ceiling scrolls its own padding away with the text, so the vertical padding has
to live outside it. The horizontal padding is on the wrapper for the same reason.

Android 15 (API 35) changed how a `TextView` sizes and offsets a line -- it uses the glyphs' visual
bounds rather than their advances -- and left the pre-15 behaviour one attribute away. The app
restores the pre-15 world in `android/app/src/main/res/values/styles.xml` (see `TextViewStyle`),
but React Native hands a `TextInput` to the platform's own `EditText` and never lays its text out
itself, so the fix it shipped for `Text` does not reach a field. `EditTextStyle` therefore needs the
same two attributes, and did not have them.

With the new default, a field that carries no padding of its own has its first glyph drawn at a
slightly negative x and clipped. Every other field in the app pads its own `TextInput`, which is
why the cut was only ever seen here: the composer's text sits at x=0 of the `EditText`, and a dozen
input fields elsewhere never showed it. Restoring the pre-15 attributes puts the advances back in
charge.
