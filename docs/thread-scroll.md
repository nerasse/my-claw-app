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

## Nothing moves the list on a fold

It did, and that was the bug. Every block that folds -- run groups, `ToolCard`, `SubAgentCard`,
`ScrollableBlock`, and every `CollapsibleAside`, reasoning and compaction summaries included --
used to call `scrollToIndex({ index, viewPosition: 1 })` to bring the opened row to the top of the
reading area. That put a **second writer** on an offset `maintainVisibleContentPosition` was already
adjusting, and it computed its destination **before** the layout it was reacting to, through an API
that has no `getItemLayout` to work from and falls back to the average cell length. The owner's
report was the result: the row that was tapped ended up somewhere else, opening and closing alike.

So the fold scroll is gone, and `maintainVisibleContentPosition` is the only writer. It already
does this job, and it does it natively: the anchor is the newest visible row, and whether the folded
block sits above or below it, the anchor's position in content coordinates does not change -- so the
window does not move and the row under the finger stays under the finger. There is no destination to
compute, no estimate to be wrong, and no second writer to disagree with.

The reasoning that made it look necessary is worth keeping: nothing here can be derived from an
index. Heights are unknowable (markdown, images, tool output) so `getItemLayout` is out, and
`scrollToIndex` without it estimates from the average measured cell. A fold is also the one gesture
whose target **changes size as you look at it**, which is exactly what the anchor prop exists for.

A known React Native defect sits next to this and is *not* what was happening
([react-native#58578](https://github.com/react/react-native/issues/58578), open, present in 0.86):
on a shrink, the anchor delta is applied to an offset the platform already clamped, driving it below
zero. On an inverted list offset zero is the **newest** message, so its worst case is landing on the
bottom of the thread -- where a reader near the end already is -- not the jump away from the tapped
row that was reported. Worth knowing, not worth a workaround.

## A thread shorter than the screen

`onEndReached` is what pages a conversation, and an inverted list only has an end when its content
is taller than the viewport. A thread of two or three turns has no scroll range at all, so the
callback fires once at mount -- before the page frame that carries `hasMore` has landed -- and then
never again: there is no gesture left to make. The owner opened a conversation, saw three turns,
and could not reach anything older (2026-11-05).

So the screen asks by itself. `useScrollIndicator` already measured both figures for its thumb and
now reports them (`onMeasure`); when the content does not fill the viewport, the list sends the
same `onLoadOlder` the gesture would have. Two details are the whole fix:

- The ask is keyed on the **cursor**, not on the content height. The page that says `hasMore`
  arrives after the first measure, and a flag latched on the height would treat that as "already
  asked" and never send.
- The guards stay the store's (`hasMore`, `loading`). The screen is not a second pager; it is the
  one reach the list cannot make itself. A page arriving makes the content taller, the measure
  changes, and the next ask is refused by nothing older.

`__tests__/olderPageReach.test.tsx` pins the three cases: a short thread with older work asks once,
an exhausted history asks nothing, and a page already in flight is not asked for again.

## What was not taken

`react-native-streaming-message-list` (doctolib-lab) implements the ChatGPT "the answer snaps to the
top and a placeholder grows under it" pattern, which is a good answer to a different question: it
targets the *last* message growing. It requires `@legendapp/list` and `react-native-reanimated`, and
replacing the list wholesale. The owner runs this on a phone as a daily driver and asked for
something that stays simple to deploy: one native prop beats a dependency tree here.

## Tests

`__tests__/threadScroll.test.tsx` -- the props the list is handed, and folding a row asks for no
scroll at all (neither `scrollToIndex` nor `scrollToOffset`). Two mutations kill: putting a
`scrollToIndex` back on the fold, and dropping `maintainVisibleContentPosition`.

## The web is not inverted

Everything above is about the inverted list, and the inversion is a platform decision, not a
preference: `inverted` in `ChatScreen` is `Platform.OS !== 'web'`.

A browser cannot invert a conversation. Inverting there is a DOM order that runs backwards from
what the reader sees -- newest first, drawn from the bottom under a `scaleY(-1)` on the scroll view
and on every cell -- and a browser selects text in DOM order. The owner's report (2026-11-14) is
exactly that: a drag over several messages began at the bottom of a frame, ran the wrong way, and
could snap to the whole thread. No `user-select`, `::selection` or `pointer-events` rule reaches
that; the nesting is the cause.

So on the web the document runs oldest-first and the newest message is the **end** of the range:

- **Pinned to the newest message.** There is no offset to open on, so `onThreadContentSize` sends
  the list to its end while the reader is following it -- and that end is a *measurement*
  (`content` minus `viewport`, both reported by the scroll indicator), not `scrollToEnd`, which aims
  at an estimate built from the average cell height and stopped a few points short of it: the last
  answer stayed clipped under the composer on a thread of two-line turns (measured 2026-11-14).
  That is also how a thread of forty thousand rows opens on its last message.
- **A hand on the wheel unpins.** A browser reports no end of gesture -- there is no touch responder,
  so a wheel notch and a drag on the scrollbar look like any other scroll. What they do that a
  programmatic scroll never does is move the offset *up* while the reader is away from the newest
  message, and that is the signal. Content arriving under a pinned reader changes the content height
  and leaves the offset alone, so it never reads as a hand. Coming back within `NEAR_NEWEST_PX`
  pins again, which is the same intent as the native `onScrollEndDrag`.
- **Paging is the other end.** Older rows are at the *top*, so the list pages on `onStartReached`
  (native keeps `onEndReached`). A page inserted above the reader moves everything on screen down by
  its height, and nothing compensates for that on the web, so `prependAnchor` takes the offset and
  the content size before the request and `onThreadContentSize` adds the difference once it lands --
  what `maintainVisibleContentPosition` does for free on native. Two details are what make it hold
  at all: the anchor is kept across the whole settle rather than spent on the first change (a
  virtualized list grows in steps, and a page spent on the first step left the reader two pages
  away), and only one page is ever in flight (`pageOlder` refuses while an anchor is live, because
  the start of the range reads as reached again during the settle). The scroll listener also holds
  the offset while an anchor is live, so a step of growth cannot be left on screen. The list's own
  report of reaching the start is ignored while the reader is pinned: mounting at the top of the
  document reports it before the pin has moved anything, and paging there would load history nobody
  asked for. What remains is a *transient* -- the reader can sit on the older page for ~1.8 s while
  the rows above are measured; the end position is exact. docs/ui-browser-check.md has the numbers
  and the two candidate fixes.

`src/core/threadScroll.ts` holds what both geometries share -- `nearNewest`, `prependShift` -- so
three handlers cannot drift apart on a sign.

## The scrollbar is the platform's, on the web

`useScrollIndicator` draws a 3pt themed thumb and hides the system bar, because on Android that bar
is an overlay painted *over* the rows. In a browser that bar is a real control -- draggable,
clickable to page, readable by assistive tech -- so the thread passes `systemBar` there: nothing is
hidden and nothing is drawn.

The scroll surface is also the **pane**, not the reading column. The column is capped inside it by
`contentStyle` (`layout.toolWidth`, centred), which is what puts the bar at the window's right edge
instead of a few hundred points short of it on a wide screen. Rows already cap themselves, so
nothing about the reading width changes.
