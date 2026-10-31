# Retry when the quota returns, in the app

The server side (what the wait is, when it is armed, what fires it) is `docs/quota-retry.md` in the
server repo. This is what the app draws, and the two traps that made the switch look broken for a
week.

## One row, two doors

`Retry when the quota returns` is a row of the conversation actions, and those actions are composed
once (`conversationActions` in `AppShell`) and opened from two places: a row of the drawer, and the
`⋮` of the chat header. The row shows the state as the server holds it:

- `off` -- nothing armed, and nothing will be;
- `on · waits for the provider reset` -- armed, waiting for a run to die on a spent quota;
- `waiting · retry at <time>` -- a wait is actually in flight; the thread draws the pill too.

A press sends `session.quotaRetry.set` with the opposite of what is shown, and the row follows the
server's answer, never a local guess: two devices, one truth.

## What broke, twice

**The subject.** The row read its state through `useQuotaRetry(threadMenu?.threadId)` -- the
drawer's own selection. From the header that selection is `null`, and the listing row's `quotaRetry`
flag it fell back on only exists for a conversation the drawer is showing. So the row drew `off`
whatever the server said, and each press sent `enabled: true` again: "quand je clique dessus, ça
reste sur off". The state is now an argument of `conversationActions`, passed by whoever opens the
menu -- `threadMenuQuotaRetry` from the drawer, `activeQuotaRetry` from the header.

**The frame.** `session.sync.result` is the other way to learn the state, for a window that opened
after the push. The server's store built `quotaRetry` on every page and the adapter dropped it when
it composed the frame, so the field was typed, documented, and never on the wire.

The lesson generalizes: a menu composed once for two doors takes its subject as an argument, and a
field is on the wire only if the frame says so -- `__tests__/QuotaRetrySwitch.test.tsx` covers the
first, the server's `tests/my-claw-app-adapter.test.ts` the second.
