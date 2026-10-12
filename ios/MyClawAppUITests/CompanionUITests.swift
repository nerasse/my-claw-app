import XCTest

@MainActor final class CompanionUITests: XCTestCase {
  private struct FixtureFacts: Decodable { let received: [FixtureMessage]; let sourceVideoSha256: String }
  private struct FixtureMessage: Decodable { let text: String; let files: [FixtureFile] }
  private struct FixtureFile: Decodable { let name: String?; let type: String; let size: Int?; let sha256: String }

  override func setUp() { super.setUp(); continueAfterFailure = false }

  private func openFixtureConversation(in app: XCUIApplication) {
    let conversation = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Conversation Fixture conversation")).firstMatch
    XCTAssertTrue(conversation.waitForExistence(timeout: 15), app.debugDescription)
    conversation.tap()
  }

  private func fixture(_ path: String) async throws {
    let (_, response) = try await FixtureEndpoint.data(path)
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
  }

  private func screenshot(_ app: XCUIApplication, _ name: String) {
    let proof = XCTAttachment(screenshot: app.screenshot())
    proof.name = name; proof.lifetime = .keepAlways; add(proof)
  }

  private func serverFacts() async throws -> FixtureFacts {
    let (data, response) = try await FixtureEndpoint.data("facts")
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    return try JSONDecoder().decode(FixtureFacts.self, from: data)
  }

  private func receivedFiles(for text: String) async throws -> [FixtureFile] {
    let facts = try await serverFacts()
    return try XCTUnwrap(facts.received.last(where: { $0.text == text })).files
  }

  private func send(_ text: String, in app: XCUIApplication) {
    let composer = app.textViews.matching(NSPredicate(format: "label BEGINSWITH %@", "Message to send")).firstMatch
    XCTAssertTrue(composer.waitForExistence(timeout: 10), app.debugDescription)
    composer.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap(); composer.typeText(text)
    XCTAssertEqual(composer.value as? String, text, app.debugDescription)
    app.buttons["Send message"].tap()
  }

