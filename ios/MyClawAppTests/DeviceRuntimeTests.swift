import Foundation
import XCTest
import MyClawNativeAdapters
@testable import MyClawApp

@MainActor final class DeviceRuntimeTests: XCTestCase {
  private func pairedFixture() throws -> String {
    guard let raw = ProcessInfo.processInfo.environment["MYCLAW_IOS_UI_PROBE_URL"],
      let url = URL(string: raw), url.scheme == "http", url.host == "127.0.0.1", url.port == 39080 else {
      throw XCTSkip("Requires the explicitly paired, isolated simulator fixture")
    }
    let preferences = UserDefaults.standard.dictionary(forKey: "MyClaw.preferences") as? [String: String]
    let identities = KeychainIdentityStore(service: (Bundle.main.bundleIdentifier ?? "MyClaw") + ".identity")
    guard preferences?["serverUrl"] == raw, let identity = try identities.load(origin: raw),
      !identity.deviceId.isEmpty else {
      throw XCTSkip("Pair the owned simulator fixture before the runtime integration tests")
    }
    return raw
  }

  private func preservingNotificationCallbacks(_ body: () throws -> Void) rethrows {
    let notifications = IOSNotifications.shared
    let tokenChanged = notifications.tokenChanged
    let registrationFailed = notifications.registrationFailed
    let openAvailable = notifications.openAvailable
    let accepts = notifications.accepts
    defer {
      notifications.tokenChanged = tokenChanged
      notifications.registrationFailed = registrationFailed
      notifications.openAvailable = openAvailable
      notifications.accepts = accepts
    }
    try body()
  }

  func testColdNotificationCannotBeDrainedBeforeTheInstanceIsAnnounced() throws {
    _ = try pairedFixture()
    try preservingNotificationCallbacks {
      var events: [String] = []
      let runtime = DeviceRuntime(emit: { name, _ in events.append(name) })
      defer { runtime.shutdown() }
      XCTAssertNil(try runtime.notificationOpen())
      XCTAssertFalse(events.contains("claw:push:open"), "A cold notification must stay buffered until the UI has reset for its instance")
    }
  }

  func testConnectionAnnouncesItsInstanceBeforeInvitingNotificationDrain() throws {
    let address = try pairedFixture()
    try preservingNotificationCallbacks {
      var events: [String] = []
      let runtime = DeviceRuntime(emit: { name, _ in events.append(name) })
      defer { runtime.shutdown() }
      try runtime.connect(address)
      let reset = try XCTUnwrap(events.firstIndex(of: "claw:instance"))
      let open = try XCTUnwrap(events.firstIndex(of: "claw:push:open"))
      XCTAssertLessThan(reset, open, "The startup reset must precede notification routing, otherwise it erases the requested conversation")
    }
  }
}
