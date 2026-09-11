# The outbox, and what proves a frame arrived

Everything the app sends goes through one native queue, because the socket is not always there: a
message typed in the metro, a reply tapped while the phone reconnects, a stop pressed as the link
drops. `ClawConnectionService` keeps it in memory and mirrors it to `SharedPreferences` under
`claw_connection`, on both the app and the web build, because the process death is exactly what the
queue exists for. It is capped at 200 frames; past that `send()` answers false and the sender has to
surface it.

## The hole

`WebSocket.send` answers whether the frame reached the **kernel**, not the peer. A socket that died
a moment earlier -- a network change, a NAT timeout, a peer that vanished without a FIN -- accepts
anything and delivers nothing, and `OkHttp` only notices on its own ping (20 s) at the frame layer.
For that window, every send reported success and was gone.

That is not theoretical on this install: the logs show the phone reconnecting every 10 to 40 minutes.
On 2026-09-11 the owner tapped Send on a question, the reply left on such a socket, and the server
never saw it. The card sat on "Sending…" for 62 minutes until a second attempt landed. Nothing in
the app said the first one had been lost, because nothing could tell.

## What proves it, without an ack frame

The server already answers an application `ping` with `pong` (the web client relies on the same
pair). TCP delivers one socket's data **in order**, so if a pong comes back, everything sent before
the ping it answers was received. That is the whole mechanism:

```
send(frame)  ──► ws.send answers yes ──► inFlight += (frame, now)
   …                                          │
ping         ──► pingSentAt = now             │  the socket dies here:
                                              │  inFlight is never settled
pong  ◄──────────  everything with             │
   sentAt <= pingSentAt is received ◄──────────┘
```

- a frame handed to the socket is **held in `inFlight`**, not dropped from the queue;
- the service sends its own `{"type":"ping"}` every 15 s while connected and records when;
- a `pong` settles every entry whose `sentAt` precedes that ping;
- a reconnect puts whatever is still unsettled **back at the head of the outbox**, in order, and
  drains it. One socket knows nothing of what the previous one was handed.

The ping is the service's own, not the JS's: the Android build has no application ping (only the
web transport does, in `nativeBridge.web.ts`), and OkHttp's frame-level pong never reaches the
listener that would need it.

## What it trades

A frame can now be sent **twice** -- once lost, once replayed -- where it used to be lost silently.
Every client frame that carries an id is idempotent server-side (`chat.send` is deduped by id, a
question reply on a closed ask is dropped, `undo.choose` on a spent prompt is refused), so the
duplicate is the cheaper failure. The alternative is what happened: a reply the owner believes he
sent and the server never heard of.

The count the UI shows (`pendingCount`) is the outbox **plus** the unsettled sends, so a frame in
flight is not hidden from the owner while it waits for its pong.

`schedulePing` is cancelled with the rest of the handler's callbacks on disconnect and on connect,
and re-armed at `onOpen`: it must not outlive the socket it is proving.
