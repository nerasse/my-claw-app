# iOS companion

React Native 0.86.2 keeps the existing screens, stores, protocol and conversation
rules. The common FSD refactor is postponed. Swift services follow hexagonal boundaries:

| Layer | Location |
| --- | --- |
| Cases, ports, DTOs and origin rules | `ios/NativeCore/Sources/MyClawNativeCore` |
| Keychain, URLSession, sandbox, Apple audio/location/push | `MyClawNativeAdapters` sibling target |
| Assembly, lifecycle and RCTEventEmitter bridge | `ios/MyClawApp/Native` |
| Typed JS boundary | `src/core/nativeBridge.ts`; platform modules `.ios.ts` / `.ios.tsx` |

The thin Objective-C registration exports Swift `DeviceBridge` under the existing
module name. New-architecture RN interop is exercised by the actual simulator app.
Native event subscriptions use `NativeEventEmitter`. Android methods keep their
existing calls, including the two-argument credential adoption; iOS additionally
requires the explicit pairing origin. UnifiedPush is excluded from iOS autolinking
and runtime imports. No APK installation action is offered on iOS.

## Reproducible setup

See [dependency security maintenance](dependency-security.md) for the checked local
patches and [Android parity qualification](ios-android-parity.md) for actual evidence
and the remaining platform gaps. Do not run `npm ci` during a native build: Expo's
Swift package has generated artifacts under node_modules that installation replaces.

Minimum iOS is 16.4, including the Expo modules. Keep npm/Gem/CocoaPods lockfiles.
The verified environment is Node 22.23.1, npm 10.9.8, Ruby 4.0.6 / Bundler 4.0.16,
CocoaPods 1.17.0 and Xcode 27 (27A266a). The Gemfile requires at least Ruby 3.1,
matching locked ActiveSupport, and permits other Ruby versions;
they are not all qualified by this change.

```sh
npm ci
bundle install
cd ios
bundle exec pod install
cd ..
npm run ios
```

Open `ios/MyClawApp.xcworkspace`, not just the `.xcodeproj`. The local Swift package
and the two test targets are already linked in the checked-in project/scheme.
`internal import Expo` matches generated Expo autolinking imports under Swift 6.4.
The Debug-only Info.plist preparation permits local HTTP fixtures; Release leaves
ATS enabled. Distributed connections require HTTPS/WSS with valid certificates.

## Window scene lifecycle

The app uses one `UIWindowScene`. `AppDelegate` prepares Expo/RN and the notification
delegate; `SceneDelegate` creates the window and starts React once the scene connects.
The locked Expo version still exposes app delegate subscribers, so scene callbacks
forward to those subscribers. Native suspension/resume observes the scene notifications.
This keeps WebSocket and audio lifecycle handling on the active window.
The scene connection's `notificationResponse` is forwarded to the native buffer before
React starts. Notification delegate completion handlers explicitly finish on MainActor:
the async Objective-C completion crashed UIKit restoration on a real iOS 27 device.

