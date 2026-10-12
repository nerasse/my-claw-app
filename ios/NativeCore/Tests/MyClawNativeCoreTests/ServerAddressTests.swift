import Foundation
import XCTest
@testable import MyClawNativeCore

final class ServerAddressTests: XCTestCase {
  func testDefaultPortsAndSocketSchemesShareOneIdentityScope() throws {
    XCTAssertEqual(try ServerAddress("wss://ONE.example:443/my-claw-app").origin, "https://one.example")
    XCTAssertEqual(try ServerAddress("https://one.example/pair#CODE").origin, "https://one.example")
    XCTAssertEqual(try ServerAddress("ws://localhost:80", allowInsecure: true).origin, "http://localhost")
    XCTAssertEqual(try ServerAddress("http://localhost:8080", allowInsecure: true).origin, "http://localhost:8080")
  }

  func testDistributedConnectionsRejectCleartextAndUserInfo() {
    XCTAssertThrowsError(try ServerAddress("http://one.example"))
    XCTAssertThrowsError(try ServerAddress("https://user:secret@one.example"))
    XCTAssertThrowsError(try ServerAddress("file:///private/file"))
    XCTAssertThrowsError(try ServerAddress("host without scheme"))
    XCTAssertThrowsError(try ServerAddress("https://one.example:70000"))
  }

  func testCredentialsCannotBeUsedForAnotherOrigin() throws {
    let address = try ServerAddress("https://two.example")
    let identity = DeviceIdentity(deviceId: "device-1", token: "secret", origin: "https://one.example")
    XCTAssertThrowsError(try address.socketURL(identity: identity))
  }

  func testSocketURLUsesTheStoredIdentityAndKeepsSecretsOutOfTheOrigin() throws {
    let address = try ServerAddress("https://one.example/my-claw-app?device=old&token=old#fragment")
    let identity = DeviceIdentity(deviceId: "device-1", token: "secret +", origin: "https://one.example")
    let url = try address.socketURL(identity: identity)
    let components = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false))
    XCTAssertEqual(components.scheme, "wss")
    XCTAssertEqual(components.path, "/my-claw-app")
    XCTAssertNil(components.fragment)
    XCTAssertTrue((components.queryItems ?? []).isEmpty)
    XCTAssertFalse(url.absoluteString.contains(identity.token))
    XCTAssertEqual(address.origin, "https://one.example")
  }
}