  private func dismissDebugWarning(in app: XCUIApplication) {
    let warning = app.otherElements.matching(NSPredicate(format: "label CONTAINS %@", "Open debugger to view warnings")).firstMatch
    guard warning.exists else { return }
    screenshot(app, "Debug warning before dismissal")
    warning.coordinate(withNormalizedOffset: CGVector(dx: 0.94, dy: 0.5)).tap()
    let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: warning)
    XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 5), .completed, app.debugDescription)
  }

  func testOfflineComposerAcceptsTextAndDeliversAfterReconnect() async throws {
    try await fixture("facts")
    let app = XCUIApplication(); FixtureEndpoint.launch(app); openFixtureConversation(in: app)
    try await fixture("pause")
    XCTAssertTrue(app.buttons["Connection status: disconnected"].waitForExistence(timeout: 10), app.debugDescription)
    let message = "typing while offline " + UUID().uuidString.prefix(8)
    let composer = app.textViews.matching(NSPredicate(format: "label BEGINSWITH %@", "Message to send")).firstMatch
    screenshot(app, "Offline composer before focus")
    composer.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    screenshot(app, "Offline composer after focus")
    composer.typeText(message)
    XCTAssertEqual(composer.value as? String, message, app.debugDescription)
    app.buttons["Send message"].tap()
    let reply = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Fixture reply to: " + message)).firstMatch
    XCTAssertTrue(reply.waitForExistence(timeout: 35), app.debugDescription)
    let uniqueReply = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Fixture reply to: " + message))
    // RN exposes each Text and its backing native Text with the same frame.
    // Count rendered rows rather than those nested accessibility representations.
    XCTAssertEqual(Set(uniqueReply.allElementsBoundByIndex.map { $0.frame.origin.y }).count, 1, app.debugDescription)
    screenshot(app, "Text entered while offline and received after reconnect")
  }

  func testDisconnectedDevicesExplainFailureAndRecover() async throws {
    try await fixture("facts")
    let app = XCUIApplication(); FixtureEndpoint.launch(app); openFixtureConversation(in: app)
    try await fixture("pause")
    XCTAssertTrue(app.buttons["Connection status: disconnected"].waitForExistence(timeout: 5), app.debugDescription)
    app.buttons["Open conversations"].tap()
    app.buttons["Open settings"].tap()
    app.buttons["Open devices"].tap()
    let failure = app.staticTexts["Connection failure"].firstMatch
    XCTAssertTrue(failure.waitForExistence(timeout: 5), app.debugDescription)
    XCTAssertTrue(app.staticTexts["Connect to your server to load paired devices."].exists, app.debugDescription)
    XCTAssertFalse(app.staticTexts["loading"].exists, app.debugDescription)
    screenshot(app, "Devices explains the native connection failure without indefinite loading")

    XCTAssertTrue(app.staticTexts["PAIRED · 1"].waitForExistence(timeout: 40), app.debugDescription)
    XCTAssertFalse(failure.exists, app.debugDescription)
    XCTAssertFalse(app.staticTexts["Connect to your server to load paired devices."].exists, app.debugDescription)
    screenshot(app, "Paired devices recovered automatically after the server returned")
  }

  func testPairedCompanionResilienceMediaAndSettings() async throws {
    try await fixture("facts")
    let app = XCUIApplication(); FixtureEndpoint.launch(app)
    openFixtureConversation(in: app)
    let composer = app.textViews.matching(NSPredicate(format: "label BEGINSWITH %@", "Message to send")).firstMatch
    XCTAssertTrue(composer.waitForExistence(timeout: 15), app.debugDescription)

    let offlineMessage = "network outage " + UUID().uuidString.prefix(8)
    composer.tap(); composer.typeText(offlineMessage)
    XCTAssertEqual(composer.value as? String, offlineMessage, app.debugDescription)
    try await fixture("pause")
    app.buttons["Send message"].tap()
    let recovered = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Fixture reply to: " + offlineMessage)).firstMatch
    XCTAssertTrue(recovered.waitForExistence(timeout: 35), app.debugDescription)
    app.terminate(); FixtureEndpoint.launch(app)
    openFixtureConversation(in: app)
    XCTAssertTrue(recovered.waitForExistence(timeout: 15), app.debugDescription)
    screenshot(app, "Conversation after network outage and cold launch")

    send("qa approval", in: app)
    XCTAssertTrue(app.buttons["Allow once"].waitForExistence(timeout: 10), app.debugDescription)
    XCUIDevice.shared.press(.home); app.activate()
    XCTAssertTrue(app.buttons["Allow once"].waitForExistence(timeout: 10), app.debugDescription)
    screenshot(app, "Validation retained after suspension")
    app.buttons["Allow once"].tap()
    let approved = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Fixture approval: allow-once")).firstMatch
    XCTAssertTrue(approved.waitForExistence(timeout: 10), app.debugDescription)

    try await fixture("media")
    let play = app.buttons["Play voice message"].firstMatch
    XCTAssertTrue(play.waitForExistence(timeout: 15), app.debugDescription)
    play.tap()
    XCTAssertTrue(app.buttons["Pause voice message"].waitForExistence(timeout: 10), app.debugDescription)
    app.buttons["Pause voice message"].tap()
    let speed = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Playback speed")).firstMatch
    let previousSpeed = speed.label
    speed.tap()
    XCTAssertNotEqual(speed.label, previousSpeed, app.debugDescription)
    screenshot(app, "Native voice playback and received document")

    let file = app.buttons["Open attachment document-fixture.txt"].firstMatch
    XCTAssertTrue(file.waitForExistence(timeout: 5), app.debugDescription)
    file.tap()
    let contents = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "MyClaw simulator document fixture.")).firstMatch
    XCTAssertTrue(contents.waitForExistence(timeout: 10), app.debugDescription)
    screenshot(app, "Received document preview")
    let closePreview = app.buttons["Close file view"]
    closePreview.tap()
    let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: closePreview)
    XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 5), .completed, app.debugDescription)
    if !FixtureEndpoint.physical {
      app.buttons["Record voice message"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 1.2)
    let blocked = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Microphone blocked.")).firstMatch
    XCTAssertTrue(blocked.waitForExistence(timeout: 5), app.debugDescription)
    screenshot(app, "Explicit microphone refusal")
    }

  }

  func testNativePhotoSelectionAndNotificationSettings() async throws {
    guard !FixtureEndpoint.physical else { throw XCTSkip("Requires a simulator seeded only with the owned QA image") }
    try await fixture("facts")
    let app = XCUIApplication(); FixtureEndpoint.launch(app)
    openFixtureConversation(in: app)
    app.buttons["Add attachment"].tap()
    app.buttons["Photo from gallery"].tap()
    let cancel = app.buttons.matching(NSPredicate(format: "label IN %@", ["Cancel", "Annuler"])).firstMatch
    XCTAssertTrue(cancel.waitForExistence(timeout: 10), app.debugDescription)
    screenshot(app, "Native photo picker")
    let photo = app.images.matching(identifier: "PXGGridLayout-Info").firstMatch
    XCTAssertTrue(photo.waitForExistence(timeout: 5), app.debugDescription)
    // PHPicker's remote image exposes its frame but reports isHittable=false to XCTest.
    photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    app.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "Terminé"])).firstMatch.tap()
    XCTAssertTrue(app.buttons["Send message"].waitForExistence(timeout: 15), app.debugDescription)
    send("photo transfer", in: app)
    let transferred = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Fixture reply to: photo transfer")).firstMatch
    XCTAssertTrue(transferred.waitForExistence(timeout: 15), app.debugDescription)
    let files = try await receivedFiles(for: "photo transfer")
    XCTAssertEqual(files.count, 1)
    XCTAssertEqual(files.first?.type, "image")
    XCTAssertGreaterThan(files.first?.size ?? 0, 0)
    screenshot(app, "Selected image transferred to the real server adapter")
    app.buttons["Open conversations"].tap()
    app.buttons["Open settings"].tap()
    app.buttons["Open notifications"].tap()
    XCTAssertTrue(app.staticTexts["unavailable"].waitForExistence(timeout: 10), app.debugDescription)
    XCTAssertFalse(app.buttons["Install UnifiedPush"].exists)
    screenshot(app, "iOS notification state without a relay")
    let permissionLabel = app.staticTexts["permission"].firstMatch
    let permissionValue = app.staticTexts["not allowed yet"].firstMatch
    XCTAssertTrue(permissionValue.exists, app.debugDescription)
    XCTAssertLessThanOrEqual(permissionLabel.frame.height, permissionValue.frame.height + 1,
      "Notification labels must remain readable without splitting words at large text sizes")
    // Regression: notifications keeps the settings navigation, including on a compact iPhone.
    let backToSettings = app.buttons["Back to settings"]
    XCTAssertTrue(backToSettings.exists, app.debugDescription)
    backToSettings.tap()
    XCTAssertTrue(app.buttons["Open notifications"].waitForExistence(timeout: 5), app.debugDescription)
    app.buttons["Open notifications"].tap()
    app.buttons["Close settings"].tap()
  }

  func testSaveAndSelectNativeDocument() async throws {
    try await fixture("facts")
    let app = XCUIApplication(); FixtureEndpoint.launch(app); openFixtureConversation(in: app)
    try await fixture("media")
    let file = app.buttons["Open attachment document-fixture.txt"].firstMatch
    XCTAssertTrue(file.waitForExistence(timeout: 10), app.debugDescription)
    file.tap()
    let contents = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "MyClaw simulator document fixture.")).firstMatch
    XCTAssertTrue(contents.waitForExistence(timeout: 10), app.debugDescription)
    app.buttons["Download"].firstMatch.tap()
    app.buttons["Save as…"].tap()
    let save = app.buttons.matching(NSPredicate(format: "label IN %@", ["Save", "Enregistrer"])).firstMatch
    XCTAssertTrue(save.waitForExistence(timeout: 10), app.debugDescription)
    screenshot(app, "Native document export")
    let name = app.textFields["DOCPicker.filenameTextField"]
    let oldName = try XCTUnwrap(name.value as? String)
    let stem = "myclaw-simulator-" + UUID().uuidString.prefix(8)
    name.tap(); name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: oldName.count) + stem)
    save.tap()
    let exported = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: save)
    XCTAssertEqual(XCTWaiter.wait(for: [exported], timeout: 10), .completed, app.debugDescription)
    app.buttons["Close file view"].tap()
    app.buttons["Add attachment"].tap(); app.buttons["File"].tap()
    let browse = app.buttons["Browse"].firstMatch
    if browse.waitForExistence(timeout: 3) { browse.tap() }
    // Browse can return to Locations instead of the folder the export picker just used.
    let localStorage = app.cells["DOC.sidebar.item.On My iPhone"]
    if localStorage.exists { localStorage.tap() }
    let pickedFile = app.cells.matching(NSPredicate(format: "label CONTAINS %@", String(stem))).firstMatch
    XCTAssertTrue(pickedFile.waitForExistence(timeout: 10), app.debugDescription)
    screenshot(app, "Native document selection")
    pickedFile.tap()
    app.buttons.matching(NSPredicate(format: "label IN %@", ["Open", "Ouvrir"])).firstMatch.tap()
    XCTAssertTrue(app.buttons["Send message"].waitForExistence(timeout: 15), app.debugDescription)
    send("document transfer", in: app)
    let transferred = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Fixture reply to: document transfer")).firstMatch
    XCTAssertTrue(transferred.waitForExistence(timeout: 15), app.debugDescription)
    let files = try await receivedFiles(for: "document transfer")
    XCTAssertEqual(files.count, 1)
    XCTAssertEqual(files.first?.name, String(stem) + ".txt")
    XCTAssertEqual(files.first?.type, "file")
    XCTAssertEqual(files.first?.size, 53)
    screenshot(app, "Exported document selected and transferred")
  }

  func testManualPairStreamingAndResume() throws {
    let environment = ProcessInfo.processInfo.environment
    guard let server = environment["MYCLAW_IOS_UI_PROBE_URL"], !server.isEmpty,
      let code = environment["MYCLAW_IOS_UI_PROBE_CODE"], !code.isEmpty else {
      throw XCTSkip("Requires an isolated MyClaw UI fixture and a fresh simulator installation")
    }
    let app = XCUIApplication(); FixtureEndpoint.launch(app)
    let address = app.textFields["Server address"]
    XCTAssertTrue(address.waitForExistence(timeout: 15), app.debugDescription)
    address.tap()
    if let existing = address.value as? String, existing.hasPrefix("http") || existing.hasPrefix("ws") {
      FixtureEndpoint.type(String(repeating: XCUIKeyboardKey.delete.rawValue, count: existing.count), into: address)
    }
    // Let the controlled RN field settle between keys; simulator keyboard synthesis can
    // drop repeated characters when typeText sends a complete URL at full speed.
    for character in server { address.typeText(String(character)) }
    XCTAssertEqual(address.value as? String, server, app.debugDescription)
    address.typeText("\n")
    let claim = app.textFields["XXXX-XXXX"]
    XCTAssertTrue(claim.waitForExistence(timeout: 5), app.debugDescription)
    claim.tap(); FixtureEndpoint.type(code, into: claim)
    XCTAssertEqual((claim.value as? String)?.replacingOccurrences(of: "-", with: ""), code, app.debugDescription)
    app.buttons["Submit this pairing code"].tap()
    let conversation = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Fixture conversation")).firstMatch
    XCTAssertTrue(conversation.waitForExistence(timeout: 15), app.debugDescription)
    conversation.tap()
    let composer = app.textViews.matching(NSPredicate(format: "label BEGINSWITH %@", "Message to send")).firstMatch
    XCTAssertTrue(composer.waitForExistence(timeout: 10), app.debugDescription)
    composer.tap(); composer.typeText("iOS integration test")
    app.buttons["Send message"].tap()
    let partial = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@ AND NOT (label CONTAINS %@)", "Fixture reply to:", "iOS integration test")).firstMatch
    XCTAssertTrue(partial.waitForExistence(timeout: 5), app.debugDescription)
    screenshot(app, "Partial response before streaming completes")
    let reply = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Fixture reply to: iOS integration test")).firstMatch
    XCTAssertTrue(reply.waitForExistence(timeout: 10), app.debugDescription)
    let first = XCTAttachment(screenshot: app.screenshot()); first.name = "Paired native conversation"; first.lifetime = .keepAlways; add(first)
    XCUIDevice.shared.press(.home); app.activate()
    XCTAssertTrue(composer.waitForExistence(timeout: 10))
    composer.tap(); composer.typeText("after resume")
    app.buttons["Send message"].tap()
    let resumed = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Fixture reply to: after resume")).firstMatch
    XCTAssertTrue(resumed.waitForExistence(timeout: 10), app.debugDescription)
    let pending = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", " pending"))
    let drained = XCTNSPredicateExpectation(predicate: NSPredicate(format: "count == 0"), object: pending)
    XCTAssertEqual(XCTWaiter.wait(for: [drained], timeout: 30), .completed, app.debugDescription)
    let final = XCTAttachment(screenshot: app.screenshot()); final.name = "Conversation after resume"; final.lifetime = .keepAlways; add(final)
  }

  func testReceivedVideoUsesNativePlaybackAndFileTransfer() async throws {
    try await fixture("video")
    let app = XCUIApplication(); FixtureEndpoint.launch(app); openFixtureConversation(in: app)
    // Emit after opening: the fixture intentionally does not fake persistent media history.
    try await fixture("video")
    let video = app.buttons["Open attachment video-fixture.mp4"].firstMatch
    XCTAssertTrue(video.waitForExistence(timeout: 15), app.debugDescription)
    video.tap()
    XCTAssertTrue(app.buttons["Close video"].waitForExistence(timeout: 10), app.debugDescription)
    let filename = app.staticTexts["video-fixture.mp4"].firstMatch
    XCTAssertTrue(filename.waitForExistence(timeout: 5), app.debugDescription)
    XCTAssertLessThanOrEqual(filename.frame.maxY, app.otherElements["Video"].firstMatch.frame.minY,
      "The filename must not cover the native video controls")
    screenshot(app, "Received video in native player")
    app.otherElements["Video"].firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    let toggle = app.buttons["Play/Pause"]
    XCTAssertTrue(toggle.waitForExistence(timeout: 5), app.debugDescription)
    // AVKit's centre tap can both reveal controls and pause an autoplaying video.
    if toggle.label == "Play" { toggle.tap() }
    let pause = app.buttons.matching(NSPredicate(format: "label IN %@", ["Pause", "Pause Playback", "Mettre en pause"])).firstMatch
    XCTAssertTrue(pause.waitForExistence(timeout: 5), app.debugDescription)
    pause.tap()
    let play = app.buttons.matching(NSPredicate(format: "label IN %@", ["Play", "Play Playback", "Lire"])).firstMatch
    XCTAssertTrue(play.waitForExistence(timeout: 5), app.debugDescription)
    let position = app.sliders.matching(NSPredicate(format: "identifier == %@", "Current position")).firstMatch
    let oldPosition = try XCTUnwrap(position.value as? String)
    app.buttons["Skip Backward"].tap()
    let sought = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value != %@", oldPosition), object: position)
    XCTAssertEqual(XCTWaiter.wait(for: [sought], timeout: 5), .completed, app.debugDescription)
    play.tap()
    XCTAssertTrue(pause.waitForExistence(timeout: 5), app.debugDescription)
    screenshot(app, "Native video resumed")
    app.buttons["Download"].firstMatch.tap(); app.buttons["Save as…"].tap()
    let save = app.buttons.matching(NSPredicate(format: "label IN %@", ["Save", "Enregistrer"])).firstMatch
    XCTAssertTrue(save.waitForExistence(timeout: 10), app.debugDescription)
    let name = app.textFields["DOCPicker.filenameTextField"]
    let oldName = try XCTUnwrap(name.value as? String)
    let stem = "myclaw-video-" + UUID().uuidString.prefix(8)
    name.tap(); name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: oldName.count) + stem)
    save.tap()
    let exported = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: save)
    XCTAssertEqual(XCTWaiter.wait(for: [exported], timeout: 10), .completed, app.debugDescription)
    app.buttons["Close video"].tap()
    app.buttons["Add attachment"].tap(); app.buttons["File"].tap()
    let pickedFile = app.cells.matching(NSPredicate(format: "label CONTAINS %@", String(stem))).firstMatch
    XCTAssertTrue(pickedFile.waitForExistence(timeout: 10), app.debugDescription)
    pickedFile.tap()
    let open = app.buttons.matching(NSPredicate(format: "label IN %@", ["Open", "Ouvrir"])).firstMatch
    open.tap()
    let pickerClosed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: open)
    XCTAssertEqual(XCTWaiter.wait(for: [pickerClosed], timeout: 10), .completed, app.debugDescription)
    XCTAssertTrue(app.buttons["Send message"].waitForExistence(timeout: 15), app.debugDescription)
    dismissDebugWarning(in: app)
    send("video transfer", in: app)
    let transferred = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Fixture reply to: video transfer")).firstMatch
    XCTAssertTrue(transferred.waitForExistence(timeout: 15), app.debugDescription)
    let facts = try await serverFacts()
    let files = try XCTUnwrap(facts.received.last(where: { $0.text == "video transfer" })).files
    XCTAssertEqual(files.count, 1)
    XCTAssertEqual(files.first?.name, String(stem) + ".mp4")
    XCTAssertEqual(files.first?.type, "video")
    XCTAssertGreaterThan(files.first?.size ?? 0, 1000)
    XCTAssertEqual(files.first?.sha256, facts.sourceVideoSha256)
    screenshot(app, "Video exported, selected and transferred")
  }
}

