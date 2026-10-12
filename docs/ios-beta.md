# TestFlight preparation and acceptance

The local port and relay are reviewable on `feat/MCL-1-ios-companion` in both repos.
Jira: [MCL-1](https://kalira-ai.atlassian.net/browse/MCL-1), connection MCL-2, media
MCL-3, notifications MCL-4. A compiled or unsigned archive is not a TestFlight beta.
No commit, push or upload was part of the completed local checks. Anthony subsequently
approved a temporary development relay on this Mac through Cloudflare, then explicitly
authorized the TestFlight upload documented below.

Current status, 12 October: build **1.0 (3)** is published internally and installed
on TonyI. Its strict production enrollment is recorded by the personal instance.
Apple accepted a real production notification while the app was terminated, but
the physical UI test did not find its preview and did not prove target opening.
Warm/cold routing, visible-thread suppression and the actual Get started 10/10
remain unqualified for this beta. The latest PR request is delivered as draft
review material; it does not waive these acceptance checks or authorize a merge.

## Internal TestFlight delivery — 12 October 2026

MyClaw **1.0 (1)** is available to Anthony's account in **MyClaw bêta interne**.
Apple app ID: `6821822573`; build ID: `9b24dacd-04fa-41b6-9533-9beba675d919`.
The upload and Apple validation succeeded; processing is `VALID` and
`internalBuildState` is `IN_BETA_TESTING`. One tester is invited. No external group,
public link or App Store review submission was created. Automatic distribution of
future builds is disabled. Device installation has not yet been verified.

[Open TestFlight](https://appstoreconnect.apple.com/teams/6b1d2811-a26e-44af-a89a-1566077bc88e/apps/6821822573/testflight/ios).
The parent workspace keeps the upload receipt, API confirmation, French test notes,
IPA and screenshot in `.myclaw-ios/evidence/testflight-20261012T054957Z/`.
The IPA SHA-256 is
`975bb12024a249b46abe85c7b39de0b1404ca9b993ff89e840970778c06f8a5c`;
its Hermes bundle matches the signed archive described below.

This first beta has an empty `MyClawRelayURL`: **APNs notifications are unavailable**.
French test notes explicitly describe this limitation and the remaining keyboard
shortcut/custom sound gaps. Production App Attest/APNs and physical cold routing
are still unqualified; configure an approved production relay and create a later
build before claiming notification acceptance.

The export questionnaire records `usesNonExemptEncryption=false`: native encryption
uses Apple's CryptoKit/Keychain and system TLS, rather than an additional encryption
implementation. Reassess that answer if those dependencies or usages change.
The existing `mac-anthony` publication key was reused through Bitwarden
**Kalira App Store Connect - mac-anthony**, with a private temporary key file removed
after each command. No Apple API key or broader permissions were created.
Git commits/pushes and production relay deployment were not part of this delivery.

## Notification beta — 12 October 2026

MyClaw **1.0 (2)** was signed, validated, uploaded and processed as `VALID`, then
added only to **MyClaw bêta interne** for Anthony (`IN_BETA_TESTING`). Build ID:
`de768aa6-3fe4-4fd6-bec7-6d6ec2a01e83`. CoreDevice confirmed build 2 installed on
TonyI through TestFlight. This beta pins `https://myclaw-apns.kalira-ia.com`;
its temporary relay uses a dedicated topic-specific Apple production key,
strict App Attest and a separate durable SQLite volume on the authorized Mac.

Real-device QA found `permission=allowed` but enrollment failed. The production
proxy saw no enrollment request. A reproduced native migration defect made the
new association depend on successfully retiring an obsolete enrollment; the
previous development relay is offline. The local fix attempts remote retirement
best effort, rejects the previous association immediately and keeps new enrollment
and explicit revocation strict. Remote retirement can remain incomplete while
that previous relay is unavailable. Production acceptance and Get started 10/10
remain pending the corrected candidate and physical replay.

The source snapshot, signatures, exact Hermes map, two matching native dSYMs,
Apple receipts and real-device results are in the parent workspace under
`.myclaw-ios/evidence/get-started-final-20261012/`. Build 3 is separate and explicitly authorized by Anthony. Its signed IPA passed
Apple validation and upload (delivery `857132f3-75e7-4570-bd7e-bfc4006dc44f`);
Apple processed it as VALID/IN_BETA_TESTING in the same Anthony-only internal
group. CoreDevice confirms build 3 installed through TestFlight, with the four
existing conversations retained; services.get now includes the iPhone in pushDevices.
The update was automatic. The production provider accepted a real publication
after app termination. The subsequent Notification Center UI test could not find
the preview; device delivery and warm/cold opening remain unqualified.

## Initial local archive — 12 October 2026

The final source tree has a signed App Store archive, verified for team `9TU8PY7588`,
`com.kalira.myclaw`, iOS 16.4 and production APNs/App Attest entitlements. Its two
dSYMs match the native binary; its composed Hermes map matches all 231 bundled
first-party sources. The bytecode SHA-256 is
`f88c65456869936e442054b3acede133c6c00a4f027140dc248c636860502176`.
The temporary signing keychain was removed. Version 1.0/build 1 remain unchanged.

Archive: `.myclaw-ios/evidence/finalisation-20261012T030808Z/MyClawApp-final-signed.xcarchive`
in the parent workspace. Its `Artifacts/` directory contains the exact map and bundle
hash. The final report and `artifact-verification.json` live alongside the archive.

This archive was subsequently exported and uploaded in the delivery above.
`MyClawRelayURL` is empty because no
production relay has been selected or deployed; notification settings expose that
state. The notification-complete beta requires its approved production origin, a new
archive and App Store Connect processing. Final cold APNs routing must also be replayed
on the iPhone after the startup-order correction, then on the exact TestFlight build.
The eight simulator UI flows and 54 native tests retain their earlier scope; the final
verifier confirms that their relevant sources and bytecode have not changed.

## Signing and infrastructure prerequisites

- Anthony's paid Apple team, a registered Bundle ID and an App Store Connect app record.
- An authorized signing identity/profile with Push Notifications and App Attest.
- The team's APNs `.p8` key and key ID in Bitwarden, mounted only into the relay.
- Development and production HTTPS relay origins, independent durable SQLite volumes,
  and the privacy/support URLs and operator retention policy.
- Approved iOS marketing version and unique build number. The repository still has
  the original iOS template version/build; Android/package versions are unchanged.

Set `PRODUCT_BUNDLE_IDENTIFIER`, `DEVELOPMENT_TEAM`, `MYCLAW_RELAY_URL` and the approved
version/build on the app target or the explicit build invocation. `MyClawAppTests` and
`MyClawAppUITests` are local test targets; their template IDs are not app registrations.
Release has production APNs/App Attest entitlements, as required for TestFlight.
Do not switch to another local/free team to make a device build pass.

### Profile inspection before device QA or TestFlight

Use Python 3 and macOS `security` to inspect the selected Apple profile before
building. The check requires an exact Bundle ID/team, unexpired iOS profile,
matching APNs/App Attest environments, and the chosen iPhone in a development
profile. Production requires an App Store profile without development debugging,
ad hoc devices or enterprise distribution. It does not register an identifier,
create a profile, prove that its signing private key is installed, or upload a build.

Set the following inputs to the selected profile and registered identifiers:

```sh
python3 scripts/check-ios-signing.py "$MYCLAW_PROFILE_PATH" \
  --bundle-id "$MYCLAW_BUNDLE_ID" --team-id "$MYCLAW_TEAM_ID" \
  --environment development --device-id "$MYCLAW_DEVICE_ID"
python3 scripts/check-ios-signing.py "$MYCLAW_STORE_PROFILE_PATH" \
  --bundle-id "$MYCLAW_BUNDLE_ID" --team-id "$MYCLAW_TEAM_ID" \
  --environment production
python3 -m unittest discover -s scripts/tests -p 'test_ios_signing.py' -v
```

On 10 October 2026, `com.kalira.myclaw` was registered for Anthony's paid team
`9TU8PY7588` with Push Notifications and App Attest. The app target uses manual
signing with `MyClaw Development` (selected iPhone only) for Debug and
`MyClaw App Store` for Release. Both profiles were downloaded, installed and
passed the profile inspection. Apple may grant the App Attest profile entitlement
as a list of permitted environments; the signed binary must still select the
configuration's actual environment.

The initial signed attempt failed while codesign requested access to the personal
keychain (`errSecInternalComponent`). Anthony approved dedicated automation identities
stored in Bitwarden as **Kalira Codex Development** and **Kalira Codex Distribution**.
Both certificates expire on 10 October 2027. Existing certificates were preserved;
only the MyClaw profiles were regenerated for the new identities.

`~/.agents/bin/apple-signing` now builds through a temporary keychain restricted
to codesign, checks the archive and removes its keychain. The Release archive
`MyClawApp-codex-signed.xcarchive` passed strict signature verification, the exact
profile/team/Bundle ID, production APNs/App Attest and `get-task-allow=false`.
Its 2 native dSYMs and exact Hermes map (1465 sources) are preserved with it.
This historical archive predates the simulator QA scene-lifecycle correction.
`MyClawApp-scenes-signed.xcarchive` was subsequently generated from the corrected
source and passed the same verification. Its scene manifest resolves
`MyClawApp.SceneDelegate`, and its two dSYMs and exact Hermes map are preserved.
Those historical archives also predate the subsequent Expo-video and microphone
callback corrections. The expanded complete simulator campaigns pass 42 native
tests and six UI tests on each of iOS 26.5 and iOS 27; optical/hardware and beta
acceptance remain separate.
The utility's 16 tests include real disposable signing, SIGTERM cleanup and
concurrent registration rejection. Instructions persist in Codex routing and
`~/.agents/knowledge/agents/apple-signing.md` for subsequent local sessions.

The earlier signed snapshot is `MyClawApp-qualified-signed.xcarchive`, created after
the video/export/upload and microphone corrections. Strict signature/profile checks
passed, with production APNs/App Attest and debugging disabled. Its exact Hermes map
contains 1466 sources and is preserved with two native dSYMs and the bytecode SHA-256.
The original iOS version 1.0/build 1 is retained; approval of beta version/build and
App Store Connect processing are still required. It has not been uploaded.

The dedicated paid-team Debug app was installed and launched on TonyI (iPhone 16 Pro,
iOS 27). Three hardware probes passed: AAC capture/decode/replay, Apple App Attest,
and real HTTPS relay enrollment/receipt/preview/rotation/revocation. The Apple proof
passed the strict server verifier, including replay and wrong
nonce/environment/app/version/body rejection, with legacy claims disabled.
The physical UI campaign also passed voice capture/upload, background draft recovery,
documents, images, video, chat and validations with the isolated real adapter.
Production relay infrastructure remains a prerequisite for notifications; the
App Store Connect record was subsequently created for the internal delivery above.
Cloudflare Kalira's `kalira-ia.com` zone is active on Free and its Zero Trust team on
Free. The approved `myclaw-development-qa` tunnel exposes only
`myclaw-apns-dev.kalira-ia.com`, backed temporarily by this Mac. The dedicated
topic-specific APNs sandbox key and tunnel token are verified in Bitwarden.
HTTPS/authentication/proxy checks pass. A separately authorized temporary HTTPS
fixture also proved shared enrollment/acknowledgement, visible-thread suppression,
received preview and warm routing. Cold routing still failed on the phone after
scene forwarding. Its additional Swift startup-order fix then passed two real-runtime
regressions and the 54-native/eight-UI simulator campaign; physical cold replay remains
required. The temporary routes were removed and the owned relay/connector stopped.
The 12 October signed archive above includes those final fixes, with its exact map
and two dSYMs retained. Local evidence:
`.myclaw-ios/evidence/simulator-followup-20261011T194338Z/report.md` and
`.myclaw-ios/evidence/iphone-https-20261011T183855Z/report.md`.
Those development runs predate the authorized temporary production endpoint and
dedicated production key described above. The permanent host remains open.

App Attest uses the production environment when distributed through TestFlight.
See [Apple's App Attest preparation](https://developer.apple.com/documentation/devicecheck/preparing-to-use-the-app-attest-service).

## Archive and symbols

On Anthony's initialized Mac, use the existing signing association and a new archive path:

```sh
~/.agents/bin/apple-signing doctor --project myclaw --configuration Release
~/.agents/bin/apple-signing archive --project myclaw --configuration Release \
  --archive-path /tmp/MyClawApp-signed.xcarchive \
  --derived-data-path /tmp/myclaw-ios-release
```

The utility checks the app target's manual profile instead of imposing one on Pods.
Its temporary keychain is visible to Xcode during the build; login/default keychain
and existing key ACLs are preserved. Secrets stay out of argv and build environment.
It does not export or upload to App Store Connect. The Debug identity/profile is
associated and compatible; paid-team physical Debug build/launch is now qualified.

After the values and signing profile are available, the checked workspace can archive:

```sh
xcodebuild -workspace ios/MyClawApp.xcworkspace -scheme MyClawApp \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/myclaw-ios-release \
  -archivePath /tmp/MyClawApp.xcarchive archive
```

The local compile qualification uses `CODE_SIGNING_ALLOWED=NO` and produces an
explicitly unsigned archive. It must never be uploaded. Before a signed archive,
inspect the actual expanded app build settings and profile, then inspect the resulting
entitlements with `codesign -d --entitlements :- <archive>/Products/Applications/MyClawApp.app`.
No automatic provisioning or App Store upload is configured by this change.

The RN Release phase sets `SOURCEMAP_FILE` in a `MyClawSymbols/` subdirectory of
the build's dSYM product directory. This keeps the composed map separate from
the intermediate packager map that RN deletes after composition.
RN composes Metro and Hermes maps for that exact bytecode build. Keep the map with the
archive's dSYMs and a SHA-256 of `main.jsbundle`; do not rebuild a different tree and
use its map to diagnose this beta. [package-ios-artifacts.sh](../scripts/package-ios-artifacts.sh)
copies the map and records that bundle hash after archiving.

```sh
bash scripts/package-ios-artifacts.sh /tmp/MyClawApp.xcarchive /tmp/myclaw-ios-release
```

The archive includes the selected 1024-pixel opaque icon, native permission strings,
privacy manifest and entitlements. The icon was prepared with the built-in imagegen
from `web/icons/icon-512.png`, preserving the orange claw on its light background;
saved in `ios/MyClawApp/Images.xcassets/AppIcon.appiconset/MyClaw-1024.png`. Prompt:
"Only upscale and sharpen the same mark; preserve silhouette, color, proportions,
position and margins; no text, redesign, transparency or rounded mask." Confirm it
with the owner when preparing the first public release.

## Future notification-complete beta information draft

The uploaded build uses the limited French notes preserved in the delivery evidence;
the following draft applies only after production notifications are configured.

Description: MyClaw connects your iPhone to your personal MyClaw instance. Continue
conversations, receive streamed answers, follow agents and respond to approvals.
Share files and voice notes and receive a preview when an answer needs your attention.

What to test: pairing by manual code and QR; send during intermittent connectivity;
return to history, streaming and pending validations after backgrounding; pick,
download and export files; record/replay voice; interrupt capture and recover its
draft; refuse permissions; receive a preview while terminated and open its target.

Reviewer setup: provide a dedicated test instance, pairing instructions and a short-lived
reviewer code through App Store Connect's review fields. Do not embed team, user or APNs
credentials in the binary, release notes, source maps or screenshots.

## Acceptance evidence

| Area | Local evidence | Required real-device/beta evidence |
| --- | --- | --- |
| Bootstrap / bridge | Debug simulator, real DeviceBridge/Swift interop, signed Keychain XCTest and paid-team signed launch on TonyI | Exact TestFlight install/launch |
| Pairing / chat | Manual pairing, partial streaming, resume, offline composer, cold launch, approval after resume and outbox drain in XCUITest; real Splash agent/tool/approval and durable restart in shared web client | Optical QR, Wi-Fi/cellular transitions and actual agent flow on the iPhone |
| FIFO / identity | Capacity, save/restore, stale callbacks, origin isolation and encrypted queue XCTest | Process termination and low-network send with the actual instance |
| Media / audio | Native file/HTTP, PHPicker, document export/import/upload, AVKit playback/seek and byte-verified transfer; TonyI capture/upload, interrupted draft, microphone refusal and remote playback | Photo limited/denied access, optical camera and live phone-call/audio-route interruptions |
| Notifications | Real parsers/security tests, strict Apple attestation, native HTTPS receipt/rotation/revoke; shared suppression/preview/warm routing; startup-order regressions pass on simulator | Cold APNs replay after the final fix, instance-change/re-pair tap isolation on hardware, then exact TestFlight production claims |
| Compatibility | Common and iOS Jest, types/lint, native-dependency check, web bundle/browser, Android Debug/Release and shared-source parity | Existing Android/web smoke on the team's actual environments |
| Release | Final signed archive, strict profile/signature verification, exact Hermes map/native symbols; 1.0 (1) uploaded, processed and available internally | Exact TestFlight install; notification-complete later build with approved production relay |

For notifications specifically: register without manual enrollment codes after granting
OS permission; show a useful state on attestation/relay failure; receive a title/preview
while terminated; suppress the currently visible conversation; rotate the token and
revoke the device; replay or expired challenges must fail; switch instance/re-pair and
prove an old tap cannot open the new instance's conversation. Repeat on the exact
TestFlight build with Apple production endpoints. Mocks and simulated notifications
do not satisfy these rows.

Anthony authorized the three internal builds described above and subsequently
requested the source PRs. Further TestFlight uploads, merges and deployments
require their corresponding explicit authorization. Keep the Jira tickets open
until their observable acceptance evidence exists.
