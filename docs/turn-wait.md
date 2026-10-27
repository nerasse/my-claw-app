# The wait before a call produces anything

One muted line inside the bubble the call opened, `wait · 18 s`, counted from the server's
instant and taken down by the first thing the turn writes into that bubble. It is the only thing on
the screen through a wait that is otherwise empty: a Codex turn at effort `max` sends nothing for
thirteen to twenty seconds before its first token (and no reasoning summary at all on a turn that
goes straight to a tool), a provider being retried is minutes of it. The thread read as dead, with
the Stop button as its only sign of life (2026-09-30).

## Why it lives in the bubble

The server opens the bubble the reply will land in as soon as the call starts, and sends
`chat.turn.wait` for it. The first version drew the line at the foot of the thread, as thread
state. That left the bubble the call had opened standing empty, and `Bubble` draws a bare caret in
an empty streaming bubble: a white bar at every turn, beside a line that belonged to no bubble
(owner, 2026-09-30). The wait belongs to the reply that is about to land, so it is the bubble's:
`TextItem.waitingSince`, drawn by `Bubble` in place of the caret.

The tests that let the first version through looked at the line and never at the bubble. The one
that matters (`waitLine.test.tsx`) asserts the caret is *not* on the screen.

## It waits before saying anything

The line is shown only once the call has been silent for `WAIT_REVEAL_MS` (three seconds). The
engines that stream their reasoning put the first delta on screen in one to two seconds (measured:
deepseek-v4.1-flash, 1658 ms), so without the threshold the line appeared and was replaced almost
at once — a flicker the owner read as "a counter written before the model even thought"
(2026-09-30). What the line is for is the silence: Codex at effort max sends nothing for thirteen
to twenty seconds, a provider being retried for minutes.

A threshold rather than a list of engines: which model reasons silently is not a property of a
provider, and a list would be wrong the day a new one arrives. Three seconds is three times the
slowest first delta measured.

The counter still counts from the call's own start, so the line appears already saying "3 s" and
climbs from there. Under the threshold the bubble is not drawn at all: no caret (what the first
version got wrong), and no frame either. With the caret gone, the bubble still stood there empty,
its clock and its ⋯ under a tool card, before the model had written anything (owner, 2026-10-04).
It appears with the line, or with the first token, thought or count, whichever comes first.

## Lifecycle

`chat.turn.wait` marks the bubble (`chatStore.markWaiting`). The store takes the mark down when
the turn writes into the bubble: a text delta, a reasoning delta, a token count. The server never
tracks what is on screen, so the client owns both directions.

A call that goes straight to a tool leaves the bubble empty: `endStream` removes it, and so does a
stop with no error (`abortStream`). An error still lands on the bubble that was waiting.

## Why the counter comes from the server

The frame carries the instant the call began, not an elapsed time: a window that joins mid-wait, or
that reloads while one runs, counts from the start of the call rather than from its own arrival.
Same rule and same reason as the reasoning span's `since` (my-claw's `docs/reasoning-visibility.md`).

## What it is not

- Not a spinner: a spinner says "something is happening somewhere"; the line says since when, which
  is the number that tells a slow model from a stuck one.
- Not the model's reasoning: that is the `Reasoning` line, inside the bubble, when the engine sends
  any (and on several it sends none). The wait gives way to it. The line carries `wait` and no word
  about thinking, because nothing has come out of the call yet and the app does not know which of
  the two it is -- a model reading a long prompt and a provider being retried read identically from
  the outside.
- Not shown during a compaction: the compaction has its own rule, and it owns the screen while it
  runs.

## The figure it leaves behind

The counter is a live measure against the device's own arrival of a frame, and it dies with the
stream: a thread reopened an hour later had nothing to say about how long the call had taken to
start. So the bridge times the call where it starts and where its first delta lands -- reasoning or
answer, `onFirstOutput` -- and sends the figure on the same frame type, once, into the bubble the
call wrote into. `TextItem.waitMs` holds it, the log keeps it as `PhaseEntry.waitMs`, and the
reasoning row draws it opposite the label: `Reasoning · 1.2k tokens · 12 s      wait 4 s`.

Two durations on one row, deliberately kept apart. `12 s` beside the label is what the thinking
lasted; `wait 4 s` is how long the reader watched nothing at all before the first word. They are
usually close (a model that streams its thought has a wait of a second or two) and they are not the
same measurement, so folding them together would read as one span counted twice.

A call that streamed no reasoning at all still has a wait, and it is then the row's only content:
drawn only past `WAIT_REVEAL_MS`, so an engine that answers in a second does not add a line to every
bubble. Alone on the row it starts at the left rather than the far end, because a lone figure pushed
right sits exactly where the bubble's clock sits.

`waitMs` on a phase whose call went straight to a tool is never drawn: the bubble it would sit in
does not exist, and `pushWait` refuses to open one. The card that follows is the story.
