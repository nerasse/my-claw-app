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

`extraPackagerArgs` in `android/app/build.gradle` is what emits the map at all; keep it. Strings,
not Files — a File breaks Gradle's configuration cache.

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

- Version lives only in `android/app/build.gradle` (`versionCode` + `versionName`). `package.json` stays `0.0.1`, never bump it.
- CI (`ci.yml`) only runs lint/types/tests + web bundle: it does **not** build the APK nor publish anything. The release is produced locally (mechanic in the `forgejo` skill):
  1. `export JAVA_HOME=~/.sdkman/candidates/java/current ANDROID_HOME=~/android-sdk`
  2. `cd android && ./gradlew assembleRelease --no-daemon` (cold ~15 min, incremental ~25 s)
  3. `bash scripts/build-web.sh && tar -czf dist-web.tar.gz -C dist-web .`
  4. `bash scripts/release.sh v<v> android/app/build/outputs/apk/release/app-release.apk dist-web.tar.gz`
- `release.sh` renames the APK to `my-claw-app-v<v>.apk` and keeps the 5 most recent. If a wrongly-named or duplicate asset is already attached, delete it first via `fj release asset delete`.
- Verify: `fj release view v<v>` shows the APK + `dist-web.tar.gz`; HEAD `releases/download/v<v>/dist-web.tar.gz` (a fresh asset can briefly 404 behind the proxy while HEAD returns 200).
- The server installs the bundle itself (`~/.my-claw/web/current`): the user runs the update. Never flip `current` or restart the service by hand.

Quick checks (no `npx` on this machine):
```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/jest/bin/jest.js --runInBand   # 74 suites / 632 tests
```

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
