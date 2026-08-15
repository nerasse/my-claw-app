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
| voice recording plus levels | `MediaRecorder` and an `AnalyserNode`, RMS normalised to 0..1, same ~16 Hz `claw:voice:level` |
| voice playback | `HTMLAudioElement`, same `claw:voice:playback` events |
| transfers with progress | `fetch` plus a `ReadableStream` reader, same `claw:transfer:progress` payload |
| location | already handled, `browserLocation()` |
| capabilities | `{ accessibility: false, notificationListener: false, wssConnection: true }` |
| notifications | Web Push, see below |

`deviceEvents` becomes a local `EventEmitter` shim with the `DeviceEventEmitter` shape. That is the
one piece the rest of the app is coupled to, and it is 30 lines.

**The outbox must be persistent on web.** On Android it lives in a foreground service; a closed
tab has no equivalent. Queue unsent frames in IndexedDB and drain on reconnect. This is the one
place the web ends up better than the app, whose in-memory outbox dies with the process (see
AGENTS.md, known traps).

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
`react-native-sortables` is the least certain of the set. If it does not hold, the web falls back
to a non-draggable list, which degrades one screen and blocks nothing.

## Build

Metro, not Vite. The Babel preset already handles the Flow syntax shipped by RN packages, and Vite
plugins for react-native-web trip on exactly that.

```
index.web.js               registers the root component
metro.config.js            web extensions, alias react-native -> react-native-web
web/index.html             shell, theme colour, viewport
npx expo export --platform web --output-dir dist-web
```

`app.json` needs the autolinking exclusions revisited: several `expo-*` packages are excluded
today because the app is bare, and the web export path needs some of them back.

CI (`.forgejo/workflows/ci.yml`) gains a `web` job: typecheck against the web target, export,
then `scripts/release.sh` attaches `dist-web.tar.gz` and its checksum to the release, next to the
APK and under the same tag.

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
plain frames, one more file under `src/app/`, shared with Android.

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

- `manifest.json`, standalone display, maskable icon, theme colour from the active palette.
- A service worker for the shell and for push. No offline caching of conversations in v1: the
  session lives on the server, a stale local copy is a bug factory.
- Push: the server already generates a VAPID key pair (`~/.my-claw/push/vapid.json`) and already
  sends the public key in the `notifications.info` frame. Android goes through UnifiedPush, where
  the endpoint URL is the secret and no signing is needed. A browser subscription is real Web
  Push and requires VAPID signing, which the server can do today: `web-push` is already a
  dependency. So `notifications.register` gains an `endpoint` with `p256dh` and `auth` keys, and
  the sender picks signed or plain based on the subscription shape.
- `notificationIdFor` (FNV-1a) has to be reimplemented identically in the service worker, same as
  in `src/core/notifications.ts`, or a second run on a thread stacks a notification instead of
  replacing it.

## Layout

Phase 1 is a phone layout in a browser: a column capped at 720 px, centred, everything else
unchanged. It is honest, it ships, and it is already useful on a second screen.

Phase 2 is the actual reason to want a web client: permanent drawer, thread list and conversation
side by side, keyboard shortcuts, drag and drop onto the composer. That is UX work on top of a
working port, not part of it.

`useKeyboard` is a no-op on web, `SafeAreaView` insets are zero, and `BackHandler` needs
`popstate` so the browser's back button walks the layer stack.

## Risks

| Risk | Mitigation |
| --- | --- |
| reanimated 4 or sortables misbehave under RNW | validated on the spike, before anything else; fallback is a static list |
| `react-native-marked` renders wrong | first hour of the spike, it is the visual core |
| Metro web export fights the bare-app autolinking exclusions | fix `app.json`, or vendor an `expo-*` shim; known to be fiddly |
| The debugging tooling in AGENTS.md is Hermes only | the web needs its own: source maps in the bundle, `diag.report` reused from the browser's global error handler |
| A tab closed mid-send loses frames | IndexedDB outbox, from day one |

## Phases

| Phase | Content | Effort |
| --- | --- | --- |
| 0. Spike | export web, minimal bridge (connect, send, events), one thread, streaming visible | 0.5 d |
| 1. Bridge | files, images, voice, transfers, markdown, the five shims | 2 d |
| 2. Pairing | cookie handling in the bridge, 401 to `/pair`, Devices screen (the pairing shell itself is server-side) | 0.5 d |
| 3. Ship | CI job, `myclaw web install`, static serving in the adapter, nginx vhost, PWA manifest, service worker, Web Push | 2 d |
| 4. Desktop | two-pane layout, shortcuts, drag and drop | separate |

Phase 0 decides whether the whole approach holds. Nothing else starts before it is green.

## Non-goals

- No offline mode. The conversation is server state.
- No iOS work. It becomes nearly free once RNW is in, but it is a different question.
- No second UI codebase, ever. If the desktop layout cannot be expressed in RN primitives, the
  answer is a responsive component in this tree, not a fork.
