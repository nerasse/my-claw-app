#if os(iOS)
import Foundation
import XCTest
import AVFoundation
import CryptoKit
import MyClawNativeCore
import UIKit
@preconcurrency import UserNotifications
@testable import MyClawNativeAdapters

@MainActor final class IOSAudioPlaybackTests: XCTestCase {
  func testMicrophoneAuthorizationCanReplyFromTheSystemQueue() async {
    for allowed in [true, false] {
      let result = await IOSAudioRecorder.requestPermission { reply in
        DispatchQueue.global(qos: .userInitiated).async { reply(allowed) }
      }
      XCTAssertEqual(result, allowed)
    }
  }
  func testAnUnreadableAudioFileIsRejectedInsteadOfLeavingTheUIPlaying() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let uri = directory.appendingPathComponent("broken.m4a"); try Data("invalid audio".utf8).write(to: uri)
    let player = IOSAudioPlayback { _ in }
    XCTAssertThrowsError(try player.play(uri, rate: 1))
    player.stop()
  }
  func testARealAACFileCanFinishAndReplayAtAnotherSpeed() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: directory) }
    let uri = directory.appendingPathComponent("silence.m4a")
    let format = try XCTUnwrap(AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1))
    let buffer = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 11025)); buffer.frameLength = 11025
    memset(buffer.floatChannelData![0], 0, Int(buffer.frameLength) * MemoryLayout<Float>.size)
    do {
      let file = try AVAudioFile(forWriting: uri, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100,
        AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 96000])
      try file.write(from: buffer)
    }
    var finishes = 0
    let first = expectation(description: "first AAC playback finishes")
    let replay = expectation(description: "AAC replay finishes")
    let player = IOSAudioPlayback { progress in
      if !progress.playing && progress.durationMs > 0 && progress.positionMs >= progress.durationMs - 20 {
        finishes += 1
        if finishes == 1 { first.fulfill() } else if finishes == 2 { replay.fulfill() }
      }
    }
    defer { player.stop() }
    try player.play(uri, rate: 1)
    await fulfillment(of: [first], timeout: 5)
    try player.play(uri, rate: 1.5)
    await fulfillment(of: [replay], timeout: 5)
  }
}

#if !targetEnvironment(simulator)
@MainActor private final class PhysicalRelayDeliveryProbe: NSObject, UNUserNotificationCenterDelegate {
  let delivered: XCTestExpectation
  let expected: PushOpen
  private(set) var receipt: String?
  private var received = false
  init(delivered: XCTestExpectation, expected: PushOpen) { self.delivered = delivered; self.expected = expected }
  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
    willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
    let open = PushEnvelope.decode(notification.request.content.userInfo)
    await receive(open, kind: "foreground", title: notification.request.content.title, body: notification.request.content.body)
    return [.banner, .list]
  }
  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    await receive(PushEnvelope.decode(response.notification.request.content.userInfo), kind: "tap",
      title: response.notification.request.content.title, body: response.notification.request.content.body)
  }
  private func receive(_ open: PushOpen?, kind: String, title: String, body: String) {
    guard !received, open == expected else { return }
    XCTAssertEqual(title, "Qualification MyClaw")
    XCTAssertEqual(body, "Notification de test sur iPhone")
    receipt = kind
    received = true; delivered.fulfill()
  }
}

@MainActor final class PhysicalQualificationTests: XCTestCase {
  private var priorIdleTimer: Bool?
  override func setUpWithError() throws {
    try super.setUpWithError()
    try requirePhysicalQualification()
    priorIdleTimer = UIApplication.shared.isIdleTimerDisabled
    UIApplication.shared.isIdleTimerDisabled = true
  }
  override func tearDown() {
    if let priorIdleTimer { UIApplication.shared.isIdleTimerDisabled = priorIdleTimer }
    priorIdleTimer = nil
    super.tearDown()
  }
  private func requirePhysicalQualification() throws {
    guard ProcessInfo.processInfo.environment["MYCLAW_PHYSICAL_QA"] == "1" else {
      throw XCTSkip("Explicit physical qualification only")
    }
    XCTAssertEqual(Bundle.main.bundleIdentifier, "com.kalira.myclaw")
  }

