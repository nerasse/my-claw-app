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

Hermes ships bytecode: without the source map of that **exact** build, a release stack is
unreadable. It is emitted by `extraPackagerArgs` (`android/app/build.gradle`) and attached to the
release by `scripts/release.sh` — `android/app/build/` dies at the next clean.

```sh
npx react-native symbolicate crash.txt --sourcemap my-claw-app-<version>.bundle.map
```

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

## Known traps

- The foreground service notification carries **static** text: it reads "Agent connection active"
  even while the state is `disconnected`. Do not trust it, read `claw:ws:state`.
- The outbox (`ClawConnectionService`) is in memory: queued frames die with the process, after
  `send()` already returned `true`.
- Errors are swallowed in several places (`.catch(() => {})`). The global handler is a last
  resort, it does not catch those.
