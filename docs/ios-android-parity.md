# iOS / Android parity qualification

The October 11, 2026 campaign below qualified MCL-1 work against Android 0.6.143
and the local iOS 1.0/build 1. RN 0.86.2 and common TypeScript screens, stores and
protocol are preserved. This qualifies the companion scope with the limits below;
it does not assert every Android native integration exists on iOS.

October 12 follow-up: the branches incorporate the owner's Android/package
0.6.145 baseline; Android Debug/Release builds and the common Jest/web checks
pass. The authorized iOS **1.0 (3)** is installed through TestFlight. Production
App Attest enrollment and provider acceptance are observed, but actual production
notification preview/opening, foreground suppression and Get started 10/10 remain
unqualified. See [the current beta evidence](ios-beta.md).

| Capability | iOS evidence | Android evidence / difference |
| --- | --- | --- |
| Startup, pairing, identity | Fresh manual pairing, native XCTest and actual TonyI/iOS 27 pairing/streaming/resume | Pixel 6/API 34 startup, manual pairing, identity retained after cold relaunch |
| History, streaming, agents, validations | Shared suites; actual streamed fixture UI and approval after suspension | Same history, streamed reply, approval restored after background and accepted with Allow once |
| Offline sends/resume | Encrypted FIFO native tests and actual fixture socket interruption | Actual offline enqueue, reconnect and exactly one server receipt |
| Documents | Native Files picker and received bytes | Android picker; 53-byte document has identical SHA256 to iOS |
| Images/video | Actual TonyI PHPicker upload, Files and Photos export, native video playback/seek and byte-verified transfer | Existing natives/common tests; no fresh Android photo/video hardware campaign |
| Audio | TonyI capture/upload, interrupted background draft, remote pause/resume, delayed download and actual microphone refusal with text still usable | Existing natives/common tests; emulator audio disabled, no fresh microphone hardware proof |
| Keyboard/layout | Actual simulator composer, safe areas and resume | API 34 composer layout; resize no longer subtracts keyboard twice; edge-to-edge regression tests |
| Notifications | TonyI native App Attest/APNs, preview, rotation and revocation; HTTPS shared enrollment/ack, suppression and warm routing; cold startup ordering repaired in simulator XCTest, physical replay pending | UnifiedPush/ntfy remains linked; no fresh distributor delivery campaign |

The isolated fixture uses the real app adapter, pairing protocol and file endpoints,
with synthetic sessions and assistant responses. It proves UI/transport integration,
not fresh real-LLM or real-tool execution. Its synthetic device identity is fixed:
run Android/iOS UI campaigns sequentially to avoid replacing each other's socket.
Real pairing issues distinct device identities.

Actual Android runs found two defects missed by APK compilation: the Expo host
defaulted to `.expo/.virtual-metro-entry` although this repo starts the RN CLI at
`index`, and keyboard padding counted the IME twice when Android 14 resized the
window. Both are corrected. The shell measures the remaining overlap and still
re-asks native keyboard state on resume.

## Remaining differences and limits

- Android's foreground service versus iOS suspend/close/reconnect/sync is intentional.
- iOS uses APNs, Android UnifiedPush/ntfy, web Web Push. The iOS map contains no
  UnifiedPush source and iOS exposes no APK installation action.
- iOS `setHotkeys`, `focusIfKeyboard`, `restoreKeyboardFocus` remain native no-ops.
  Hardware shortcut parity is incomplete; software keyboard composition is qualified.
- Android channel/custom sound selection is not exposed on iOS, which currently
  uses the APNs default sound. These are not equivalent capabilities.
- iOS shares JS diagnostics but lacks Android ApplicationExitInfo. Network type
  returns `other`; its current consumer is Android APK update policy, gated off iOS.
- Native sandbox APNs receipt, preview, rotation and revocation passed on TonyI
  on October 11. The temporary HTTPS fixture also qualified shared enrollment,
  suppression and warm routing. Cold routing failed on the phone; its subsequent
  Swift startup ordering fix passed simulator runtime regressions but still needs
  physical replay. TestFlight delivery remains **unqualified**.
- The real camera refusal/recovery and scanner preview were exercised. Positive
  optical QR capture still requires aiming the phone at a fresh owned QR.
- Limited photos, phone-call/audio-route interruptions, minimum iOS 16.4, actual
  Android API 35/36 layout and a real Android device need additional runs. Arithmetic
  tests do not replace those hardware/OS checks.

The signed Release archive proves compilation/signature. The development-only
Cloudflare relay does not qualify TestFlight: permanent host, production endpoint/key
and distribution qualification remain open. No production instance, push, release,
version bump or TestFlight upload is included.

The physical campaign found a Photos transaction crash caused by an implicitly
MainActor-isolated changes block. Its nonisolated Swift fix passed image and video
exports on TonyI. The new fixture proxy is opt-in Debug only and absent from the
Release archive. No shared TypeScript or Android runtime changes were added by
this hardware campaign; Android checks above belong to the earlier parity run.
The HTTPS notification follow-up corrected Swift delegate completions, scene forwarding
and runtime event ordering; it added host XCTest/CocoaPods wiring. Common TypeScript,
Android natives and dependency versions were preserved in that follow-up.
