import Foundation
import XCTest
import Security
@testable import MyClawNativeCore
@testable import MyClawNativeAdapters

final class EncryptedOutboxTests: XCTestCase {
  func testTheDurableQueueDoesNotWriteSendingCapabilitiesInPlaintextAndDetectsTampering() throws {
    let service = "MyClaw.test.outbox." + UUID().uuidString
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer {
      try? FileManager.default.removeItem(at: directory)
      SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
    }
    let origin = "https://instance.example"
    let store = EncryptedOutboxStore(directory: directory, service: service)
    let secret = "sending-secret-fixture"
    let frame = PendingFrame(text: "{\"type\":\"notifications.apns.register\",\"secret\":\"\(secret)\"}")
    try store.save([frame], origin: origin)
    XCTAssertEqual(try store.load(origin: origin), [frame])
    let recreated = EncryptedOutboxStore(directory: directory, service: service)
    XCTAssertEqual(try recreated.load(origin: origin), [frame])
    let file = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).first)
    var bytes = try Data(contentsOf: file)
    XCTAssertNil(bytes.range(of: Data(secret.utf8)))
    bytes[bytes.startIndex] ^= 1; try bytes.write(to: file)
    XCTAssertThrowsError(try recreated.load(origin: origin))
    XCTAssertEqual(try recreated.load(origin: "https://other.example"), [])
  }
}
