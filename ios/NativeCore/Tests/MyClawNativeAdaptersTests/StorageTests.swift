import Foundation
import XCTest
import Security
import MyClawNativeCore
@testable import MyClawNativeAdapters

final class StorageTests: XCTestCase {
  func testFileBackedQueueSurvivesRecreationWithoutMovingToAnotherOrigin() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("myclaw-outbox-test-\(UUID())")
    defer { try? FileManager.default.removeItem(at: directory) }
    let queue = try DurableOutbox(origin: "https://one.example", store: JSONOutboxStore(directory: directory))
    XCTAssertTrue(try queue.enqueue("{\"type\":\"chat.send\",\"id\":\"message-1\"}"))
    queue.markSent(try XCTUnwrap(queue.nextToSend).id)
    let reopened = try DurableOutbox(origin: "https://one.example", store: JSONOutboxStore(directory: directory))
    XCTAssertEqual(reopened.pendingCount, 1)
    XCTAssertEqual(reopened.nextToSend?.text, "{\"type\":\"chat.send\",\"id\":\"message-1\"}")
    XCTAssertEqual(try DurableOutbox(origin: "https://two.example", store: JSONOutboxStore(directory: directory)).pendingCount, 0)
  }

  func testCorruptPersistentStateIsReportedInsteadOfSilentlyDiscarded() throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("myclaw-outbox-test-\(UUID())")
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = JSONOutboxStore(directory: directory)
    try store.save([PendingFrame(text: "first")], origin: "https://one.example")
    let file = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).first)
    try Data("broken".utf8).write(to: file)
    XCTAssertThrowsError(try store.load(origin: "https://one.example"))
  }

  func testKeychainCredentialsAreIsolatedAndCanBeRemoved() throws {
    let store = KeychainIdentityStore(service: "myclaw.test.\(UUID())")
    defer { try? store.remove(origin: "https://one.example") }
    let identity = DeviceIdentity(deviceId: "device-1", token: "fixture-token", origin: "https://one.example")
    try store.save(identity)
    XCTAssertEqual(try store.load(origin: "https://one.example"), identity)
    XCTAssertNil(try store.load(origin: "https://two.example"))
    try store.remove(origin: "https://one.example")
    XCTAssertNil(try store.load(origin: "https://one.example"))
  }

  func testReplacingThePairedIdentityDoesNotKeepTheOldToken() throws {
    let store = KeychainIdentityStore(service: "myclaw.test.\(UUID())")
    defer { try? store.remove(origin: "https://one.example") }
    try store.save(DeviceIdentity(deviceId: "old", token: "old-fixture", origin: "https://one.example"))
    let new = DeviceIdentity(deviceId: "new", token: "new-fixture", origin: "https://one.example")
    try store.save(new)
    XCTAssertEqual(try store.load(origin: "https://one.example"), new)
  }
  @MainActor func testAnAppReinstallationCannotReuseAnAppAttestKeyFromTheOldInstallation() throws {
    let service = "myclaw.test.push.\(UUID())"
    let store = PushSecureStorage(service: service)
    defer { SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary) }
    let relay = URL(string: "https://relay.example")!
    try store.prepareInstallation("first-install")
    try store.saveKey("old-attest-key", relay: relay)
    try store.save(PushEnrollment(relay: relay, origin: "https://one.example", deviceId: "device",
      registrationId: UUID().uuidString, secret: "fixture", token: "token"))
    try store.prepareInstallation("first-install")
    XCTAssertEqual(try store.key(relay: relay), "old-attest-key")
    XCTAssertNotNil(try store.load())
    try store.prepareInstallation("new-install")
    XCTAssertNil(try store.key(relay: relay)); XCTAssertNil(try store.load())
  }
  @MainActor func testPushStorageCannotResumeAnOldAssociationAfterPreparationFails() throws {
    let service = "myclaw.test.push.\(UUID())"
    let store = PushSecureStorage(service: service)
    defer { SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary) }
    let relay = URL(string: "https://relay.example")!
    try store.prepareInstallation("valid-install")
    try store.saveKey("old-key", relay: relay)
    XCTAssertThrowsError(try store.prepareInstallation(""))
    XCTAssertThrowsError(try store.load())
    XCTAssertThrowsError(try store.key(relay: relay))
    XCTAssertThrowsError(try store.save(nil))
    try store.prepareInstallation("valid-install")
    XCTAssertEqual(try store.key(relay: relay), "old-key")
  }
}
