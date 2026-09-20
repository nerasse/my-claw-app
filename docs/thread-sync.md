# What a `session.sync.result` does to a thread

A thread on screen is one list of items per conversation, held for as long as the app lives. The
server answers `session.sync` with one of two things, and the difference decides whether the answer
is added to that list or replaces part of it.

| What the server sent | How to tell | What happens |
|---|---|---|
| A delta (what follows the client's cursor) | no `reset`, no `nextBefore` | appended; an id already held is patched **where it sits** |
| A window (the newest page of the branch) | `nextBefore` present | `applyWindow`: the range it covers is replaced |
| `reset: "unknown-cursor"` | the cursor is gone | the thread is replaced |
| `reset: "branch-switch"` | the leaf moved off the client's path | the thread is replaced |

A window is what a null cursor asks for, and `resume` sends exactly that on every reconnect, so it
lands on a thread that is rarely empty.

## Why a window is not a delta

Both carry entries the client mostly already holds, and an id it holds is patched in place either
way, so appending a window looks harmless. It is not, because two things a window draws come under
an id the live run never used:

- **A run that died before its first token.** The bubble on screen was invented locally from the
  stream id (`abortStream`), while the server journalled a `failure` entry of its own. Two
  identities for one error. Fixed at the root server side (my-claw 0.7.2 hands the entry the id of
  the bubble it is shown in), but a thread drawn by an older server still carries the pair.
- **A finished run.** The window folds its work into one header row (`run-<first entry id>`,
  docs/run-hydration.md) standing for the cards the client holds one by one.

Appended, both land at the end: the same error a second time and the same run a second time, below
the message they precede. Session 37e36291 is the captured case, and the reader saw
`question, error, question, 5 tool calls, answer, error, 5 tool calls`.

## Where a delta puts what it carries

An entry the thread does not hold is **inserted where its timestamp says**, not appended. Appending
was the rule, on the grounds that a delta is newer than what is persisted, and one entry breaks it:
the folded run header. Its id names a range rather than an entry, so the thread can never hold it
beforehand, and its place is where the run *began* -- not where the delta started. Appended, it
landed after the answer it stands behind, and the reader got the collapsed group below the message
it belongs to (2026-09-10, "the last message was inside the group").

The scan walks back from the end and stops at the first entry that is older, so an order the thread
already had is never rearranged and a plain fresh frame -- the common case -- still lands last.

## What a window may not touch

- **What it does not cover.** The pages the reader walked back to sit above it. A window is the
  newest page, capped, and a reconnect must not yank the history out from under someone who
  scrolled up. The cut is the first held item that is not older than the window's oldest, or that
  the window carries by id.
- **What only this device holds.** The bubble being streamed into, the tool card still running,
  the send still parked, and the question that started the turn in flight. The last one matters
  because the server writes a question under the id the app minted for it: an unmatched user
  bubble is one the log does not hold *yet*, never a second copy of one it does. Those items go
  after the window, where they belong.

  **Unless its run travelled folded.** A card still marked `running` from a run whose work this
  page now carries as one header can never be reconciled: the page does not hold its id at all, so
  it stays live for good and is re-appended after the page on every sync. There it sits *after* the
  message, and the group then swallows the message into itself -- the run's own last words rendered
  as part of its collapsed work. An item whose run is folded by the incoming page is dropped.

Everything else inside the range defers to the window. That is the point: it is the truth there.

## The one state a delta cannot infer

`session.sync.result` carries `compacting` -- the compaction running on the thread, if any. The
router applies it in **both** directions: present, the rule is raised; absent, it is taken down. The
absence is the half that matters.

The app raised that rule from a frame and lowered it from a frame, and a frame that never arrives
lowers nothing. The end of a compaction is broadcast once, to the windows connected at that second,
and a phone whose socket drops every ten to forty minutes is regularly not one of them. Everything
else on the thread corrects a window that missed it: the boundary is in the history, the end of a run
arrives with the run, a fresh page predates whatever was in flight, a stream opening proves the
compaction holding the run is behind. A compaction that ends while the thread is quiet has none of
those, and the rule stayed up with its counter still climbing from the start.

Measured on the owner's phone, 2026-09-13: a `/compact` that succeeded at 18:57 was still drawn at
19:13, eighteen minutes fifty-nine on the counter, next to the boundary it had written. `/stop`
answered "Nothing running", which was true, and read as the server losing the plot.

It is said on every sync rather than once, because the case that matters is precisely the one with no
event to carry it.