@MainActor final class TestFlightCompanionUITests: XCTestCase {
  private func requireProductionQA() throws {
    guard ProcessInfo.processInfo.environment["MYCLAW_TESTFLIGHT_QA"] == "1" else {
      throw XCTSkip("Explicit qualification of the installed MyClaw TestFlight beta only")
    }
    continueAfterFailure = false
  }

  private func proof(_ app: XCUIApplication, _ name: String) {
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = name; screenshot.lifetime = .keepAlways; add(screenshot)
    let hierarchy = XCTAttachment(string: app.debugDescription)
    hierarchy.name = name + " hierarchy"; hierarchy.lifetime = .keepAlways; add(hierarchy)
  }

  func testInspectInstalledBeta() throws {
    try requireProductionQA()
    let app = XCUIApplication(bundleIdentifier: "com.kalira.myclaw")
    app.activate()
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20))
    proof(app, "Installed MyClaw TestFlight beta")
  }

  func testContinueMyClawBetaNotes() throws {
    try requireProductionQA()
    let app = XCUIApplication(bundleIdentifier: "com.kalira.myclaw")
    app.activate()
    let appleSheet = XCUIApplication(bundleIdentifier: "com.apple.ios.StoreKitUIService")
    guard appleSheet.state == .runningForeground else {
      proof(app, "MyClaw beta notes already acknowledged")
      return
    }
    XCTAssertTrue(appleSheet.staticTexts["MyClaw"].waitForExistence(timeout: 10))
    XCTAssertTrue(appleSheet.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Version 1.0 (3)")).firstMatch.exists)
    let next = appleSheet.buttons["Continuer"]
    XCTAssertTrue(next.exists); next.tap()
    proof(app, "MyClaw after acknowledging its beta test notes")
    if appleSheet.state == .runningForeground { proof(appleSheet, "Apple sheet after beta notes") }
  }

  func testInspectBetaFirstLaunch() throws {
    try requireProductionQA()
    let app = XCUIApplication(bundleIdentifier: "com.kalira.myclaw")
    app.activate()
    proof(app, "MyClaw production beta first-launch state")
    let appleSheet = XCUIApplication(bundleIdentifier: "com.apple.ios.StoreKitUIService")
    if appleSheet.state != .notRunning { proof(appleSheet, "Apple TestFlight first-launch sheet") }
  }

  func testInspectTestFlightUpdate() throws {
    try requireProductionQA()
    let testFlight = XCUIApplication(bundleIdentifier: "com.apple.TestFlight")
    testFlight.activate()
    XCTAssertTrue(testFlight.wait(for: .runningForeground, timeout: 20))
    proof(testFlight, "MyClaw TestFlight update availability")
  }

  func testInstallLatestTestFlightBeta() throws {
    try requireProductionQA()
    let testFlight = XCUIApplication(bundleIdentifier: "com.apple.TestFlight")
    testFlight.activate()
    let ownInstall = testFlight.buttons["AppList.InstallButton.6821822573"]
    let update = ownInstall.buttons.matching(NSPredicate(format: "label IN %@", ["Mettre à jour", "Update", "Installer", "Install"])).firstMatch
    if !update.waitForExistence(timeout: 10) {
      let list = testFlight.scrollViews.firstMatch
      if list.exists { list.swipeDown() }
    }
    proof(testFlight, "MyClaw beta update before installation")
    let open = ownInstall.buttons.matching(NSPredicate(format: "label IN %@", ["Ouvrir", "Open"])).firstMatch
    // TestFlight can update automatically between inspection and this test.
    if !open.exists {
      let updateAvailable = update.waitForExistence(timeout: 45)
      if updateAvailable { update.tap() }
      XCTAssertTrue(open.waitForExistence(timeout: 120), testFlight.debugDescription)
    }
    proof(testFlight, "MyClaw beta installed through TestFlight")
    open.tap()
    let app = XCUIApplication(bundleIdentifier: "com.kalira.myclaw")
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20))
    proof(app, "First launch of notification beta")
  }


  func testInspectMyClawUpdateDetails() throws {
    try requireProductionQA()
    let testFlight = XCUIApplication(bundleIdentifier: "com.apple.TestFlight")
    testFlight.activate()
    let alert = testFlight.alerts.firstMatch
    if alert.exists {
      let cancel = alert.buttons.matching(NSPredicate(format: "label IN %@", ["Annuler", "Cancel"])).firstMatch
      XCTAssertTrue(cancel.exists, "Cancel the unconfirmed installation prompt")
      cancel.tap()
    }
    let ownTitle = testFlight.staticTexts["MyClaw"].firstMatch
    XCTAssertTrue(ownTitle.waitForExistence(timeout: 15))
    ownTitle.tap()
    proof(testFlight, "MyClaw-only TestFlight build details")
  }


  func testEnableProductionNotifications() throws {
    try requireProductionQA()
    XCUIDevice.shared.orientation = .portrait
    let app = XCUIApplication(bundleIdentifier: "com.kalira.myclaw")
    app.activate()
    if !app.buttons["Allow notifications"].exists {
      if app.buttons["Open conversations"].exists { app.buttons["Open conversations"].tap() }
      let settings = app.buttons["Open settings"]
      XCTAssertTrue(settings.waitForExistence(timeout: 15), app.debugDescription)
      settings.tap()
      let notifications = app.buttons["Open notifications"]
      XCTAssertTrue(notifications.waitForExistence(timeout: 15), app.debugDescription)
      notifications.tap()
    }
    let enable = app.buttons["Allow notifications"]
    if enable.waitForExistence(timeout: 5) {
      enable.tap()
      let permission = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
      if permission.waitForExistence(timeout: 5) {
        XCTAssertTrue(permission.label.contains("MyClaw"), permission.debugDescription)
        let allow = permission.buttons.matching(NSPredicate(format: "label IN %@", ["Autoriser", "Allow"])).firstMatch
        XCTAssertTrue(allow.exists, permission.debugDescription); allow.tap()
      }
    }
    proof(app, "Production notification enrollment state")
    XCTAssertTrue(app.staticTexts["ready"].waitForExistence(timeout: 60), app.debugDescription)
    proof(app, "Production App Attest and registration acknowledged")
  }


  func testGetStartedCompleteOnProductionBeta() throws {
    try requireProductionQA()
    let app = XCUIApplication(bundleIdentifier: "com.kalira.myclaw")
    app.activate()
    if app.buttons["Close settings"].exists { app.buttons["Close settings"].tap() }
    if app.buttons["Open conversations"].exists { app.buttons["Open conversations"].tap() }
    XCTAssertTrue(app.buttons["Open settings"].waitForExistence(timeout: 15)); app.buttons["Open settings"].tap()
    app.buttons["Open advanced"].tap(); app.buttons["Open get started"].tap()
    XCTAssertTrue(app.buttons["Setup step Location, done"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.buttons["Setup step Notifications, done"].waitForExistence(timeout: 15))
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label MATCHES %@", ".*10\\s+of\\s+10.*")).firstMatch.exists, app.debugDescription)
    proof(app, "Actual iPhone Get started 10 of 10")
  }

  func testBackgroundForProductionPush() throws {
    try requireProductionQA()
    let app = XCUIApplication(bundleIdentifier: "com.kalira.myclaw")
    app.activate(); XCUIDevice.shared.press(.home)
    XCTAssertTrue(app.wait(for: .runningBackground, timeout: 10) || app.state == .notRunning)
  }

  func testTerminateForColdProductionPush() throws {
    try requireProductionQA()
    let app = XCUIApplication(bundleIdentifier: "com.kalira.myclaw")
    app.terminate(); XCUIDevice.shared.press(.home)
    XCTAssertEqual(app.state, .notRunning)
  }

  func testOpenActualProductionNotification() throws {
    try requireProductionQA()
    let app = XCUIApplication(bundleIdentifier: "com.kalira.myclaw")
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let top = springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.01))
    top.press(forDuration: 0.05, thenDragTo: springboard.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.8)))
    let notification = springboard.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Aperçu MyClaw production")).firstMatch
    XCTAssertTrue(notification.waitForExistence(timeout: 30), "The real MyClaw production notification must be delivered")
    let preview = XCTAttachment(screenshot: notification.screenshot()); preview.name = "Real APNs production preview"; preview.lifetime = .keepAlways; add(preview)
    notification.tap()
    if app.state != .runningForeground {
      let grouped = springboard.descendants(matching: .any).matching(NSPredicate(format: "identifier == %@ AND label CONTAINS %@", "NotificationShortLookView", "Aperçu MyClaw production")).firstMatch
      XCTAssertTrue(grouped.waitForExistence(timeout: 5)); grouped.tap()
    }
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
    XCTAssertTrue(app.buttons["Open conversations"].waitForExistence(timeout: 20), app.debugDescription)
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "QA notifications production")).firstMatch.waitForExistence(timeout: 20), app.debugDescription)
    XCTAssertTrue(app.textViews.matching(NSPredicate(format: "label BEGINSWITH %@", "Message to send")).firstMatch.exists)
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Aperçu MyClaw production")).firstMatch.exists)
    proof(app, "Real production notification opens its matching conversation")
  }

}
