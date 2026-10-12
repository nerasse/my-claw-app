#if os(iOS)
import XCTest
import MyClawNativeAdapters

@MainActor final class IOSNotificationsTests: XCTestCase {
  func testUnchangedAPNsTokenDoesNotPublishAnotherRefresh() {
    let notifications = IOSNotifications.shared
    let previous = notifications.tokenChanged
    var callbacks = 0; notifications.tokenChanged = { callbacks += 1 }
    defer { notifications.tokenChanged = previous }
    notifications.registered(Data([0xab, 0xcd]))
    let before = callbacks
    notifications.registered(Data([0xab, 0xcd]))
    print("APNS_CALLBACK_FACT unchangedTokenCallbacks=\(callbacks - before)")
    XCTAssertEqual(callbacks, before, "An unchanged APNs token must not trigger another enrollment refresh")
  }
  func testRepeatedAPNsFailureDoesNotPublishAnotherRefresh() {
    let notifications = IOSNotifications.shared
    let previous = notifications.tokenChanged
    var callbacks = 0; notifications.tokenChanged = { callbacks += 1 }
    defer { notifications.tokenChanged = previous }
    notifications.failed(); let before = callbacks
    notifications.failed()
    print("APNS_CALLBACK_FACT repeatedFailureCallbacks=\(callbacks - before)")
    XCTAssertEqual(callbacks, before, "Repeated registration failures must not recursively restart enrollment")
  }
}

#endif
