# The web client

## Decision: same repository, not a new one

The web client is this app, rendered by react-native-web. It is not a second product and it does
not get its own repository.

- The UI is 21k lines of screens and 4.5k of components. A separate repo means rewriting them or
  extracting a shared package, then keeping two UIs in step with a wire protocol that changes
  every week.
- Platform resolution (`file.web.tsx` picked over `file.tsx`) only works when both files sit in
  the same tree. That mechanism is the entire porting strategy; splitting the repo throws it away.
- One tag builds both artifacts. The APK and the web bundle speak the same protocol version by
  construction, which matters because the protocol is versioned by nothing but the commit.

The server stays in `my-claw`. Only the pairing spec lives there (`docs/web-pairing.md`), because
the server is authoritative for it.

## Why it is cheap here

Three facts, all verifiable in the tree:

1. **Everything native goes through one file.** `src/core/nativeBridge.ts`, 237 lines, exposes
   `deviceBridge` plus `deviceEvents`. `connection.ts` (88 lines) is a thin wrapper on top. No
   screen, no component imports a native module directly.
2. **The RN surface is vanilla.** View, Text, Pressable, ScrollView, FlatList, TextInput,
   StyleSheet, Animated, Platform. react-native-web covers all of it.
3. **The protocol was designed for this.** `docs/my-claw-app-channel.md` in the server repo says a
   browser client is expected to speak it, and `owner` already makes a phone and a browser two
   windows on the same threads. `src/core/location.ts` even has a `Platform.OS === 'web'` branch.

So the port is: one bridge implementation, five shims, a build target, a deployment. Not a rewrite.

## `nativeBridge.web.ts`

Same interface, browser APIs. Metro resolves it for the web target with zero `Platform.OS` checks
added anywhere in the 28k lines above it.

| Native | Web |
| --- | --- |
| `connect` / `disconnect` / `sendMessage` | `WebSocket` plus an outbox, same `claw:ws:state` / `claw:ws:message` / `claw:ws:outbox` events |
| device id and token (Keystore) | nothing to store: the browser is authenticated by an `HttpOnly` cookie set at pairing, and the socket URL carries no credential |
| `pickFile` | hidden `<input type="file" multiple>` |
| voice recording plus levels | `MediaRecorder` and an `AnalyserNode`, RMS normalised to 0..1, pushed at the same ~16 Hz as the native recorder so the waveform animates identically |
| voice playback | `HTMLAudioElement`, same `claw:voice:playback` events |
| upload with progress | `XMLHttpRequest`: `fetch` has no upload progress event, and a composer that shows nothing while a 40 MB video crawls is what the native path exists to avoid |
| download, cache, save | `fetch` plus a `ReadableStream` reader for real progress, then an anchor click; there is no gallery in a browser, everything lands where downloads land. The download arrow goes straight to an anchor (`docs/downloads.md`) |
| location | already handled, `browserLocation()` |
| capabilities | `{ accessibility: false, notificationListener: false, wssConnection: true }` |
| notifications | Web Push, see below |

`deviceEvents` becomes a local `EventEmitter` shim with the `DeviceEventEmitter` shape. That is the
one piece the rest of the app is coupled to, and it is 30 lines.

**The outbox must be persistent on web.** On Android it lives in a foreground service; a closed
tab has no equivalent. Queue unsent frames in IndexedDB and drain on reconnect. This is the one
place the web ends up better than the app, whose in-memory outbox dies with the process (see
AGENTS.md, known traps).

Three rules it took a bug each to learn:

- **Read the stored queue once per page, not once per `connect()`.** `connect()` runs again on a
  server address change or a re-login, and restoring prepended the stored frames to a queue that
  already held them: one message sent once per reconnect the tab had made.
- **Cap it at 200, like `ClawConnectionService`,** and answer `false` past that. An unbounded
  queue in `localStorage` ends at the quota, where every write starts failing at once, and the
  composer needs to hear no rather than mark a bubble sent that nothing will carry.
- **Some frames go stale.** `chat.stop`, `approval.response`, `undo.choose`, `undo.cancel` all
  name a run or a sheet that was live when they were typed. Replayed on a reconnect an hour later
  they act on whatever holds that place now: a stop that kills an unrelated answer. Each frame is
  stamped when queued and the perishable ones are dropped past a minute. A queue written before
  the stamps reads as undated, which is treated as old -- the right call, since the message is
  still worth sending and the stop beside it is not.

