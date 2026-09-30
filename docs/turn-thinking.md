# The wait before a call produces anything

One muted line at the bottom of the thread, `Thinking · 18 s`, drawn from the server's instant and
taken down by the first thing the turn produces. It is the only thing on the screen through a wait
that is otherwise empty: a Codex turn at effort `max` sends nothing for thirteen to twenty seconds
before its first token (and no reasoning summary at all on a turn that goes straight to a tool), a
provider being retried is minutes of it. The thread read as dead, with the Stop button as its only
sign of life (2026-09-30).

## Where it lives

Thread state in the store (`chatStore.setThinking`), like the compaction's start instant, and
drawn by `TurnThinking` in the list header — the bottom of the thread, where the reader is
looking. Not a bubble: it belongs to no message, it disappears when the run speaks, and a bubble
would have to be inserted and removed in the list for it.

`chat.turn.thinking` sets it; the frames that mean "there is something to read now" take it down
(`frameRouter`): a text delta, a reasoning delta, a token count, a tool card, an abort, the run's
end. The server never tracks what is on screen, so the client owns both directions.

## Why the counter comes from the server

The frame carries the instant the call began, not an elapsed time: a window that joins mid-wait, or
that reloads while one runs, counts from the start of the call rather than from its own arrival.
Same rule and same reason as the reasoning span's `since` (my-claw's `docs/reasoning-visibility.md`).

## What it is not

- Not a spinner: a spinner says "something is happening somewhere"; the line says since when, which
  is the number that tells a slow model from a stuck one.
- Not the model's thinking: that is the `Reasoning` line, inside the bubble, when the engine sends
  any (and on several it sends none).
- Not shown during a compaction: the compaction has its own rule, and it owns the screen while it
  runs.
