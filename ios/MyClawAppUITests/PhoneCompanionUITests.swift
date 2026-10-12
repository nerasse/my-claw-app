import XCTest
import UIKit

/// Opt-in hardware scenarios. Only the authorized development fixture and this app's
/// notification are used; no personal document or gallery item is selected.
@MainActor final class PhoneCompanionUITests: XCTestCase {
  private let app = XCUIApplication()
  private var restoreMicrophone = false
  private struct Facts: Decodable { let received: [Message] }
  private struct Message: Decodable { let text: String; let files: [File] }
  private struct File: Decodable { let name: String?; let type: String; let size: Int?; let sha256: String? }

  override func setUpWithError() throws {
    try super.setUpWithError(); continueAfterFailure = false
    guard FixtureEndpoint.physical else { throw XCTSkip("Explicit real-iPhone qualification only") }
    _ = try FixtureEndpoint.controlURL("facts")
  }
  override func tearDown() {
    if restoreMicrophone {
      let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
      settings.activate()
      let microphone = settings.switches.matching(NSPredicate(format: "label IN %@", ["Micro", "Microphone"])).firstMatch
      XCTAssertTrue(microphone.waitForExistence(timeout: 10))
      if microphone.value as? String == "0" {
        microphone.coordinate(withNormalizedOffset: CGVector(dx: 0.88, dy: 0.5)).tap()
      }
      let allowed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "1"), object: microphone)
      XCTAssertEqual(XCTWaiter.wait(for: [allowed], timeout: 5), .completed, "Restore the microphone permission that this test temporarily disabled")
      restoreMicrophone = false
    }
    app.terminate(); super.tearDown()
  }

  private func control(_ path: String) async throws -> Data {
    let (data, response) = try await FixtureEndpoint.data(path)
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    return data
  }
  private func facts() async throws -> Facts { try JSONDecoder().decode(Facts.self, from: await control("facts")) }
  private func proof(_ name: String) {
    let image = XCTAttachment(screenshot: app.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image)
    let hierarchy = XCTAttachment(string: app.debugDescription); hierarchy.name = name + " hierarchy"; hierarchy.lifetime = .keepAlways; add(hierarchy)
  }
  private func openConversation() {
    FixtureEndpoint.launch(app)
    let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Conversation Fixture conversation")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 20), app.debugDescription); row.tap()
    XCTAssertFalse(app.buttons["Connection status: disconnected"].exists, app.debugDescription)
  }
  private func send(_ text: String) {
    let composer = app.textViews.matching(NSPredicate(format: "label BEGINSWITH %@", "Message to send")).firstMatch
    XCTAssertTrue(composer.waitForExistence(timeout: 10), app.debugDescription)
    composer.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap(); composer.typeText(text)
    XCTAssertEqual(composer.value as? String, text, app.debugDescription)
    let send = app.buttons["Send message"]
    let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: send)
    XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 15), .completed, app.debugDescription); send.tap()
  }
  private func reply(_ text: String) {
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch.waitForExistence(timeout: 20), app.debugDescription)
  }
  private func verifyAudio(_ text: String) async throws {
    let received = try await facts().received
    let message = try XCTUnwrap(received.last(where: { $0.text == text }))
    XCTAssertEqual(message.files.count, 1); XCTAssertEqual(message.files.first?.type, "audio")
    XCTAssertGreaterThan(message.files.first?.size ?? 0, 1000)
    XCTAssertTrue(message.files.first?.name?.hasSuffix(".m4a") == true)
  }

  private func openPairing() {
    openConversation(); app.buttons["Open conversations"].tap(); app.buttons["Open settings"].tap(); app.buttons["Open devices"].tap()
    let pair = app.buttons["Pair this device with a server-minted code"]
    for _ in 0..<4 { if pair.exists && pair.isHittable { break }; app.swipeUp() }
    XCTAssertTrue(pair.waitForExistence(timeout: 10), app.debugDescription); pair.tap()
    XCTAssertTrue(app.buttons["Scan a pairing code"].waitForExistence(timeout: 10), app.debugDescription)
  }

  func testPhysicalCameraRefusalAndQRCodePairing() async throws {
    guard ProcessInfo.processInfo.environment["MYCLAW_QR_PHYSICAL_QA"] == "1" else {
      throw XCTSkip("Requires Anthony to aim the real camera at the owned QR displayed on the Mac")
    }
    openPairing()
    let beforeData = try await control("frame-counts")
    let before = (try JSONSerialization.jsonObject(with: beforeData) as? [String: Int])?["pair.claim"] ?? 0
    app.buttons["Scan a pairing code"].tap()
    if app.buttons["Allow the camera"].waitForExistence(timeout: 3) {
      app.buttons["Allow the camera"].tap()
      let alert = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
      XCTAssertTrue(alert.waitForExistence(timeout: 5)); XCTAssertTrue(alert.label.contains("MyClaw"))
      alert.buttons.matching(NSPredicate(format: "label IN %@", ["Don't Allow", "Ne pas autoriser"])).firstMatch.tap()
      reply("Camera access is off for this app.")
      proof("Explicit real-camera refusal and manual-pairing fallback")
    }
    if app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Camera access is off for this app.")).firstMatch.exists {
      app.buttons["Close the scanner"].tap()
      XCTAssertTrue(app.textFields["XXXX-XXXX"].exists)
      for _ in 0..<3 {
        if app.buttons["Open notifications"].exists { break }
        app.buttons["Back to settings"].tap()
      }
      app.buttons["Open notifications"].tap(); app.buttons["Open iOS notification settings"].tap()
      let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
      XCTAssertTrue(settings.navigationBars["MyClawApp"].waitForExistence(timeout: 5))
      let camera = settings.switches.matching(NSPredicate(format: "label IN %@", ["Camera", "Appareil photo", "Caméra"])).firstMatch
      for _ in 0..<4 { if camera.exists && camera.isHittable { break }; settings.swipeUp() }
      XCTAssertTrue(camera.waitForExistence(timeout: 5))
      if camera.value as? String == "0" { camera.coordinate(withNormalizedOffset: CGVector(dx: 0.88, dy: 0.5)).tap() }
      let allowed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "1"), object: camera)
      XCTAssertEqual(XCTWaiter.wait(for: [allowed], timeout: 5), .completed)
      app.activate()
      // iOS can terminate the app when its camera permission changes.
      if app.buttons["Close settings"].waitForExistence(timeout: 2) { app.buttons["Close settings"].tap() }
      // Restore the conversation before opening the pairing screen again.
      let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Conversation Fixture conversation")).firstMatch
      if row.exists { row.tap() }
      XCTAssertTrue(app.staticTexts["Fixture conversation"].waitForExistence(timeout: 10), app.debugDescription)
      app.buttons["Open conversations"].tap(); app.buttons["Open settings"].tap(); app.buttons["Open devices"].tap()
      let pair = app.buttons["Pair this device with a server-minted code"]
      for _ in 0..<4 { if pair.exists && pair.isHittable { break }; app.swipeUp() }
      pair.tap(); app.buttons["Scan a pairing code"].tap()
    }
    reply("point the camera at the code on the browser")
    print("PHYSICAL_QR_CAMERA_READY")
    var scanned = false
    for _ in 0..<75 {
      let data = try await control("frame-counts")
      let claims = (try JSONSerialization.jsonObject(with: data) as? [String: Int])?["pair.claim"] ?? 0
      if claims > before { scanned = true; break }
      try await Task.sleep(for: .seconds(2))
    }
    XCTAssertTrue(scanned, "Aim TonyI at the owned QA QR displayed on this Mac")
    XCTAssertFalse(app.buttons["Close the scanner"].exists)
    proof("Pairing accepted after a scan through the actual iPhone camera")
    if app.buttons["Close settings"].exists { app.buttons["Close settings"].tap() }
    let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Conversation Fixture conversation")).firstMatch
    if row.exists { row.tap() }
    XCTAssertTrue(app.staticTexts["Fixture conversation"].waitForExistence(timeout: 10), app.debugDescription)
    send("physical QR pairing"); reply("Fixture reply to: physical QR pairing")
  }

  func testOwnRunnerLocalNetworkAuthorization() async throws {
    FixtureEndpoint.launch(app)
    _ = try await control("facts")
    proof("Real-device UI runner can reach the owned LAN fixture")
  }

  func testRecordedVoiceTransferAndInterruptedDraft() async throws {
    openConversation()
    let record = app.buttons["Record voice message"]
    XCTAssertTrue(record.waitForExistence(timeout: 10), app.debugDescription)
    record.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 3)
    proof("Real microphone recording kept in the composer")
    let first = "physical voice transfer " + UUID().uuidString.prefix(8)
    send(first); reply("Fixture reply to: " + first); try await verifyAudio(first)

    let before = try await facts().received.count
    let start = record.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    start.press(forDuration: 1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: -120)))
    XCTAssertTrue(app.buttons["Stop recording"].waitForExistence(timeout: 5), app.debugDescription)
    try await Task.sleep(for: .seconds(2))
    XCUIDevice.shared.press(.home); app.activate()
    reply("Recording interrupted. Voice note kept as a draft.")
    let after = try await facts().received.count
    XCTAssertEqual(after, before, "Suspension must retain the draft without sending it")
    proof("Interrupted microphone capture retained without automatic sending")
    let second = "interrupted voice draft " + UUID().uuidString.prefix(8)
    send(second); reply("Fixture reply to: " + second); try await verifyAudio(second)
  }

  func testPhysicalMicrophoneRefusalLeavesTextUsable() async throws {
    openConversation(); app.buttons["Open conversations"].tap(); app.buttons["Open settings"].tap(); app.buttons["Open notifications"].tap()
    app.buttons["Open iOS notification settings"].tap()
    let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
    XCTAssertTrue(settings.navigationBars["MyClawApp"].waitForExistence(timeout: 10))
    let microphone = settings.switches.matching(NSPredicate(format: "label IN %@", ["Micro", "Microphone"])).firstMatch
    XCTAssertTrue(microphone.waitForExistence(timeout: 5))
    guard microphone.value as? String == "1" else { throw XCTSkip("Only an initially granted microphone is temporarily disabled and restored") }
    restoreMicrophone = true
    microphone.coordinate(withNormalizedOffset: CGVector(dx: 0.88, dy: 0.5)).tap()
    let denied = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "0"), object: microphone)
    XCTAssertEqual(XCTWaiter.wait(for: [denied], timeout: 5), .completed)
    openConversation()
    app.buttons["Record voice message"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 1.2)
    reply("Microphone blocked. Enable it in system settings.")
    proof("Actual microphone refusal remains explicit and leaves text usable")
    let caption = "text with microphone denied " + UUID().uuidString.prefix(8)
    send(caption); reply("Fixture reply to: " + caption)
    let received = try await facts().received
    let message = try XCTUnwrap(received.last(where: { $0.text == caption }))
    XCTAssertTrue(message.files.isEmpty, "A denied microphone must not stage or send an audio file")
  }

  func testSubAgentRosterAndQuestionAfterResume() async throws {
    openConversation()
    let roster = app.buttons["1 sub-agent, 1 running"]
    XCTAssertTrue(roster.waitForExistence(timeout: 10), app.debugDescription); roster.tap()
    XCTAssertTrue(app.buttons["Open sub-agent qa-agent, running"].waitForExistence(timeout: 10), app.debugDescription)
    proof("Shared sub-agent roster on a real iPhone")
    app.buttons["Back to Fixture conversation"].tap()
    let question = "qa question " + UUID().uuidString.prefix(8)
    send(question)
    let option = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Réponse QA")).mostRecent
    XCTAssertTrue(option.waitForExistence(timeout: 10), app.debugDescription)
    XCUIDevice.shared.press(.home); app.activate()
    XCTAssertTrue(option.waitForExistence(timeout: 10), app.debugDescription)
    option.tap()
    if app.buttons["Review the answers"].exists { app.buttons["Review the answers"].tap() }
    proof("Pending question retained after suspension")
    app.buttons.matching(NSPredicate(format: "label == %@", "Send the answers")).mostRecent.tap()
    reply("Fixture question: answered for: " + question)
    let composer = app.textViews.matching(NSPredicate(format: "label BEGINSWITH %@", "Message to send")).firstMatch
    XCTAssertFalse(composer.label.contains("Answer the pending questions"), "The current question must be resolved, not an older request")
  }

  private func tapOwnPush() {
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    // Home-screen widgets can keep SpringBoard animating longer than a banner's
    // lifetime. The retained notification is still a real APNs opening action.
    let top = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.01))
    let bottom = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.8))
    top.press(forDuration: 0.05, thenDragTo: bottom)
    let notification = springboard.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Aperçu du message iPhone")).firstMatch
    XCTAssertTrue(notification.waitForExistence(timeout: 30), "The actual MyClaw QA notification must arrive in Notification Center")
    let image = XCTAttachment(screenshot: notification.screenshot()); image.name = "Actual MyClaw APNs notification"; image.lifetime = .keepAlways; add(image)
    let hierarchy = XCTAttachment(string: notification.debugDescription); hierarchy.name = "Owned MyClaw notification hierarchy"; hierarchy.lifetime = .keepAlways; add(hierarchy)
    notification.tap()
    // iOS can collapse several owned alerts into a notification group. Opening
    // the group is not navigation: only a tap that foregrounds the app counts.
    if app.state != .runningForeground {
      let alert = springboard.descendants(matching: .any).matching(NSPredicate(format: "identifier == %@ AND label CONTAINS %@", "NotificationShortLookView", "Aperçu du message iPhone")).firstMatch
      if alert.exists { alert.tap() } else { notification.tap() }
    }
  }

  func testRealPushSuppressionAndWarmAndColdConversationOpen() async throws {
    openConversation(); app.buttons["Open conversations"].tap(); app.buttons["Open settings"].tap(); app.buttons["Open notifications"].tap()
    if !app.staticTexts["ready"].waitForExistence(timeout: 15) {
      let enable = app.buttons["Allow notifications"]
      XCTAssertTrue(enable.waitForExistence(timeout: 10), app.debugDescription); enable.tap()
    }
    XCTAssertTrue(app.staticTexts["ready"].waitForExistence(timeout: 60), app.debugDescription)
    XCTAssertFalse(app.buttons["Install UnifiedPush"].exists); proof("APNs enrollment acknowledged by the personal-instance fixture")
    app.buttons["Close settings"].tap()
    let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Conversation Fixture conversation")).firstMatch
    if row.exists { row.tap() }
    XCTAssertTrue(app.staticTexts["Fixture conversation"].waitForExistence(timeout: 10), app.debugDescription)
    try await Task.sleep(for: .seconds(1))
    let suppressedData = try await control("push?thread=fixture")
    let suppressed = try XCTUnwrap(try JSONSerialization.jsonObject(with: suppressedData) as? [String: Any])
    XCTAssertEqual(suppressed["providerAccepted"] as? Int, 0, "A visible conversation must suppress its push")

    let warmData = try await control("push?thread=push-target&delay=2500")
    let warm = try XCTUnwrap(try JSONSerialization.jsonObject(with: warmData) as? [String: Any])
    XCTAssertEqual(warm["scheduled"] as? Bool, true)
    XCUIDevice.shared.press(.home); tapOwnPush()
    XCTAssertTrue(app.staticTexts["Notification destination"].waitForExistence(timeout: 20), app.debugDescription)
    proof("Real APNs warm open reaches the intended conversation")
    let coldData = try await control("push?thread=fixture&delay=2500")
    let cold = try XCTUnwrap(try JSONSerialization.jsonObject(with: coldData) as? [String: Any])
    XCTAssertEqual(cold["scheduled"] as? Bool, true)
    app.terminate(); XCUIDevice.shared.press(.home); tapOwnPush()
    XCTAssertTrue(app.staticTexts["Fixture conversation"].waitForExistence(timeout: 20), app.debugDescription)
    proof("Real APNs cold open reaches the intended conversation")
  }

  func testApprovedHTTPSFixturePairingAndChat() async throws {
    FixtureEndpoint.launch(app)
    let address = app.textFields["Server address"]
    if !address.waitForExistence(timeout: 3) {
      if app.buttons["Open conversations"].exists { app.buttons["Open conversations"].tap() }
      app.buttons["Open settings"].tap(); app.buttons["Open devices"].tap()
      let pair = app.buttons["Pair this device with a server-minted code"]
      for _ in 0..<4 { if pair.exists && pair.isHittable { break }; app.swipeUp() }
      XCTAssertTrue(pair.waitForExistence(timeout: 10)); pair.tap()
    }
    XCTAssertTrue(address.waitForExistence(timeout: 10), app.debugDescription)
    address.tap()
    if let current = address.value as? String, current.hasPrefix("http") || current.hasPrefix("ws") {
      address.press(forDuration: 1.2)
      let selectAll = app.descendants(matching: .any).matching(NSPredicate(format: "label IN %@", ["Select All", "Select all", "Tout sélectionner"])).firstMatch
      XCTAssertTrue(selectAll.waitForExistence(timeout: 5), app.debugDescription); selectAll.tap()
      address.typeText(XCUIKeyboardKey.delete.rawValue)
      XCTAssertTrue(address.value == nil || (address.value as? String)?.isEmpty == true, "Replace the whole server address, regardless of the initial caret position: " + app.debugDescription)
    }
    let origin = "https://myclaw-apns-dev.kalira-ia.com"
    FixtureEndpoint.type(origin, into: address)
    XCTAssertEqual(address.value as? String, origin); address.typeText("\n")
    let ticket = try await control("ticket")
    let code = try XCTUnwrap((try JSONSerialization.jsonObject(with: ticket) as? [String: String])?["code"])
    let claim = app.textFields["XXXX-XXXX"]
    XCTAssertTrue(claim.waitForExistence(timeout: 10)); claim.tap(); FixtureEndpoint.type(code, into: claim)
    app.buttons["Submit this pairing code"].tap()
    if app.buttons["Close settings"].waitForExistence(timeout: 3) { app.buttons["Close settings"].tap() }
    let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Conversation Fixture conversation")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 20), app.debugDescription); row.tap()
    let caption = "real HTTPS paired chat " + UUID().uuidString.prefix(8)
    send(caption); reply("Fixture reply to: " + caption)
    let received = try await facts().received
    XCTAssertEqual(received.filter { $0.text == caption }.count, 1)
    proof("Real HTTPS pairing and conversation through Cloudflare on TonyI")
  }

  func testOwnedImagePreviewAndExport() async throws {
    openConversation(); _ = try await control("image")
    let image = app.buttons["Open attachment myclaw-qa-image.png"].firstMatch
    XCTAssertTrue(image.waitForExistence(timeout: 15), app.debugDescription); image.tap()
    proof("Owned image displayed on the real iPhone")
    app.buttons["Download"].firstMatch.tap(); app.buttons["Save as…"].tap()
    let save = app.buttons.matching(NSPredicate(format: "label IN %@", ["Save", "Enregistrer"])).firstMatch
    XCTAssertTrue(save.waitForExistence(timeout: 10), app.debugDescription)
    let name = app.textFields["DOCPicker.filenameTextField"]
    let old = try XCTUnwrap(name.value as? String); let stem = "myclaw-image-" + UUID().uuidString.prefix(8)
    name.tap(); name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count) + stem)
    save.tap()
    let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: save)
    XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 10), .completed)
    proof("Owned image exported using the iOS document picker")
    if !app.buttons["Close image"].exists { app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap() }
    app.buttons.matching(NSPredicate(format: "label == %@", "Download")).mostRecent.tap(); app.buttons["Save to the gallery"].tap()
    let alert = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
    if alert.waitForExistence(timeout: 0.5), alert.label.contains("MyClaw") {
      let allow = alert.buttons.matching(NSPredicate(format: "label BEGINSWITH[cd] %@ OR label IN %@", "Autoriser", ["Allow", "OK"])).firstMatch
      XCTAssertTrue(allow.exists); allow.tap()
    }
    let savedToGallery = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Saved to the gallery")).firstMatch
    XCTAssertTrue(savedToGallery.waitForExistence(timeout: 10), app.debugDescription)
    proof("Real Photos transaction completed without crashing")
    if !app.buttons["Close image"].exists { app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap() }
    app.buttons["Close image"].tap()
    app.buttons["Add attachment"].tap(); app.buttons["File"].tap()
    let picked = app.cells.matching(NSPredicate(format: "label CONTAINS %@", String(stem))).firstMatch
    XCTAssertTrue(picked.waitForExistence(timeout: 10), "Only the image just exported by this test may be selected")
    picked.tap(); app.buttons.matching(NSPredicate(format: "label IN %@", ["Open", "Ouvrir"])).firstMatch.tap()
    send("owned image transfer"); reply("Fixture reply to: owned image transfer")
    let received = try await facts().received
    let message = try XCTUnwrap(received.last(where: { $0.text == "owned image transfer" }))
    XCTAssertEqual(message.files.count, 1); XCTAssertEqual(message.files.first?.type, "image")
    XCTAssertEqual(message.files.first?.name, String(stem) + ".png")
    XCTAssertGreaterThan(message.files.first?.size ?? 0, 1000)
    proof("Owned image selected and transferred through the real native file service")
    app.buttons["Add attachment"].tap(); app.buttons["Photo from gallery"].tap()
    let cancel = app.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "Annuler"])).firstMatch
    XCTAssertTrue(cancel.waitForExistence(timeout: 10), app.debugDescription)
    let picker = XCTAttachment(screenshot: app.navigationBars.firstMatch.screenshot())
    picker.name = "Real photo picker navigation without personal thumbnails"; picker.lifetime = .keepAlways; add(picker)
    cancel.tap()
    XCTAssertTrue(app.buttons["Add attachment"].waitForExistence(timeout: 5))
  }

  func testOwnedVideoPhotosExport() async throws {
    openConversation(); _ = try await control("video")
    let video = app.buttons["Open attachment video-fixture.mp4"].firstMatch
    XCTAssertTrue(video.waitForExistence(timeout: 15)); video.tap()
    XCTAssertTrue(app.buttons["Close video"].waitForExistence(timeout: 10))
    app.buttons["Download"].firstMatch.tap(); app.buttons["Save to the gallery"].tap()
    let saved = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Saved to the gallery")).firstMatch
    XCTAssertTrue(saved.waitForExistence(timeout: 10), app.debugDescription)
    proof("Owned video Photos transaction completed without crashing")
  }

  private func isOwnedGradient(_ screenshot: XCUIScreenshot) -> Bool {
    guard let image = screenshot.image.cgImage else { return false }
    let side = 64; var pixels = [UInt8](repeating: 0, count: side * side * 4)
    return pixels.withUnsafeMutableBytes { buffer in
      guard let context = CGContext(data: buffer.baseAddress, width: side, height: side, bitsPerComponent: 8,
        bytesPerRow: side * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
      context.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
      func color(_ x: Int, _ y: Int) -> (Int, Int, Int) {
        let i = (y * side + x) * 4
        return (Int(buffer[i]), Int(buffer[i + 1]), Int(buffer[i + 2]))
      }
      let a = color(13, 13), b = color(50, 13), c = color(13, 50), d = color(50, 50)
      let blue = [a.2, b.2, c.2, d.2].allSatisfy { (80...175).contains($0) }
      // The generated PNG is red left-to-right, green top-to-bottom and
      // constant blue. Either vertical orientation is accepted by CoreGraphics.
      return blue && a.0 < 100 && c.0 < 100 && b.0 > 150 && d.0 > 150
        && abs(a.1 - c.1) > 100 && abs(b.1 - d.1) > 100
    }
  }

  func testOwnedPhotoPickerSelectionAndUpload() async throws {
    openConversation(); app.buttons["Add attachment"].tap(); app.buttons["Photo from gallery"].tap()
    let cancel = app.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "Annuler"])).firstMatch
    XCTAssertTrue(cancel.waitForExistence(timeout: 10))
    let candidates = app.images.matching(identifier: "PXGGridLayout-Info")
    XCTAssertTrue(candidates.firstMatch.waitForExistence(timeout: 10))
    let photo = candidates.allElementsBoundByIndex.prefix(12).first { !$0.frame.isEmpty && isOwnedGradient($0.screenshot()) }
    guard let photo else {
      cancel.tap(); throw XCTSkip("The visible picker contains no verified owned gradient; no personal asset is selected")
    }
    let thumbnail = XCTAttachment(screenshot: photo.screenshot()); thumbnail.name = "Verified owned gradient in PHPicker"; thumbnail.lifetime = .keepAlways; add(thumbnail)
    photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    let done = app.buttons.matching(NSPredicate(format: "identifier == %@ OR label IN %@ OR label BEGINSWITH %@", "Add", ["Done", "Terminé", "Add"], "Ajouter")).firstMatch
    if done.waitForExistence(timeout: 2) { done.tap() }
    // A single-selection picker can dismiss itself immediately after the tap.
    let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: cancel)
    XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 10), .completed, "Confirm the selected owned photo before accessing the composer")
    send("owned gallery photo transfer"); reply("Fixture reply to: owned gallery photo transfer")
    let received = try await facts().received
    let message = try XCTUnwrap(received.last(where: { $0.text == "owned gallery photo transfer" }))
    XCTAssertEqual(message.files.count, 1); XCTAssertEqual(message.files.first?.type, "image")
    XCTAssertGreaterThan(message.files.first?.size ?? 0, 1000)
    proof("Owned gallery photo transferred through native PHPicker and URLSession")
  }
}
