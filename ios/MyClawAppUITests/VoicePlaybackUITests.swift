import XCTest

@MainActor final class VoicePlaybackUITests: XCTestCase {
  private let app = XCUIApplication()
  override func setUp() { super.setUp(); continueAfterFailure = false }
  override func tearDown() { app.terminate(); super.tearDown() }
  private func control(_ path: String) async throws -> Data {
    let (data, response) = try await FixtureEndpoint.data(path)
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    return data
  }
  private func proof(_ name: String) {
    let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    let hierarchy = XCTAttachment(string: app.debugDescription); hierarchy.name = name + " hierarchy"; hierarchy.lifetime = .keepAlways; add(hierarchy)
  }
  private func openMedia() async throws {
    _ = try FixtureEndpoint.controlURL("facts")
    _ = try await control("release-media")
    app.terminate(); FixtureEndpoint.launch(app)
    // Recreated synthetic fixture can replay its previous test-only approval. Resolve that setup state before opening the conversation.
    if app.buttons["Deny"].exists { proof("Synthetic fixture approval precondition"); app.buttons["Deny"].tap() }
    let conversation = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Conversation Fixture conversation")).firstMatch
    XCTAssertTrue(conversation.waitForExistence(timeout: 15), app.debugDescription)
    // The persisted synthetic outbox can deliver its test approval after the first snapshot.
    if app.buttons["Deny"].waitForExistence(timeout: 2) { app.buttons["Deny"].tap() }
    let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: conversation)
    XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 10), .completed, app.debugDescription)
    conversation.tap()
    _ = try await control("media")
    XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label == %@", "Play voice message")).mostRecent.waitForExistence(timeout: 10))
    for _ in 0..<4 {
      let speed = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Playback speed")).mostRecent
      if speed.label == "Playback speed 1×" { break }
      speed.tap()
    }
  }
  private var position: XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Playback position")).mostRecent
  }
  private func percent() -> Double {
    guard let value = position.value as? String else { return -1 }
    return Double(value.filter { $0.isNumber || $0 == "." }) ?? -1
  }
  func testRemoteVoiceResumePreservesPausedPosition() async throws {
    try await openMedia()
    app.buttons.matching(NSPredicate(format: "label == %@", "Play voice message")).mostRecent.tap()
    let progressed = XCTNSPredicateExpectation(predicate: NSPredicate { [self] _, _ in percent() >= 35 }, object: nil)
    let result = XCTWaiter.wait(for: [progressed], timeout: 10)
    proof("Remote voice before pause on the actual device")
    print("VOICE_PROGRESS_FACT percent=\(percent()) value=\(String(describing: position.value))")
    XCTAssertEqual(result, .completed, app.debugDescription)
    app.buttons.matching(NSPredicate(format: "label == %@", "Pause voice message")).mostRecent.tap()
    let before = percent(); XCTAssertGreaterThanOrEqual(before, 35)
    proof("Voice paused after progressing")
    app.buttons.matching(NSPredicate(format: "label == %@", "Play voice message")).mostRecent.tap()
    XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label == %@", "Pause voice message")).mostRecent.waitForExistence(timeout: 5))
    let after = percent(); proof("Voice resumed position")
    print("VOICE_RESUME_FACT beforePercent=\(before) afterPercent=\(after)")
    XCTAssertGreaterThanOrEqual(after, before - 10, "Remote voice resume must continue at the paused position")
  }
  func testDelayedVoiceRemainsPausedAfterDownloadCompletes() async throws {
    try await openMedia()
    _ = try await control("hold-media")
    app.buttons.matching(NSPredicate(format: "label == %@", "Play voice message")).mostRecent.tap()
    var pending = 0
    for _ in 0..<30 {
      let data = try await control("delay-status")
      pending = (try JSONSerialization.jsonObject(with: data) as? [String: Int])?["pending"] ?? 0
      if pending > 0 { break }
      try await Task.sleep(for: .milliseconds(100))
    }
    XCTAssertEqual(pending, 1, "The actual native download must be in flight")
    app.buttons.matching(NSPredicate(format: "label == %@", "Pause voice message")).mostRecent.tap()
    XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label == %@", "Play voice message")).mostRecent.exists)
    proof("Voice paused while native download is held")
    _ = try await control("release-media")
    let restarted = app.buttons["Pause voice message"].firstMatch.waitForExistence(timeout: 5)
    proof("Voice after delayed download completes")
    print("VOICE_DELAY_FACT pendingDownloads=\(pending) restartedAfterPause=\(restarted)")
    XCTAssertFalse(restarted, "Pausing an in-flight voice request must prevent playback when the download finishes")
  }
}