And one the outbox cannot cover: **a socket that is `OPEN` and dead.** A NAT timeout or a VPN
switch leaves the browser's socket open for minutes; `send` succeeds, the frame is gone, and the
outbox never saw it because the socket said yes. The heartbeat (`ping` answered by the server's
`pong`, two misses and the socket is closed) brings the link back, but the message sent in between
is lost without a word. So every `chat.send` waits for the server's `chat.send.received`
(`hello.receipts` announces it): the bubble reads "sending…" until then, and 15 s without a receipt
on a link that called itself open, the send is marked `undelivered` and the app retries it itself,
under the same id -- the server takes a repeated id once, so a receipt that was merely late costs
nothing, and a first try that did arrive is not answered twice. Armed only on an open link, never
on a queued send, whose receipt comes with the reconnect. Store side in `chatStore.expectReceipt` /
`markDelivered` / `markUndelivered`.

**A send that never got out is not a verdict the owner has to clear.** It reads "not sent, trying
again", with the time it has been waiting, and it is drawn at the bottom of the thread under
everything the run wrote after it: it waits for a connection, not for a turn, and a bubble left in
its reading order scrolls away from the only place the owner looks (`pinnedSends`, in
`core/runRows.ts`). The retry is the send path itself, so the press on the label is a way to go now
rather than the only way out: `core/sendRetry.ts` holds the delay, which opens up with the wait
(5 s, then 15 s, then 30 s) and never stops. Only the receipt ends it, or an ack for the id if the
run drained the message. The two waits the server owns keep their place instead -- behind a
compaction, or in the run's mailbox for the next turn boundary -- because those have a turn coming,
which is a fact about the thread.

## Package shims

Same `.web.tsx` mechanism, wrapped in `src/compat/`:

| Package | Web replacement |
| --- | --- |
| `@react-native-clipboard/clipboard` | `navigator.clipboard` |
| `react-native-haptic-feedback` | `navigator.vibrate`, no-op on desktop |
| `react-native-image-picker` | file input, same result shape |
| `@react-native-community/datetimepicker` | `<input type="datetime-local">` |
| `@likashefqet/react-native-image-zoom` | CSS transform on a wheel and pinch handler |
| `expo-unified-push` | Web Push subscription, see below |

Supported as-is, to be verified on the spike: `react-native-svg`, `react-native-safe-area-context`,
`expo-video`, `react-native-gesture-handler`, `react-native-reanimated` v4 with
`react-native-worklets`. `react-native-marked` renders RN primitives, so it should pass through
RNW untouched, and it is the visual core: test it in the first hour.

## Build

The CI `web` job runs the same Metro with the web config on every push, so a resolution that
breaks the browser target fails there rather than at `myclaw web install`. It also asserts the two
bundles stay apart: `react-native-web` must be in the web bundle and nowhere near the Android one.

Metro, not Vite. The Babel preset already handles the Flow syntax shipped by RN packages, and Vite
plugins for react-native-web trip on exactly that.

```
index.web.js               registers the root component
metro.config.js            web extensions, alias react-native -> react-native-web
web/index.html             shell, theme colour, viewport
web/sw.js                  offline shell + push, registered from index.web.js
web/manifest.webmanifest   PWA identity, linked with crossorigin="use-credentials"
web/icons/                 192 and 512, referenced by the manifest and the shell
npm run build:web          scripts/build-web.sh -> dist-web/
```

`scripts/build-web.sh` is the only recipe, used by CI and by the release box alike. It had been
duplicated in the CI job, the two copies drifted, and the shipped tarball carried `index.html` and
`index.js` only: `/sw.js` fell through to the HTML shell, the browser refused it for its MIME type
and the PWA, the offline shell and web push were all silently absent. The script fails when a file
the shell references is missing from the output.

`app.json` needs the autolinking exclusions revisited: several `expo-*` packages are excluded
today because the app is bare, and the web export path needs some of them back.

CI (`.forgejo/workflows/ci.yml`) has a `web` job: typecheck against the web target, `npm run
build:web`, then `scripts/release.sh` attaches `dist-web.tar.gz` to the release, next to the APK
and under the same tag.

## Who serves it

**my-claw serves the bundle itself**, from the `Bun.serve` that already answers `/media`,
`/skills`, `/health` and `/my-claw-app`. Same port, same origin. Not nginx, not a new service.
Full route table, cache and security headers in `docs/my-claw-app-channel.md` of the server repo.

Why it lands there and not in nginx:

- The server already is an HTTP server for this channel. A static bundle is one route, not an
  architecture.
- Same origin without touching a proxy: no CORS, no host to configure in the client, relative
  media URLs, and the whole thing reachable over the VPN with no reverse proxy at all.
