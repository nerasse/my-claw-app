# Several servers on one phone

A phone can use more than one my-claw: its owner's, a relative's, a test one. Each is a **server
profile**: a name, an address, the conversation it was on, and on the native side its own
credential and its own send queue. One profile is active at a time. Android only: a browser is on
the server that serves it, and the iPhone build keeps one server until its keychain holds a
credential per profile.

```
Settings > Servers
  this server    Home                         rename
  server         ws://10.0.0.5:8080/...  connected · my-claw 0.7.111   [Connect] [Disconnect]
                 [Join with an invitation]
  other servers  Papa   wss://papa.example.fr/...                       Switch
                 [Add a server]
Drawer footer (two servers or more):   SERVER  Home  ⇄
```

## A profile is a server, not an address

The same server reached on the LAN and over the VPN is one profile whose address the owner edits;
two servers are two profiles. Keying credentials by address would have logged the owner out of
his own server the day he switched from the LAN address to the Tailscale one.

## What a profile holds, and where

| what | where |
|---|---|
| list, names, addresses, last conversation, get-started steps skipped | prefs `servers` (JSON) and `activeServer` (`src/core/servers.ts`) |
| device id and token | `DeviceCredentials.kt`, keys `device_id@<id>` / `device_token@<id>`, Keystore-encrypted |
| unsent frames | `ClawConnectionService.kt`, prefs `claw_connection`, key `outbox@<id>` |
| push registration | UnifiedPush instance named after the profile |

The first profile is `default`, and `default` keeps the keys a single-server build wrote
(`device_id`, `device_token`, `outbox`, UnifiedPush instance `default`): a phone updated from it
keeps its pair, its queue and its notifications, and is asked nothing.

The skipped get-started steps are the profile's: a model skipped on the owner's server says nothing
about a relative's, which has none yet, and its get started must still open. prefs holds the
active profile's live copy (`setupSkipped`), as it does its address and conversation; a list
written by 0.6.151, which had no such field, takes what prefs held for its active profile.

## Switching

`serversStore.switchTo(id)` stores where the current server was, writes the target as active
(prefs, then `setActiveServer`, synchronous), asks the connection service to connect to its
address, and restarts the JS (`reloadApp`, the React host's own reload: `DevSettings.reload` is a
no-op in a release build). Every store of the shell holds the last server's conversations, so a
restart is cheaper and safer than unpicking them. The connection service lives on in the same
process: on the connect it puts the previous queue away under its profile, frames in flight
included (the old socket never proved it delivered them), and takes out the new one's. A message
typed for one server is never sent to another.

"Add a server" is a switch to a new, empty profile: the app comes back with no address, on the
Join screen, and the invitation it scans names the server. Forgetting a profile removes its
credential and its queue; the active one cannot be forgotten.

## Notifications

Each profile registers its own UnifiedPush instance, so a server the phone is not on still
notifies. `ClawPushRenderer` (declared to the module in the manifest) draws the module's payload
as before and adds `?server=<profile>` to the link. A tap on another server's notification stores
the link (`pendingLink`), switches, and the restarted app opens it once the profiles are read. The
notification id stays the server's, computed from the link without the parameter, which is how a
thread opened later still dismisses it.