With Xcode 27/iOS 27 the old window bootstrap crashed before React loaded because UIKit
requires scene adoption. The launch failure and the subsequent successful pairing/resume
are recorded in the workspace simulator QA evidence. Keep the scene manifest and delegate
together; a successful build alone cannot detect this launch failure.
See [Apple's scene migration](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle).

## Connection, identity and suspension

A fresh installation has no server address and offers pairing when credentials for
the selected origin are absent. Manual and QR pairing reuse the shared protocol.
Credentials are non-synchronizable `WhenUnlockedThisDeviceOnly` Keychain records,
scoped by normalized server origin. Preferences contain no credentials.

The native WebSocket and URLSession transfers use `X-My-Claw-Device` and Bearer
authentication headers. Media views use the server's expiring `media.ticket`
read capability, never a device token in a URL. Swift accepts only a ticket received
for the current instance; changing or adopting its identity clears that ticket.
Transfers recheck the complete authorized request after asynchronous work, so
credentials replaced on the same origin cannot upload or populate the new cache.
Pairing URLs keep their existing one-time claim flow. Android/web keep the same
shared credential helpers and their upstream authentication contracts.

`ConnectionCoordinator` owns generation guards, heartbeat/timeouts and reconnection
delays 1/2/4/8/16/30 seconds. Its FIFO persists before accepting a send and includes
sent frames not yet acknowledged, up to 200. The runtime stores it in AES-GCM files
with an origin-bound Keychain key and authenticated origin; sending capabilities are
never written to plaintext queue JSON. Original message IDs survive restoration.
A pong watermark acknowledges transport receipt; chat message state still relies
on the existing server protocol. Flushed batches request acknowledgement immediately,
so repeated short foreground sessions do not fill the queue while waiting for the
next heartbeat. Queue acceptance and remote processing are distinct.

Background entry interrupts capture, pauses playback, persists state and closes the
socket. Foreground reconnects, then shared resume/session.sync reloads history,
streaming state and pending validations. There is no Android-style permanent
foreground service or background WebSocket promise. Instance changes reset shared
conversation/model/draft state and prevent old callbacks or identities crossing origins.

## Media and permissions

Documents are copied while their security-scoped access is active. Uploads and
downloads use URLSession files; the JavaScript heap does not hold file contents.
Media URLs must match the active identity origin. The sandbox store restricts access
after symlink resolution, keeps owned cache paths, and exports through Apple's UI.
Gallery export requests add-only access; Expo image/video/QR modules remain linked.
Metro's native `expo` entry resolves to `src/core/expoNative.ts`: the locked video
module requires Expo's renamed `requireNativeView` export. Aliasing directly to
`expo-modules-core` causes a real playback crash. Keep the shim's static exports and
verify both native platforms without adding Expo.fx's unlinked optional modules.
On iOS the filename/download/close bar stays outside AVKit's view so it cannot cover
the native playback controls; Android and web retain the overlay layout.

Voice capture writes AAC `.m4a` with MIME `audio/mp4`. An interruption/background
transition retains a usable take scoped to its original origin/conversation, informs
the shared UI and never uploads automatically. A draft is acknowledged only after
an explicitly chosen send enters the durable queue. AVPlayer supports pause, seek,
speed and replay; failure emits a sanitized diagnostic.
`AudioPlaybackService` retains the current resolved file so a remote note resumes
the same player position. Pause, stop, background entry and a newer play invalidate
an outstanding download before it can start playback. Cached playback rechecks the
current identity. The shared store waits for native startup before seeking and
ignores failures belonging to a superseded note.
Apple's microphone authorization callback can arrive on the TCC system queue.
Its Sendable completion resumes a continuation without inheriting MainActor;
the service resumes on its actor before accessing capture state. This fixes the
first-grant crash reproduced on TonyI and is covered by an off-main callback test.

Mic, camera, photo and location prompts occur at the action. The native bridge exposes
actual permission results and Settings navigation. Info.plist describes each usage;
there is no microphone/location background entitlement. Review denied/limited photo
access and audio interruptions on hardware before beta.

## APNs and App Attest

Build setting `MYCLAW_RELAY_URL` pins the team's HTTPS origin. The personal instance
must advertise the same origin with its APNs capability. Missing relay, unsupported
App Attest, refusal or relay failure has an explicit notification state and leaves
chat/media usable. Only the Notifications screen's action prompts for authorization;
an already granted permission enrolls automatically when prerequisites are ready.

Push enrollment and App Attest key IDs live in a separate Keychain service. A local
installation UUID prevents reuse of a vanished App Attest key after reinstall, even
when Keychain records survived uninstall. Old remote enrollment cannot be actively
revoked with a destroyed App Attest key; the new capability replaces it in the personal
instance, and invalid old APNs tokens are disabled when Apple rejects them.

Refresh serializes requests and validates the current enrollment, including an
unchanged token after foreground resume. A revoked enrollment is recreated. The
permission query has no APNs registration side effect. Explicit enable/configure
and foreground actions register with Apple; token callbacks refresh enrollment
only when the token changes. Repeated failures remain visible without a recursive
registration/refresh loop. The shared UI shows ready only after
`notifications.apns.result` confirms the matching
registration in the personal instance. Losing that instance's queue/connection is
reported separately from relay enrollment.

`UNUserNotificationCenterDelegate` is installed before React loads. Cold opens are
buffered until the instance has been announced to the UI and enrollment is selected.
`DeviceRuntime.connect` emits `claw:instance` before selection can emit `claw:push:open`;
an early drain returns nothing without consuming the pending destination. This avoids
the startup reset erasing the requested conversation and does not wait for a successful
network connection. Both paths use the common routing. Payload origin and registration ID must match the current device
association. Foreground banners for the visible conversation are suppressed. An old
instance/association cannot navigate the new one. Android/web notification behavior
is preserved by the platform modules.

See [server relay contract](../../my-claw/docs/apns-relay.md). Debug entitlements use
development; Release/TestFlight uses production. Real APNs and App Attest require a
registered Bundle ID, paid team profiles, mounted relay credentials and an HTTPS domain.
The app Bundle ID `com.kalira.myclaw` is registered for the selected Apple team;
registration alone does not qualify delivery or attestation. On 11 October 2026,
TonyI (iPhone 16 Pro, iOS 27) passed actual Apple attestation and assertion, verified
strictly by the server with legacy claims disabled, and the native sandbox relay
enrollment, receipt, token rotation and revocation probe described below. A subsequent
isolated HTTPS UI campaign proved shared registration/acknowledgement, visible-thread
suppression, actual preview and warm conversation routing. Its cold scenario still
failed after scene forwarding; the startup ordering defect was then reproduced and
corrected in real-runtime simulator XCTest. Cold APNs routing must be replayed on the
phone with that final fix. TestFlight production remains separate.
The separately approved development relay uses
`https://myclaw-apns-dev.kalira-ia.com` while the QA Mac runs its connector. Its
dedicated topic-specific sandbox key and tunnel token are retained in Bitwarden.
Public HTTPS/authentication/proxy checks pass. The native device probe observes the
actual received notification, including its preview and destination; an APNs-accepted
publish alone is insufficient evidence of delivery.

## Privacy

The manifest declares relay-retained device identifiers and other metadata (instance
origin/registration), linked for app functionality, without tracking. Existing required
API reasons cover app-owned UserDefaults and file access. Conversations, files, audio,
optional position and diagnostics travel to the user's configured personal instance;
the team relay forwards only a notification preview and never stores its content.
Before public beta, confirm the actual operator's data flows, retention/privacy policy
and App Store Connect answers; third-party SDK manifests remain their own responsibility.
Reference: [Apple privacy manifests](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests).

## Verification commands

```sh
npm run lint
npm run typecheck
npm run check:native
npm test -- --ci --maxWorkers=2
npm test -- --config jest.ios.config.js --ci --maxWorkers=2
bash scripts/build-web.sh
swift test --package-path ios/NativeCore
xcodebuild -workspace ios/MyClawApp.xcworkspace -scheme MyClawApp \
  -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' \
  -derivedDataPath /tmp/myclaw-ios-debug CODE_SIGNING_ALLOWED=YES \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM= \
  PROVISIONING_PROFILE_SPECIFIER= -parallel-testing-enabled NO -only-testing:MyClawAppTests test
xcodebuild -workspace ios/MyClawApp.xcworkspace -scheme MyClawApp \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/myclaw-ios-release CODE_SIGNING_ALLOWED=NO build
```

Choose an installed destination (`xcrun simctl list devices available`). Simulator
Keychain tests require ad hoc signing; unsigned test hosts fail with -34018.
`check:native` checks Android linking, not CocoaPods. SwiftPM on Mac skips the network
probes unless their URLs are supplied and does not run the iOS-only AVFoundation tests.
The shared scheme forwards `MYCLAW_IOS_WS_PROBE_URL`, `MYCLAW_IOS_MEDIA_PROBE_URL`,
`MYCLAW_IOS_UI_PROBE_URL` and `MYCLAW_IOS_UI_PROBE_CODE` as build settings to tests.
From the server repo, `MYCLAW_IOS_PROBES=1 bun tests-e2e/ios/native-probes.ts`
starts localhost-only WS/HTTP fixtures and prints the two probe URLs. Pass these
values as build settings to Xcode for the four real-network tests.
UI pairing requires a fresh app installation and a fresh ticket from an isolated server
with a seeded "Fixture conversation" and distinct echoed replies. The workspace's
local `.myclaw-ios/fixtures/ui-fixture.ts` supplies that scenario.
Never uninstall a user's unrelated app to run tests.

Do not edit Swift files or start concurrent Xcode builds while a build is running.
The gated native network tests exercise real local URLSession transports, not Apple
services. The six XCUITests cover manual pairing, a partial streaming response,
suspension, typing and sending while disconnected, cold launch, approval after resume, AAC playback/pause/speed,
document preview, microphone denial, PHPicker upload, document export/import/upload,
and the explicit iOS notification state without a relay. The video path exercises
AVKit playback/pause/seek, Files export/import and native upload, comparing the
received SHA-256 with the original clip and checking the header does not cover AVKit.
The expanded local fixture provides `/facts`, `/pause`, `/media` and `/video` on
localhost:39081, plus synthetic AAC, text and H.264/AAC files. It registers the
active-run provider, stable streamed/history IDs and incremental
sync; leaving active-run state out falsely closes a stream during session-list replay.
Each complete campaign starts with a fresh fixture and pairing ticket. Seed Photos with the test icon using `simctl addmedia`. Install the ad hoc signed
app before setting microphone denial with
`simctl privacy <device> revoke microphone com.kalira.myclaw`; the denial scenario
requires the installed app's permission state, not only a reset before installation.
Only MyClaw's disposable test installation is reset. After a cold launch the app
deliberately opens Home; the tests select the restored conversation from there.
The earlier complete campaigns passed 42 native and six UI tests on each of iOS 26.5
and 27. The October 11 repeat after the notification startup fix passed 54 native
and eight UI cases on iOS 27, with no failures or skips; its two ordering regressions
were first observed failing and then passing. Local evidence:
`.myclaw-ios/evidence/simulator-followup-20261011T194338Z/report.md`.
The gated `MyClawHardware` scheme runs only the native host tests. With
`MYCLAW_PHYSICAL_QA=1`, `PhysicalQualificationTests` exercises real App Attest and a
three-second hardware microphone AAC take, decodes/replays it and deletes its scratch
directory. Both passed on TonyI with the dedicated Debug signature; CoreDevice's
subsequent container listing confirmed no physical-audio scratch files remained.
Use the approved ephemeral signing helper for device builds, not personal keychain
ACL changes. Hardware optical QR capture, photo permission variants, shared notification
cold routing and TestFlight remain separate from those native probes.
`testRealHTTPSRelayEnrollmentDeliveryRotationAndRevocation` additionally requires
`MYCLAW_RELAY_PROBE_URL=https://myclaw-apns-dev.kalira-ia.com`. It uses actual Apple
services and HTTPS, a distinct QA Keychain namespace and synthetic notification
content, verifies receipt/preview/destination, rotates the token away and back,
then revokes its registration. It temporarily prevents automatic screen locking and
restores delegates/settings. All three hardware probes passed on TonyI on 2026-10-11,
including actual APNs receipt and preview, rotation and revocation. The captured Apple
proof also passed the server's strict attestation/assertion verifier and rejection checks.
This probe does not qualify the shared UI's notification
suppression or cold/warm conversation routing.

The physical UI campaign also verified pairing/streaming, offline sending, cold history
recovery, approvals/questions after resume, sub-agent roster, document/video export and
upload, remote AAC pause/resume and a held download, microphone transfer and an interrupted
voice draft. Image preview, Files export/import/upload and Photos export are exercised
with an owned generated PNG. The image and video received by the server match the source
SHA-256. PHPicker cancellation and a completed gallery upload are tested using only
the generated gradient image. Identify Apple's confirmation button by its `Add`
accessibility identifier: its French label on TonyI is `OK`. Wait until the picker
closes before typing into the composer. Question tests correlate a unique request
with its server acknowledgement and verify that the pending state has cleared.
The hardware microphone-refusal test temporarily disables an initially granted
permission in Settings, checks the explicit error and a text-only server receipt,
then restores the original microphone authorization in teardown.

`IOSGallery` creates the Photos transaction block in a nonisolated factory. Photos runs
it on its own transaction queue; a block constructed in the MainActor-isolated `save`
method crashed on a real iPhone. The failing gallery-export scenario was replayed
successfully after the correction.

Physical UI fixtures require `MYCLAW_PHYSICAL_QA=1` and a private IPv4 fixture URL on
port 39080. `FixtureEndpoint` keeps control requests off production. iOS 27 denied LAN
access to the XCTest runner without a permission prompt or a Settings entry. The opt-in
`DebugFixtureProxy` binds only 127.0.0.1:39082 in the **Debug app**, forwards a bounded list
of fixture operations to port 39081, and keeps the QA app awake. It starts only when both
physical-QA and fixture launch variables are provided; it is excluded from Release.
The native-only `MyClawHardware` scheme remains separate. For UI tests, keep automatic
signing on the test runner and use `CODE_SIGN_IDENTITY=Apple Development`; globally
forcing the app's manual profile or certificate SHA prevents the UI runner from signing.
The workspace helper `.myclaw-ios/fixtures/physical-ui-signing.py` uses the approved
ephemeral keychain and explicit test selections.

The relay requires an HTTPS **instance origin**, even when the relay itself is HTTPS.
A LAN HTTP fixture therefore cannot qualify shared notification enrollment/routing.
The approved temporary HTTPS fixture routes were used for the October 11 UI campaign
and then removed; the original gateway was restored and the owned connector stopped.
Local evidence is in `.myclaw-ios/evidence/iphone-https-20261011T183855Z/report.md`.
`MyClawAppTests/DeviceRuntimeTests` requires an explicitly paired loopback UI fixture
and otherwise skips. It reproduces early consumption and event ordering using the
real assembled runtime. Pair the disposable simulator first, then run this selection
with `MYCLAW_IOS_UI_PROBE_URL=http://127.0.0.1:39080`. The unit target inherits the
application's CocoaPods search paths so it can import the Expo/RN host module.
`MYCLAW_QR_PHYSICAL_QA=1` additionally enables the optical QR test, which requires
aiming the real camera at the fixture's current QR. No simulated barcode is used.
See [beta release checklist](ios-beta.md) for the remaining signed-release steps.
