# Pinned conversations

The pin and its order belong to the **server**, carried by `pinRank` on every session summary
(dense, from 0, absent when the conversation is not pinned). See
`my-claw/docs/my-claw-app-channel.md` for the wire side.

```
tap "Pin to top"  ──► session.pin { threadId, pinned }        ──┐
drop a dragged row ─► session.pin.order { threadIds }         ──┤
                                                                └─► session.list.result
                                                                    broadcast to every socket
                                                                    of the owner
```

The device stores nothing. `src/core/pinned.ts` derives the pinned block from the listing
(`pinnedOf`, `isPinned`) and sends the two frames; the drawer and home screen draw what came back.
The desktop drawer is 288pt wide, so pinned titles and their action buttons have room without
changing the sortable contract.

## Why it moved off the device

It was a per-device preference, in the same bag as the theme (`prefs.pinnedSessions`). The owner
reaches the same conversations from the phone and from the browser, so each client had its own
private idea of what was pinned and in what order: pins made on the phone did not exist in the tab
at all. A pin is about finding a conversation again, which is a property of the conversation, not of
the screen showing it.

Two bugs died with the move:

- The drawer used to prune pins pointing at a thread absent from the listing. Archiving a pinned
  conversation therefore destroyed its pin, silently and for good. The rank now lives on the
  session: an archived thread keeps it and comes back where it was.
- Nothing reconciled two clients. Now a pin set anywhere reaches every open client on the next
  frame, because the refreshed listing is broadcast rather than answered to the asking device.

## Migration

`migrateLocalPins()` runs once at boot: it reads the old pref, sends one `session.pin` per id plus
the order, then clears the pref whatever the server makes of the ids. Without it every pin made
before this change would vanish on update, which reads as data loss even for a preference. The pref
is cleared unconditionally: it has had its one chance to be heard, and keeping it would replay a
stale order over a live one.

## Order after a drop

The sortable keeps the dropped order on screen while the frame travels, so the drag feels
immediate; the next `session.list.result` is authoritative. Offline, the frame sits in the outbox
and the visual order snaps back to the server's on the next listing.
