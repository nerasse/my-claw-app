# The thread does not move while it is being read

A conversation is an inverted `FlatList`: the newest item is index 0 and sits at offset 0, so a
thread opens on its last message with no scrolling, no content height to estimate, and the keyboard
shrinking the viewport leaves the offset where it was. That is the whole reason for inverting it.

It is also the reason the page moved. The axis is flipped, so offset 0 is the **bottom**, and the
anchor the list holds is the newest message. While the reader is glued to it, everything is right:
new content enters from the bottom and they follow it. The moment they scroll up to read a paragraph,
the offset stops being the newest message -- and every pixel appended below it (a new item, or the
answer growing token by token) shifts the window while the offset stays put. The text climbs the
screen for as long as the answer streams.

## `maintainVisibleContentPosition`

The documented answer, and the properties below it are native: `ScrollView`'s own prop, iOS **and**
Android, as `node_modules/react-native/Libraries/Components/ScrollView/ScrollViewNativeComponent.js`
shows. It was the reason `@stream-io/flat-list-mvcp` existed -- an Android shim, from before the
platform had it -- and no such dependency is needed here.

The doc says it almost literally:

> adjust the scroll position so that the first child that is currently visible [...] will not change
> position. This is useful for lists that are loading content in both directions, e.g. a chat thread,
> where new messages coming in might otherwise cause the scroll position to jump.

```tsx
maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: NEAR_BOTTOM_PX }}
```

`minIndexForVisible: 0` makes every row a candidate, the newest included. And the threshold is not a
new number: it is the same `NEAR_BOTTOM_PX` (120) that already means "near the bottom" to
`handleScroll` and to the jump-to-latest button. Near the newest message the reader is following and
not reading, so the list keeps following; further up it does nothing at all.

Known limits worth knowing rather than rediscovering: rapid data updates (intervals under ~200 ms)
can outrun it on both platforms (react-native#53542), and on Android with the New Architecture a
prepend can draw one stale frame before settling (react-native#58186). Neither is a reason to reach
for an anchor implementation of our own -- the symptom they describe is a hitch, not the permanent
drift above.

## `viewPosition: 1`, and why it is not 0

Not moving is not the same as showing. Unfolding a block is a request to **read** what was revealed,
so the row is moved explicitly, in both directions:

- **opening** brings the top of the row to the top of the reading area, so the content is read from
  its first line instead of hunted for by scrolling up;
- **closing** asks for the same row again, so it stays where the reader left it -- it came to the top
  when it opened -- rather than dropping them back down the thread.

The value is `1`, not the usual `0`, and that is arithmetic rather than taste.
`VirtualizedList.scrollToIndex` computes:

```
offset = max(0, cellOffset(index) - viewPosition * (viewportLength - cellLength))
```

The ScrollView is flipped with the content, so an offset does not address the same edge it would in a
normal list: `0` targets the bottom edge and `1` the top one.

## How a row asks

A row does not know its index -- only the screen does, and only at the moment of the tap. Two
contexts, split on purpose (`components/RowFocus.tsx`):

- `FocusRequestHost` carries the handler, provided once around the list;
- `RowKey` carries the row's own name, provided per row by `renderRow`.

They are separate because both halves have to compare **by value**. `VirtualizedList` is a
`PureComponent`: a fresh object identity per row, or a handler rebuilt when `focusRow` changes, would
re-render every cell on screen on each arrival. A string and a `useCallback` do not. `focusRow`
therefore reads the rows from a ref rather than closing over them.

Every block that folds calls `useRowFocus()` when it toggles: run groups (through the screen, which
already owns their state), `ToolCard`, `SubAgentCard`, `ScrollableBlock`, and every
`CollapsibleAside` -- reasoning and compaction summaries included. Outside a thread there is no
host, the hook returns `undefined`, and the same components work unchanged.

`onScrollToIndexFailed` is mandatory, not a nicety: without `getItemLayout` -- and there can be none
here, markdown, images and tool output have no knowable height -- `scrollToIndex` asserts unless it
is given one. It retries once, once the window has caught up.

## What was not taken

`react-native-streaming-message-list` (doctolib-lab) implements the ChatGPT "the answer snaps to the
top and a placeholder grows under it" pattern, which is a good answer to a different question: it
targets the *last* message growing. It requires `@legendapp/list` and `react-native-reanimated`, and
replacing the list wholesale. The owner runs this on a phone as a daily driver and asked for
something that stays simple to deploy: one native prop beats a dependency tree here.

## Tests

`__tests__/threadScroll.test.tsx` -- the props the list is handed, and an unfold actually asking for
a scroll with `viewPosition: 1`. `src/components/__tests__/rowFocus.test.tsx` -- the aside asks for
its row in both directions, and asks for nothing when it is not in a thread. Five mutations kill:
dropping the anchor, dropping either `focus?.()`, `viewPosition: 0`, and dropping the failure
handler.
