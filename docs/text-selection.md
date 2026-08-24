# Selecting text out of a conversation

Two platform facts decide the whole design. Neither has a workaround at our level.

**A selection never leaves the `Text` node it started in.** React Native has no cross-node
selection, and rendered markdown is one node per block (`react-native-marked` builds a paragraph,
a list, a code fence as siblings). Dragging over an answer therefore grabs the paragraph the
gesture began in and refuses the rest. Longer the message, more useless the gesture.

**A selectable text view inside the chat list throws the thread.** `selectable` makes the native
`TextView` focusable, a long press gives it focus, and Android's `ScrollView` answers a focus by
scrolling to the focused child. The chat list is inverted (`transform: scaleY(-1)` on the list and
on every row), the scroll math is done on untransformed coordinates, and the list lands somewhere
else entirely. Reported as [facebook/react-native#33419](https://github.com/facebook/react-native/issues/33419),
open since 2022, no fix.

## The rule

```
inside the chat list      -> nothing is selectable, ever
taking text out of it     -> the selection viewer, one node, raw source
```

- `Bubble` renders no `selectable`, and a **long press** on a message opens its action sheet
  instead: the gesture that used to start a broken selection now leads where selection works.
  Only where the platform cannot do it itself, though (`chatSelectable` in `core/platform`): a
  browser selects across nodes on its own and the list opts back into `user-select`, so there the
  hold would fire in the middle of the drag the reader is making to select and steal it. On the web
  the bubble carries no long press at all -- right-click and the row's own button lead to the same
  menu.
- `ToolCard` and `CollapsibleAside` (reasoning, compaction summary) carry `BlockActions`:
  **copy** takes the block whole, **select** opens the viewer on it. On the web `BlockActions`
  renders nothing (`blockActionsSupported` in `core/platform`): the browser selects across nodes
  and copies with a keystroke, so the pair would only repeat, twice per tool card, what the
  pointer already does. `CodeBlockBar` keeps its copy button everywhere -- a fence is meant to
  leave the app verbatim and dragging over twenty lines of it is not the same offer.
- `ScrollableBlock` caps every block of tool text at `BLOCK_MAX_HEIGHT`. On the web that is a
  real overflow (`blockScrollSupported`): the wheel scrolls what is under the cursor and no
  gesture is disputed. On a touchscreen the block is clipped and a `see all` bar opens the same
  viewer, because a ScrollView nested in the inverted list fights it for every drag. The cut is
  measured in a layout pass, never guessed from the character count, so a block that fits offers
  nothing. What it opens is the **whole** output: a card arrives clipped to the server's
  `TOOL_OUTPUT_LIMIT`, and unfolding it sends `chat.tool.full` (`core/toolOutput.ts`, once per
  card). The clip is a transport decision, not a display one -- every reconnect replays a page of
  history, so the bytes would be paid for by every device, every time.
- The bubble menu carries `Select text`, which opens the viewer on the **whole message**:
  reasoning, answer and summary joined by `messageSelectionBody`, in the order they were written.
- `SelectionViewer` is a plain top-anchored `ScrollView` holding one `<Text selectable>`. One node
  means a drag crosses headings, fences and paragraphs alike; not inverted means a focus scroll is
  at worst a no-op. The system menu adds its own *Select all*, *Share*, *Translate*.

The viewer shows the **raw markdown source**, not a rendering of it. What a reader wants in their
clipboard is a path, a command, a fenced block, exactly as written, and rendering it would split
it back into the nodes that caused the problem.

Outside the chat list (document viewers, settings, diagnostics) `selectable` is fine and is kept:
those screens are ordinary scroll views, and their text is one node per field.

## Inline metrics, the other half of the bug report

Not selection, but it landed with it. An inline run shares the line its prose builds, and Android
gives that line the metrics of whichever span states them. A code span at its own font size, with
padding and `overflow: hidden` to clip a rounded plate, shrank the line it sat in: rows drew over
each other and the grey plate landed off its own glyphs. The compaction summary and the reasoning,
both dense in code spans, were the worst of it.

So an inline run wears the prose metrics and marks itself with the face, the ink and the plate
only. Guarded by `src/components/__tests__/markdownInline.test.ts` for the chat sheet at both
tones and for the document sheet.
