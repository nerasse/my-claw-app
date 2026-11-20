# The thread does not move while it is being read

On native, a conversation is an inverted `FlatList` (`ThreadList.tsx`; the web list is described
below): the newest item is index 0 and sits at offset 0, so a
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

## Older pages

`src/core/historyPaging.ts` is the one pager, for both lists. It holds at most one request per
thread, sends the oldest held id with the count cursor, and accepts an answer only for the request
it sent (`beforeId` when the server echoes it, `before` otherwise). A page that never comes back is
dropped after 15 s and shows "Retry older messages"; the retry sends the same cursor again.

The edge of the thread can move while a page is out. A fresh window (a reconnect, a reset) or a
`chat.cleared` replaces the oldest item or the count the request was made from, and the request is
cancelled rather than allowed to prepend the wrong range. A window that keeps the same edge leaves
the request alone and only puts the spinner back.

A page can be empty on screen and still move: the server pages over journal entries, some of which
draw no row. The count cursor moves, the oldest displayed id does not, so the next request is sent
with the count alone (`countOnly`) and is made without a new gesture while the reader is still at
the top. A page that adds nothing and does not move the count stops with the retry, instead of
asking for the same page forever.

The list asks by itself in one more case: content shorter than the screen has no scroll range,
so no gesture can reach the top (owner, 2026-11-05: three turns, nothing older reachable). Both
lists ask while the content fits the viewport, and the store's guards keep that to one request.

## What was not taken

`react-native-streaming-message-list` (doctolib-lab) implements the ChatGPT "the answer snaps to the
top and a placeholder grows under it" pattern, which is a good answer to a different question: it
targets the *last* message growing. It requires `@legendapp/list` and `react-native-reanimated`, and
replacing the list wholesale. The owner runs this on a phone as a daily driver and asked for
something that stays simple to deploy: one native prop beats a dependency tree here.

## Tests

`__tests__/threadScroll.test.tsx` -- the props the native list is handed, and folding a row asks
for no scroll at all (neither `scrollToIndex` nor `scrollToOffset`). Two mutations kill: putting a
`scrollToIndex` back on the fold, and dropping `maintainVisibleContentPosition`.

`src/core/__tests__/historyPaging.test.ts` -- one request at a time, an answer for another cursor
ignored, a timeout that can be retried, `countOnly` pages, and a request cancelled when a window
moves the edge. `src/core/__tests__/threadScroll.test.ts` -- a day divider keeps its key across a
prepend, and a folded run is one cell. The web list's geometry is checked in a browser
(docs/ui-browser-check.md).

## The web is not inverted

The inversion is a platform decision. A browser selects text in DOM order, and an inverted list
puts the DOM in the opposite order from what the reader sees: a drag over several messages started
at the bottom of a frame and could snap to the whole thread (owner, 2026-11-14). So the web list is
`ThreadList.web.tsx` and the document runs oldest first. Native keeps `ThreadList.tsx`.

The web list is `@tanstack/react-virtual` with `anchorTo: 'end'` and `followOnAppend`, the setup its
docs give for a chat, and the same direction OpenCode takes. The earlier version kept its own
offsets: a pin computed from content size, an anchor saved before a prepend and applied after, and
several handlers trying to tell a hand from a layout change. Each correction ran one step behind
the virtualized rows it was correcting, which is how a long thread opened in several visible
descents and paging stopped after two pages (measured on 0.6.232: up to 8,332 px above the bottom
on open, and a 20-message hole at a page seam).

What each part does now:

- **Opening.** The scroller is laid out hidden, with a small spinner in its place, until the last
  row is mounted and the element is at its real end. The reader sees one frame: the newest
  message above the composer. Rows that grow later (an image, a code block) are measured by the
  virtualizer, which keeps the end in place while the reader is there.
- **Following.** `followOnAppend` follows a growing answer only while the view is at the end. A
  reader who scrolled up stays where they are. A shrinking viewport (keyboard, window resize) puts
  a reader who was at the end back there.
- **Paging.** Older rows go in front, and the virtualizer keeps the first visible row where it was.
  A request leaves when the reader scrolls up within one screen of the top, or uses the wheel,
  Home, PageUp or ArrowUp at the top. Stopping at the top does not make a request; only `countOnly`,
  above, continues without a new gesture.
- **Folded runs.** A collapsed run is one cell. Neither scrolling nor paging opens it, so
  `session.run.items` is only sent when the reader expands it, once per range. Opening it changes
  that cell's height and nothing else.
- **Day dividers** are drawn in the same cell as the row that opens the day
  (`threadCells`), so a prepend within one day does not give a different row the divider's key.

## The scrollbar is the platform's, on the web

`useScrollIndicator` draws a 3 pt themed thumb on native, because Android paints its own bar over
the rows. In a browser the system bar is a real control (drag, click to page, assistive tech), so
the web list draws none of its own. The scroller is the whole pane and the reading column is
centred inside it, which puts that bar at the window's right edge.