- my-claw ships as a tarball with an `install.sh` and does not require nginx today. Putting the UI
  in nginx makes the web client a property of one deployment instead of a feature of the product.

The two repos still release independently, so the server pulls the artifact:

```
myclaw web install [--version vX.Y.Z]   # downloads dist-web.tar.gz from the my-claw-app release
myclaw web ls
myclaw web use vX.Y.Z                   # symlink flip, instant rollback
```

Extraction goes to `$MY_CLAW_DIR/web/<version>/`, `current` is an atomically renamed symlink,
files are read per request. New version live without a restart.

No public hostname and no SSO: the instance is reached over the tailnet and the LAN. TLS is
terminated by an external nginx on another VM (see the server doc), my-claw stays plain HTTP on
`:8080`, and the Android app keeps talking to that port directly.

One consequence for this codebase: the client derives its scheme from the page, never from a
constant. `location.protocol === 'https:' ? 'wss:' : 'ws:'`, and media URLs stay relative. A page
served over HTTPS that opens a `ws://` socket is blocked as mixed content, with an error that
names the wrong culprit.

The accepted trade: during a my-claw restart, a cold page load fails. A warm one does not, the
service worker serves the shell and the UI shows its reconnecting state. Duplicating the bundle
into nginx to cover the cold case would buy a few seconds of an auto-update in exchange for a
second source of truth.

## Pairing, and why it is not in this bundle

The bundle is **private**: my-claw serves it only to a paired client. So the pairing screen cannot
live in it, and it does not. `/pair` is a self-contained page shipped with the server
(`pair-page.ts`, inline HTML and vanilla JS, a few KB), the only public surface of the port. It
sets the cookie and redirects to `/`. Protocol and security model: `docs/web-pairing.md`, serving
and cookie rules: `docs/my-claw-app-channel.md`, both in the server repo.

What that means for this codebase:

- No pairing screen, no credential storage, no `#pair=` handling. The app boots already
  authenticated or it never boots at all.
- The bridge builds `/my-claw-app`, `/media/...` and `/skills` **without** `device` and `token`
  query parameters on web. The cookie travels on its own, including on the WebSocket handshake
  and on every `<img src>`.
- A 401 on any request means the session died (revoked, expired). The web bridge reacts by
  redirecting to `/pair`, which is the web equivalent of the app's unpaired state.
- The token never reaches the browser at all, so an XSS in this bundle cannot steal a credential.
  That is the reason the cookie is `HttpOnly` and the reason no third-party script is allowed in.

The Devices screen (list, last seen, revoke) does live here: `device.list` and `device.revoke` are
plain frames, one more file under `src/app/`, shared with Android. So does "Add a device": a browser
can invite a phone (`device.invite`, a QR and a code), and `/pair` takes an invitation code typed
into its field, so a relative is never sent to a shell to get in.

## Capabilities, not platform guesses

`src/core/platform.ts` (and its web twin) answers what this build can physically do: `micSupported`
is `navigator.mediaDevices?.getUserMedia` being a function, which is false on an insecure origin,
and `scannerSupported` is false on the web because a browser pairing a browser has both codes on
one screen. The composer hides the mic when it cannot record, and the Devices screen offers Scan
only where a camera exists. A button that fails at the moment it is pressed is worse than no
button.

## One native door, and the scar that proves it

Claim 1 above ("no screen, no component imports a native module directly") is the load-bearing one,
and it was false in exactly one file. `src/core/device.ts` read `NativeModules.DeviceBridge`
itself instead of going through `deviceBridge`. On the web that object does not exist:
`getDeviceInfo()` threw, the caller in `AppShell` swallowed it (`.catch(() => {})`), and the
identity stayed `null` forever.

Nothing announced it. What the browser showed was:

- every image and every video in a bubble rendered as its filename, because a null identity means
  the media URL is built as the empty string, and an attachment without a URL falls through to the
  name chip
- the same in the file explorer, and nothing opened when tapped
- "device not initialized" on any message carrying an attachment
- no skill document, no voice-note playback

The server was never involved: `/media` accepts the session cookie, and the client simply never
asked. Two rules come out of it:

1. A native module is read in `nativeBridge.ts` and nowhere else. That file has a web twin; a
   second door does not.
2. Empty credentials are a valid identity, not a missing one. `authQuery()` returns the empty
   string and `mediaUrl()` leaves the query off, because a browser proves who it is with an
   `HttpOnly` cookie it cannot read.

