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
the answer they precede. Session 37e36291 is the captured case, and the reader saw
`question, error, question, 5 tool calls, answer, error, 5 tool calls`.

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

Everything else inside the range defers to the window. That is the point: it is the truth there.
