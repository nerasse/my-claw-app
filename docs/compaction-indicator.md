# Compaction indicator (app side)

How the app shows a compaction that is running on a conversation, and why it is **thread state
drawn as a rule**, not a bubble in the list. The server side (gates, summarizer, frames) is in
`docs/compaction.md` and `docs/live-turn-replay.md` of the my-claw repository.

## What the owner sees

- While the summarizer runs: one rule across the bottom of the thread,
  `Compacting the context · 3m 18s`, counting from the server's start instant (`since`).
- When it is done: the rule the history draws, `Context compacted · 971 turns summarized`, with
  the summary folded under it (`CompactionBoundary`). Live and after a reload it is the same row,
  keyed by the server's entry id.
- Nothing else. No bubble, no long-press menu, no time stamp, no notification.

## Why not a bubble

Until 0.6.42 the indicator was a text item in the thread (`id: compacting`, `streaming: true`,
`command: true`), reusing the placeholder a slow `/compact` gets. That shape was the bug the owner
reported as *two `Compacting the context...` bubbles wandering through a run an hour after the
compaction ended*:

- an item is **kept** by every sync delta (it counts as live) and **moved to the end** of the
  thread by each of them, so a stale one travels down the run as work arrives;
- a fresh page drops it and the replay recreates it, a delta keeps it, so depending on the order
  of frames a window ended with zero, one or two of them;
- exactly **one frame** could remove it (`chat.compacting` without `since`), sent once and replayed
  to nobody. A socket that was a zombie at that second kept the bubble for good.

State has none of those properties. `chatStore.compacting: Map<threadId, since>` is one per
thread by construction, no list operation touches it, and several independent signs of life end
it.

## Lifecycle

Set by `chat.compacting { since }` (live, and replayed after a `session.sync` while the operation
still runs). The `since` of the last frame wins: a replay names the same start, a new compaction
names its own.

Cleared by any of:

| Signal | Why it means the compaction is over |
|---|---|
| `chat.compacting` without `since` | the server settled it (`finally` on every path) |
| `chat.compaction` (boundary) | the compaction wrote its result; also written to history, so it arrives on every path a window can take |
| `chat.run.end` | a compaction runs inside its run (gate at the start, overflow retry in the middle) and never outlives it |
| `chat.stream.start` | the summarizer never streams: an answer opening means the run resumed |
| a fresh page (`session.sync` reset, history load) | post-dates whatever was heard; a compaction still running is replayed right after it |
| `clearThread` / `clearAll` | the thread is gone |

A delta sync does **not** clear it: the server holds the run's frames back during a compaction,
so a delta arriving while the state is set describes work from before it.

## `/compact` typed by the owner

The server sends `chat.command.pending` ("Running /compact...") after 400 ms, and the compaction
announces its start once the session log is loaded, which on a long thread is later. Either order
ends with one sign of the operation:

- notice first: `setCompacting(since)` removes the notice bubble (the rule takes over);
- compaction first: `addCommandPending` is a no-op while the state is set.

A successful `/compact` answers with no bubble (the boundary is its report). A failure answers
with a `chat.command.result`, which lands as its own bubble since the notice is gone.

## Stop

The Stop button follows `useActiveRun(thread) || useCompacting(thread) !== undefined`. A `/compact`
the owner typed holds the session for one to two minutes with no run behind it, so a button pinned
to the run alone left nothing on screen to interrupt it with. The button sends the same `chat.stop`
frame; the server's `runRegistry.stop` aborts a compaction the way it aborts a run (server
`>= 0.6.4`, which hands the hold's signal to the summarizer), and the compaction answers
`Compaction stopped.` while its end frame takes the rule and the button away.

## Rendering

`ChatScreen` reads `useCompacting(threadId)` and renders `CompactionRunning` in the FlatList
header. The list is inverted, so the header is the bottom of the screen: the rule sits under the
newest message, where the thread actually stops, next to the loose question cards that live there
for the same reason.

**Unless a send is parked behind that compaction.** A parked bubble is a row, so the header draws the
rule *under* the message waiting for it, while the boundary the compaction goes on to write sits
*above* the same message: the thread reorders itself under the reader as the run ends, for no reason
he could see. `compactionRuleBefore(items)` (in `core/runRows.ts`) names the first bubble queued with
reason `compaction`, and `withCompactionRule(rows, before)` inserts `{ kind: 'rule' }` immediately
above the row that draws it. The header keeps it while nothing is parked. Only `compaction` counts:
a send queued for the next turn boundary of a live run (`injection`) is not waiting for this.

**Why the rule is a row and not a decoration on the cell** (fixed in 0.6.53). It was drawn inside
the parked bubble's cell, as the first child of the row boundary, and that is not a reading order
the list honours. `inverted` renders every cell in `flexDirection: 'column-reverse'` under a
`scaleY(-1)` transform (`VirtualizedListCellRenderer`), so a cell holding two children lays them
out the other way round: the owner saw the bubble above the rule that was meant to stand above it
(2026-09-11). A row is ordered by the data, which is exactly what the inversion is built on, and
that holds whatever a cell does with its children.

The counter is `useElapsed(since)`, refreshed every second while the app is in the foreground.
React Native pauses JS timers while the app is in the background, so a counter can read stale on
the first frame after a resume; it catches up on the next tick.

## Tests

- `src/core/__tests__/compactionRule.test.ts`: where the rule attaches when a send is parked.
- `src/core/__tests__/chat.test.ts`: state not item, last `since` wins, every clearing signal,
  delta keeps it, `/compact` notice in both orders, failure still answers.
- `__tests__/Commands.test.tsx`: one rule for two start frames, counted from `since`, the boundary
  takes its place without an end frame, a run ending removes it.