  func testRealHTTPSRelayEnrollmentDeliveryRotationAndRevocation() async throws {
    try requirePhysicalQualification()
    guard ProcessInfo.processInfo.environment["MYCLAW_RELAY_PROBE_URL"] == "https://myclaw-apns-dev.kalira-ia.com" else {
      throw XCTSkip("Explicit development HTTPS relay qualification only")
    }
    let relayURL = try XCTUnwrap(URL(string: "https://myclaw-apns-dev.kalira-ia.com"))
    let priorIdleTimer = UIApplication.shared.isIdleTimerDisabled
    UIApplication.shared.isIdleTimerDisabled = true
    defer { UIApplication.shared.isIdleTimerDisabled = priorIdleTimer }
    let notifications = IOSNotifications.shared
    let tokenReady = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
      MainActor.assumeIsolated { IOSNotifications.shared.token != nil }
    }, object: nil)
    let permission = try await notifications.authorization(request: true)
    XCTAssertEqual(permission, .granted)
    guard permission == .granted else { return }
    notifications.registerDevice()
    await fulfillment(of: [tokenReady], timeout: 60)
    let token = try XCTUnwrap(notifications.token)
    let storage = PushSecureStorage(service: "com.kalira.myclaw.physical-relay-qa")
    try storage.prepareInstallation(UUID().uuidString)
    defer { try? storage.prepareInstallation(UUID().uuidString) }
    let relay = IOSPushRelay(storage: storage, attest: IOSAppAttest())
    let identity = DeviceIdentity(deviceId: "physical-relay-qa", token: "synthetic-device-identity", origin: "https://physical-qa.example")
    let enrollment = try await relay.register(relay: relayURL, identity: identity, token: token)
    var revoked = false
    do {
      XCTAssertEqual(enrollment.origin, identity.origin)
      XCTAssertEqual(enrollment.deviceId, identity.deviceId)
      try storage.save(enrollment)
      XCTAssertEqual(try storage.load()?.registrationId, enrollment.registrationId)
      try await relay.rotate(enrollment, token: String(repeating: "0", count: 64))
      try await relay.rotate(enrollment, token: token)
      let thread = "physical-qa-" + UUID().uuidString
      let expected = PushOpen(origin: identity.origin, registrationId: enrollment.registrationId, target: .thread(thread))
      let delivered = expectation(description: "A real Apple sandbox push arrives on this iPhone")
      let probe = PhysicalRelayDeliveryProbe(delivered: delivered, expected: expected)
      let center = UNUserNotificationCenter.current()
      let priorDelegate = center.delegate
      center.delegate = probe
      defer { withExtendedLifetime(probe) {}; center.delegate = priorDelegate }
      _ = try XCTUnwrap(UIApplication.shared.applicationState == .active ? true : nil,
        "Keep MyClaw in the foreground during actual APNs delivery qualification")
      XCTAssertTrue(center.delegate === probe)
      let config = URLSessionConfiguration.ephemeral; config.httpCookieStorage = nil; config.urlCache = nil
      let session = URLSession(configuration: config)
      defer { session.invalidateAndCancel() }
      var request = URLRequest(url: relayURL.appendingPathComponent("v1/registrations/" + enrollment.registrationId + "/publish"))
      request.httpMethod = "POST"; request.timeoutInterval = 20
      request.setValue("Bearer " + enrollment.secret, forHTTPHeaderField: "authorization")
      request.setValue("application/json", forHTTPHeaderField: "content-type")
      request.httpBody = try JSONSerialization.data(withJSONObject: ["title": "Qualification MyClaw",
        "body": "Notification de test sur iPhone", "ring": false, "target": ["kind": "thread", "threadId": thread]])
      let (_, response) = try await session.data(for: request)
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 202)
      await fulfillment(of: [delivered], timeout: 60)
      let facts: [String: Any] = ["permission": permission.rawValue, "receipt": probe.receipt ?? "absent",
        "providerAccepted": (response as? HTTPURLResponse)?.statusCode == 202,
        "delegatePreserved": center.delegate === probe, "appActiveAfterDelivery": UIApplication.shared.applicationState == .active]
      let proof = XCTAttachment(data: try JSONSerialization.data(withJSONObject: facts), uniformTypeIdentifier: "public.json")
      proof.name = "HTTPS relay and real APNs delivery facts"; proof.lifetime = .keepAlways; add(proof)
      try await relay.revoke(enrollment); revoked = true
      let (_, afterRevoke) = try await session.data(for: request)
      XCTAssertEqual((afterRevoke as? HTTPURLResponse)?.statusCode, 410)
      try storage.save(nil)
      XCTAssertNil(try storage.load())
    } catch {
      if !revoked { try? await relay.revoke(enrollment) }
      throw error
    }
  }

  func testRealAppleAttestationAndAssertion() async throws {
    try requirePhysicalQualification()
    let service = IOSAppAttest()
    XCTAssertTrue(service.supported)
    let nonce = Data((UUID().uuidString + UUID().uuidString).utf8)
    let hash = Data(SHA256.hash(data: nonce))
    let key = try await service.generateKey()
    let attestation = try await service.attest(key: key, hash: hash)
    let request = Data(("POST\n/physical-qa\n" + nonce.base64EncodedString()).utf8)
    let assertion = try await service.assertion(key: key, hash: Data(SHA256.hash(data: request)))
    XCTAssertGreaterThan(attestation.count, 1000)
    XCTAssertGreaterThan(assertion.count, 100)
    let proof: [String: String] = ["keyId": key, "nonce": nonce.base64EncodedString(),
      "attestation": attestation.base64EncodedString(), "assertion": assertion.base64EncodedString(),
      "request": request.base64EncodedString(), "bundleId": Bundle.main.bundleIdentifier!,
      "bundleVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""]
    let attachment = XCTAttachment(data: try JSONSerialization.data(withJSONObject: proof), uniformTypeIdentifier: "public.json")
    attachment.name = "Real Apple App Attest proof"; attachment.lifetime = .keepAlways; add(attachment)
  }

  func testPhysicalMicrophoneProducesPlayableAAC() async throws {
    try requirePhysicalQualification()
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("myclaw-physical-" + UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let captured = expectation(description: "hardware microphone reaches three seconds")
    var reached = false
    let recorder = IOSAudioRecorder(directory: directory, level: { _, milliseconds in
      if milliseconds >= 3000 && !reached { reached = true; captured.fulfill() }
    }, failed: { XCTFail("Hardware microphone capture failed") })
    let permission = await recorder.permission()
    XCTAssertEqual(permission, "granted")
    _ = try recorder.start()
    await fulfillment(of: [captured], timeout: 15)
    let take = try XCTUnwrap(recorder.stop())
    XCTAssertGreaterThanOrEqual(take.durationMs, 3000)
    XCTAssertGreaterThan(take.sizeBytes, 1000)
    let audio = try AVAudioFile(forReading: take.uri)
    XCTAssertGreaterThan(audio.length, 0)
    XCTAssertEqual(audio.fileFormat.settings[AVFormatIDKey] as? UInt32, kAudioFormatMPEG4AAC)
    let finished = expectation(description: "recorded hardware AAC plays to its end")
    let player = IOSAudioPlayback { progress in
      if !progress.playing && progress.durationMs > 0 && progress.positionMs >= progress.durationMs - 20 { finished.fulfill() }
    }
    defer { player.stop() }
    try player.play(take.uri, rate: 1)
    await fulfillment(of: [finished], timeout: 15)
  }
}
#endif
#endif
