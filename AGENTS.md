# Debugging the app

## Crash reports (no adb needed)

Everything is captured on the device and shipped over the existing WS. `adb` is not reachable
from every network the phone lives on, and logcat is a ring buffer: the device is the only place
that can hold a trace until it has somewhere to send it.

```
crash ──► SharedPreferences (survives the process death that follows)
      ──► diag.report frame on the next connect
      ──► ~/.my-claw/logs/my-claw-app-<date>.log, level error
```

Read them, server side:
```sh
grep '"message":"device diagnostic"' ~/.my-claw/logs/my-claw-app-$(date +%F).log | jq .
```

A frame handler that throws is caught by `connection.guard` and reported as `js`, prefixed
`frame listener threw on <type>`. It used to escape into the native module callback and kill the
process: the app relaunched, reconnected, was handed the same frame and crashed again, a boot loop
no reinstall would fix. `parseServerFrame` validates `type` and nothing else, so a frame missing a
field its handler walks into is all it takes.

A row that throws is caught by `RowBoundary` and reported as `render`, prefixed `row <id>`. The
screen-level `ErrorBoundary` is still there and is the wrong granularity on its own: one bubble
took the whole conversation down with it, and since the item lives in the store, reopening the
thread hit the same one again. Shapes are also normalised at the store door (`addToolCall`,
`startToolCall`) rather than defended against in every card.

Three `kind`s: `js` (global handler), `render` (ErrorBoundary), `exit` (Android's own post-mortem:
CRASH / CRASH_NATIVE / ANR / LOW_MEMORY / SIGNALED — the only way to tell a crash from a battery
kill). A report is dropped from the device only once acked (`diag.report.result`).

## Symbolicating a release stack

Hermes ships bytecode: without the source map of that **exact** build, a release stack is a list
of addresses. The map is not archived — the bundle is reproducible bit for bit, so it is
regenerated from the tag, and the APK proves the result is right.

```sh
git checkout v<version> && npm ci
cd android && ./gradlew :app:createBundleReleaseJsAndAssets

# The proof, and it is not optional: a map that does not match the shipped bundle yields
# plausible-looking line numbers pointing at the wrong code.
unzip -p my-claw-app-v<version>.apk assets/index.android.bundle | sha256sum
sha256sum app/build/generated/assets/react/release/index.android.bundle

# identical -> symbolicate; different -> the toolchain drifted, do not trust the map
npx react-native symbolicate crash.txt \
  --sourcemap android/app/build/generated/sourcemaps/react/release/index.android.bundle.map
```

The composed source map is emitted by the React Native plugin itself: `BundleHermesCTask` writes the
packager map into `intermediates/sourcemaps/react/release/`, hermes writes the compiler map beside
it, and `compose-source-maps.js` merges both into
`generated/sourcemaps/react/release/index.android.bundle.map`. Do **not** add an `extraPackagerArgs`
with a second `--sourcemap-output`: the CLI keeps the last one, so the packager map is never
rewritten, the merge reads whatever it finds there (a month old on this machine, which is how the
build kept passing), and a clean checkout cannot build a release at all.

## Server logs

```sh
tail -f ~/.my-claw/logs/my-claw-app-$(date +%F).log | jq -c '{t:.timestamp,m:.message,d:.data}'
ss -tnp state established '( sport = :8080 )'   # who is connected
```
Floor is `info`: set `logging.level` to `debug` in the config (hot-reloaded, no restart).

## When adb is reachable

```sh
adb logcat -b crash,main -v threadtime > /tmp/claw.log &   # -b crash, or the evidence is erased
adb logcat -s ClawConnection                                # socket lifecycle
adb shell dumpsys activity services com.myclawapp
adb shell am kill com.myclawapp                             # simulates a system kill (not force-stop)
```

## Release & quick checks

**Wait for explicit user approval before releasing.** Green CI is not a green light.

`android/app/build.gradle` (`versionCode` + `versionName`) is the source of truth, and `package.json` carries the same `version`. Only `versionName` is enforced (`release.sh` compares it to the tag), so `package.json` is bumped by hand in the same commit -- it silently drifted a whole version once because nothing checks it. `ci.yml` runs lint/types/tests only — it never builds the APK nor publishes. Release is local (mechanics in the `forgejo` skill):

