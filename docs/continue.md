# Continue, in the app

The server side (what a Continue runs, and when it is refused) is `docs/continue.md` in the server
repo. This is what the app draws.

## A button at the foot of the thread

`ContinueButton`: a pill on its own row, centered, at least 44 dp tall, under the thread's last run
when that run stopped, failed or was lost (still marked running while the thread is at rest). One
press sends `chat.continue`; the button is gone until the run it starts ends.

It used to be the last word of the run's signature (`RunFoot`), in the signature's 10 pt type, on
the same row as the bubble's `⋯`. Two touch targets side by side, both small: the owner kept
opening the menu instead (2026-10-02). The signature keeps what it says (`run · 42 s · Stopped`),
and the button has a row nothing else is on.

Which run, and whether: `continueTarget(items)` in `core/runRows.ts`, a pure read of the thread.
Nothing when the last run finished, or when a newer message of the owner stands under it (that
message is what comes next). A command output or a notice after the run does not hide it.

## A message stopped at once

A run that wrote nothing -- the owner sends and stops before anything comes back -- had no item to
carry its signature, so there was nothing to hang Continue on. The run now signs the message that
triggered it, on both paths:

- live, `chatStore.endRun` -> `signTrigger`: when nothing the run carries draws anything (the
  bubble its wait opened may end after the run does), the owner's newest message takes the run,
  unless a run already claims it or it is still waiting for its turn;
- on a page, the server's `runFold` does the same.

So the message reads `run · 0.4 s · Stopped`, and the button appears under it.

## Tests

`src/app/__tests__/continueButton.test.tsx`: the target, the live signing, the button on the real
screen (shown, one press, its size, not while a run goes, not after a finished run), and the undo
sheet's file count. 11 mutations killed.