`src/core/mediaUrl.ts` is the single builder for those URLs, for the same reason: a caller that
appended `&thumb=1` by hand produced `/media/<id>&thumb=1` on the cookie path, where there was no
query to extend, so video thumbnails 404'd on the web while working on the phone.

## Secure context, the hard prerequisite

The deployment is private (tailnet and LAN, no public record, no SSO) but it still needs HTTPS,
because a browser gates half of what this app does behind a *secure context*, and
`http://<host>:8080` is not one. Only `localhost` is exempt.

| API | Feature | Plain HTTP |
| --- | --- | --- |
| `getUserMedia`, `MediaRecorder` | voice notes | dead, no fallback |
| Service Worker | PWA shell, install, push | dead |
| Push, Notifications | run-finished notifications | dead |
| Geolocation | location sharing | dead |
| `navigator.clipboard` | copy buttons | degraded, `execCommand` fallback |

So the shim layer is written with feature detection at its root: `isSecureContext` false means the
voice button, the location button and the notification toggle are **hidden**, not broken. A mic
icon that silently does nothing is worse than no mic icon.

Getting the certificate is a server-side question, three options ranked in
`docs/my-claw-app-channel.md`. Nothing in this repo depends on which one is picked.

## PWA and notifications

All of this assumes a secure context, see above.

- `web/manifest.webmanifest`, standalone display, maskable icon, theme colour from the palette.
- `web/sw.js` caches the shell and nothing else. A conversation is server state and a stale local
  copy is a bug factory; the shell is cached so restarting the agent does not turn a reload into a
  dead page. A 401 is never cached, or a dead session would lock the client out until the cache is
  cleared by hand.
- Push needed no server change at all. The server already encrypts every payload with Web Push
  and VAPID (RFC 8291), because the UnifiedPush connector on Android demands it, and a browser
  subscription has the same shape: endpoint, `p256dh`, `auth`. `notifications.register` carries
  it unchanged.
- `notificationIdFor` (FNV-1a) is implemented three times now: server, app, service worker. It is
  a wire contract, and a change in one without the others silently stops a second run from
  replacing the notification of the first.

## Layout

The app was written phone-first: one screen at a time, everything else behind a drawer. That
shape is right at 400pt and wrong at 1600, so every widening is decided in one place,
`src/core/layout.ts`, and keyed on the **window** rather than on the platform: a tablet in
landscape is a small desktop, and a browser dragged narrow is a phone.

| Width | What changes |
| --- | --- |
| < 720 | The layout the app was written for: slide-over drawer, bottom sheets, one screen. |
| >= 1080 | The conversation list is a pinned column, the hamburger disappears, menus become centred dialogs, hit targets shrink to mouse size (`pointer: fine` only). |
| >= 1440 | A page (settings, files, archives) and an attachment (a file, a picture, a film) open *beside* the conversation instead of over it. |
| any | The conversation is capped at 860pt and centred: past ~90 characters a line stops being readable, whatever the window does. |

An attachment beside the conversation reuses the page column exactly: same handle, same stored
width, same bounds -- and its bars carry one extra control that hands the viewer the whole window
and back (owner, 2026-10-15: it opens on the right, and still proposes full screen). Opening a
file while a page stands covers it; the page stays mounted, scroll and all, and closing the file
brings it back. Below 1440 the viewers are the full-screen layers they always were, and the
control is absent rather than inert.

`dense` is gated on `pointer: fine`, not on width: a touchscreen laptop keeps its tap targets.

### The page never scrolls

`html`, `body` and `#root` are `height: 100%; overflow: hidden`, and every pane from the shell
down carries `minHeight: 0` with `overflow: hidden` on the columns themselves (`web/index.html`,
`AppShell`, `DesktopColumns`, `ViewerChrome`). The app owns the viewport: a document, a table or
a listing that outgrows its box scrolls inside it. Left unclipped, a reader taller than the
window grew the *page*, and one wheel past the end of a file rolled the whole interface up --
conversation list and composer included (owner, 2026-10-28).

### Keyboard

| Key | Effect |
| --- | --- |
| `Enter` / `Shift+Enter` | Send / newline. react-native-web will not do this on its own: it only calls `onSubmitEditing` when the field is single-line or blurs on submit, and the composer is neither, so `editorKeys.web.ts` cancels the newline and raises the send. |
| `Tab` | Completes the highlighted slash command. |
| `ArrowUp` on an empty composer | Brings back the last message sent. |
| `Escape` | Closes the topmost layer: the same `handleBack` the Android back key calls. |
| `Ctrl/Cmd+K` | Focuses the conversation search. The list *is* the palette. |
| `Ctrl/Cmd+N` | New conversation. |
| `Ctrl/Cmd+,` | Settings. |
| `Ctrl/Cmd+/` | Command menu. |