```sh
node node_modules/typescript/bin/tsc --noEmit && npx eslint src --ext .ts,.tsx
node node_modules/jest/bin/jest.js --ci --maxWorkers=2   # 74 suites, same as ci.yml
git add <files> && git commit                    # never -A
# bump versionCode + versionName in android/app/build.gradle, and version in package.json
jq '.version="X.Y.Z"' package.json > /tmp/p && mv /tmp/p package.json
git add android/app/build.gradle package.json && git commit -m "chore: bump X.Y.Z"
git push origin main                             # BEFORE release.sh

export JAVA_HOME=~/.sdkman/candidates/java/current ANDROID_HOME=~/android-sdk
(cd android && ./gradlew assembleRelease --no-daemon)   # cold ~15 min, incremental ~25 s
bash scripts/build-web.sh && tar -czf dist-web.tar.gz -C dist-web .
bash scripts/release.sh v<v> android/app/build/outputs/apk/release/app-release-unsigned.apk dist-web.tar.gz
fj release view v<v>                             # APK + dist-web.tar.gz
```

Traps:
- **Push main before `release.sh`.** It has no tag step: `--create-tag` tags whatever the remote's main is. On unpushed work the tag points at the previous commit while the APK holds the new one — which breaks "Symbolicating a release stack" above, and only the sha256 check would catch it.
- `release.sh` refuses a version that disagrees with `versionName`. Nothing else enforces it: no CI job sees this release.
- `release.sh` renames the APK to `my-claw-app-v<v>.apk` and keeps the 5 most recent, and keeps the 5 most recent `dist-web.tar.gz` too (`scripts/cleanup-assets.sh`). Gradle emits `app-release-unsigned.apk` on purpose (the release build declares no `signingConfig`): signing lives in `release.sh` and nowhere else, so an APK that skips the script cannot be installed. Delete a wrongly-named or duplicate asset first via `fj release asset delete`.
- `fj release view v<v>` works here (release named after the tag). In the **server** repo it does not — the release is named `my-claw <version>`.
- Release assets answer HEAD (a fresh one can briefly 404 behind the proxy). The server's generic **package** registry does not: it answers 405, use `curl --range 0-0`.
- The server installs the web bundle itself (`~/.my-claw/web/current`). Never flip `current` or restart by hand.
- Red CI: job logs are reachable over the API. Recipe in the server repo's AGENTS.md, with `claw/my-claw-app` as the repo.
- Every app CI failure to date is `Exceeded timeout of 60000 ms`, never a real assertion. Cause: four heavy suites in parallel on a starved runner, ~132 s each instead of ~33 s. `ci.yml` caps `--maxWorkers=2`; run tests the same way locally or a red CI will look green on your box. Do not raise `testTimeout` again.

## Known traps

- `parseServerFrame` is a **whitelist**: a frame type it does not hold is answered `null` and never
  reaches the router. It is a silent drop, invisible to any test that hands `routeFrame` a typed
  object instead of a string, and it once threw away a frame the server was sending correctly.
  `FRAME_TYPES` is now typed `Record<ServerFrame['type'], true>`, so the compiler refuses the file
  until every member of the union is listed. Do not turn it back into a `Set<string>`.
- Nothing the server pushed while a socket was down is replayed. `core/resume.ts` is what a fresh
  connection asks for, and it includes the open conversation's history for that reason: a device that
  crashed or slept otherwise sits on its own stale copy until the owner switches threads.
- The foreground service notification carries **static** text: it reads "Agent connection active"
  even while the state is `disconnected`. Do not trust it, read `claw:ws:state`.
- The outbox (`ClawConnectionService`) is mirrored to SharedPreferences under `claw_connection`,
  and to `localStorage` on web, because the process death is exactly what it exists for. It is
  still capped at 200 frames: past that `send()` returns false and the bubble is marked failed.
- Errors are swallowed in several places (`.catch(() => {})`). The global handler is a last
  resort, it does not catch those.
- **Nothing may hide behind the keyboard, and Android will not rescue it.** `adjustResize` is inert
  (the app is edge to edge whatever `edgeToEdgeEnabled` says) and the thread is the only scroll area
  in a conversation: a scroller inside the inverted list loses every drag to it. So a row that holds
  a field reveals it itself, in two halves: a scroll to offset 0 at focus, then a lift measured with
  `measureInWindow` at `keyboardDidShow` (`src/core/revealField.ts`), because on Android the
  keyboard's geometry does not exist before that event. RN 0.86 scrolls a focused child into view on
  its own (`scrollsChildToFocus`, default true) with deltas computed in layout coordinates, which an
  inverted list mirrors, so the thread disables it rather than let two writers share one offset.
  Whatever sits outside the shell's `KeyboardAvoidingView` pads itself (`useSheetBottomInset`).
  `docs/keyboard-avoidance.md`
