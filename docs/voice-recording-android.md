# Android voice recording

## Architecture

Android recording has two deliberately separate owners:

- `VoiceAudio` still owns `MediaRecorder`, the `.m4a` file, level events and playback. This keeps
  the React Native bridge's existing upload contract unchanged.
- `VoiceRecordingService` is the lifetime shell. The bridge starts it while the app is visible and
  the `RECORD_AUDIO` runtime permission is already granted, waits for `startForeground()` to
  complete, then opens `MediaRecorder`. Its manifest type is `microphone`, not `dataSync`.

The service is `START_NOT_STICKY`. A process or service death therefore cannot silently start a
new microphone session without another user gesture. The service notification is ongoing and has a
**Stop and keep** action. That action finalizes the current take rather than cancelling it.

A bounded `PARTIAL_WAKE_LOCK` is acquired only after `MediaRecorder.start()` and is released on
normal stop, explicit cancel, recorder error, service teardown, and failed startup. The 35-minute
acquisition timeout is a second safety bound; the foreground service remains the primary protection
against the CPU sleeping while the screen is locked.

## Capture health and interruption policy

`getMaxAmplitude()` continues to drive the waveform, but a zero level is not treated as an error:
intentional silence is valid. The elapsed value is wall-clock recording duration, not evidence that
PCM samples exist.

On API 29 and newer, `MediaRecorder.registerAudioRecordingCallback` watches
`AudioRecordingConfiguration.isClientSilenced` for this recorder's own capture. The
`AudioManager` global callback is deliberately not used: it would report another app's silenced
capture as ours. A confirmed Android silencing produces a durable
warning in the recording row and in the foreground notification. `MediaRecorder.OnErrorListener`
handles recorder errors and stops the service without an automatic restart. The UI also receives a
status event for a service/notification stop or an interruption.

The file policy is intentionally asymmetric:

- slide-to-delete is explicit user cancellation and removes the local file;
- a normal stop, recorder error, service stop, bridge invalidation or notification stop retains a
  non-empty file and stages it when the UI is alive;
- an empty or unfinalizable file is not offered as an attachment, but is not deleted by the
  interruption finalization path;
- an unfinalized MP4 after a process crash is **not** promised to be recoverable. There is no
  auto-restart and no server/STT change in this fix.

Recordings are written under the app's private `filesDir/voice-recordings` rather than the cache so
that a finalized interruption survives normal process recreation. The existing native file upload
path reads the same `file://` URI. The system never reclaims `filesDir`, so each new take first
deletes the takes older than seven days: long enough to recover an interrupted one, while sent
notes do not pile up on the device forever.

Unmounting a `VoiceRecorder` no longer cancels an active take. This preserves the native session
through an ordinary navigation or JS tree replacement. The small UI does not attempt to attach a
take to a different conversation after the original composer has disappeared; use the notification
stop action while the original screen is unavailable, then reopen the relevant composer if needed.

## Verification

Static and TypeScript checks from the repository root:

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/jest/bin/jest.js --ci --maxWorkers=2
(cd android && ./gradlew :app:assembleDebug --no-daemon)
```

The Android build checks manifest merging, the microphone foreground-service type and the Kotlin
lifecycle code. No native test harness existed in this checkout, so the device protocol below is
required before shipping.

## Device protocol (Android API 29+; at least 25 minutes)

Use a physical device with microphone permission granted and notification permission granted where
available. Keep the device on a charger for the long run.

1. Start a voice note and speak for 30 seconds. Confirm the row shows a moving level and the
   notification says that recording continues while the screen is locked.
2. Lock the screen for at least 20 minutes. Speak in short phrases during minutes 5, 10, 15 and 20.
   Confirm the notification remains present and the timer/row do not stop. Do not use the waveform
   as a pass/fail signal during deliberate pauses.
3. Unlock, stop normally, confirm the note is staged and play it back. Decode the resulting local
   or uploaded `.m4a` and check that the spoken phrases are audible rather than only zero PCM.
4. Repeat for a 25-minute continuous session, stopping from the notification after the screen has
   been locked for at least 20 minutes. Confirm **Stop and keep** stages one playable take and does
   not start another recording.
5. Start another take, navigate away or replace the JS screen while it is active, then return or
   use the notification action. Confirm the microphone is released, the finalized take is retained,
   and no second recorder starts automatically.
6. Exercise an interruption where the platform reports silencing (for example, an audio policy or
   competing capture controlled by the test operator). Confirm the warning remains visible until
   stop and the take is kept if the container is non-empty. A deliberate quiet room is not this
   test and must not create a warning.
7. With no active take, swipe away the notification/service if the device allows it. Confirm the
   next recording still requires a fresh gesture and that no recording starts by itself.

Record the device model, Android API level, app version, start/stop times, whether the screen was
locked, and the result. Do not include credentials or personal audio in repository artifacts.