Shortcuts are bound on `window` in the **capture** phase, and that is not a detail:
react-native-web's TextInput calls `stopPropagation()` on every key event, so a bubbling listener
never fires while the composer has focus, i.e. exactly when a shortcut is wanted.

### The address bar

`/t/<threadId>` is the only address with content; everything else is a layer over it, and layers
are not addressed, they are what Back closes first (`route.web.ts`).

- A reload lands on the conversation you were in, and a link to one can be sent to another window.
- Back closes the open layer and puts the entry back; with nothing left to close it walks the
  conversations visited, then leaves the page.
- The first sync after boot is a `replaceState`: restoring the last conversation must not leave a
  Back step whose only effect is to unload the app.
- Sub-agent threads are not addressed, for the same reason they are not stored as `lastThreadId`:
  a sub-agent is a view of its parent, so a reload lands on the parent.
- The server answers a deep link with `index.html` already, and sends an unpaired one to
  `/pair?next=<path>` so a link survives the pairing it triggers.

### What the document does that the tree cannot

`webTheme.web.ts` injects one stylesheet, rebuilt on every theme change:

- cursor and hover on `[role="button"]`, which is what Pressable renders;
- a `:focus-visible` ring in the accent colour, keyboard only;
- scrollbars in the palette, `::selection`, and the drop outline;
- `user-select: text` on marked regions. react-native-web ships `Text` with `user-select: none`,
  which on a desktop means a conversation cannot be copied at all.

Drag and drop and paste (`fileDrop.web.ts`) land in the same staging path as the file picker:
`pickFile()` already returns that shape, so a drop is the picker without the dialog.

`document.title` carries the conversation name and the unread count. Web Push needs a secure
context, so behind plain HTTP the tab strip is the only place a finished run can be announced.

`useKeyboard` is a no-op on web, `SafeAreaView` insets are zero, and `BackHandler` is replaced by
`hardwareBack.web.ts` (a no-op) plus `popstate`: registering the real one only prints
"BackHandler is not supported on web" into the console.

Crash reporting works on both now. `installDiagnostics` used to hook `ErrorUtils`, which React
Native installs in InitializeCore and react-native-web never runs: the hook found nothing and
returned, so a crash in the tab reached the devtools console and nobody else, while every Android
crash was shipped over the socket. `errorHooks.web.ts` listens to `error` and
`unhandledrejection` instead and feeds the same `diag.report` pipeline.

## Risks

| Risk | Mitigation |
| --- | --- |
| reanimated 4 misbehaves under RNW | measured under RNW: every gesture-driven surface still animates with a mouse |
| `react-native-marked` renders wrong | first hour of the spike, it is the visual core |
| Metro web export fights the bare-app autolinking exclusions | fix `app.json`, or vendor an `expo-*` shim; known to be fiddly |
| The debugging tooling in AGENTS.md is Hermes only | the web needs its own: source maps in the bundle, `diag.report` reused from the browser's global error handler |
| A tab closed mid-send loses frames | IndexedDB outbox, from day one |

## Phases

| Phase | Content | State |
| --- | --- | --- |
| 0. Spike | export web, minimal bridge, one thread, streaming visible | done, v0.3.0 |
| 1. Origin | scheme and credential derived from the page, no token in a URL | done |
| 2. Pairing | server-side shell and QR, Devices screen in the app, code approval | done |
| 3. Distribution | CI builds `dist-web.tar.gz`, `myclaw web install` puts it in place | done |
| 4. Bridge | voice, transfers with progress, downloads, playback | done |
| 5. PWA | manifest, service worker, Web Push against the existing VAPID keys | done, needs TLS to activate |
| 6. Desktop | breakpoint ladder, pinned list, side pane, shortcuts, routing | done |

`nativeBridge.web.ts` no longer rejects anything: every method of the native interface has a
browser implementation. Phase 5 ships but stays dormant until a certificate is in front, because
the service worker and the Push API only exist in a secure context.

The QR scanner is Android only, in `PairScanner.tsx` on `expo-camera`, with a `.web.tsx` twin that
keeps the camera out of the browser bundle entirely. It costs 8 MB of APK, which is the price of
not typing eight characters.

## Non-goals

- No offline mode. The conversation is server state.
- No iOS work. It becomes nearly free once RNW is in, but it is a different question.
- No second UI codebase, ever. If the desktop layout cannot be expressed in RN primitives, the
  answer is a responsive component in this tree, not a fork.
