import Foundation
import XCTest
import MyClawNativeCore
@testable import MyClawNativeAdapters

@MainActor final class SocketProbeTests: XCTestCase {
  private func probeURL(_ path: String) throws -> URL {
    guard let value = ProcessInfo.processInfo.environment["MYCLAW_IOS_WS_PROBE_URL"],
      let url = URL(string: value), ["127.0.0.1", "localhost"].contains(url.host ?? "") else {
      throw XCTSkip("Local websocket probe is gated by MYCLAW_IOS_WS_PROBE_URL")
    }
    return url.appendingPathComponent(path)
  }

  func testURLSessionDeliversFramesOverTheActualWebSocket() async throws {
    let url = try probeURL("probe")
    let opened = expectation(description: "socket open or refused")
    let message = expectation(description: "probe reply")
    var connected = false
    var received: String?
    let socket = URLSessionSocketFactory().open(url: url, identity: DeviceIdentity(deviceId: "fixture", token: "fixture-token", origin: "http://127.0.0.1")) { event in
      switch event {
      case .opened: connected = true; opened.fulfill()
      case .message(let text): received = text; message.fulfill()
      case .closed: if !connected { opened.fulfill() }
      }
    }
    defer { socket.close() }
    await fulfillment(of: [opened], timeout: 5)
    XCTAssertTrue(connected)
    guard connected else { return }
    try await socket.send("probe")
    await fulfillment(of: [message], timeout: 5)
    XCTAssertEqual(received, "probe reply")
  }

  func testAnHTTPUnauthorizedUpgradeIsReportedAsRevocation() async throws {
    let url = try probeURL("reject")
    let closed = expectation(description: "upgrade refused")
    var unauthorized = false
    let socket = URLSessionSocketFactory().open(url: url, identity: DeviceIdentity(deviceId: "fixture", token: "fixture-token", origin: "http://127.0.0.1")) { event in
      if case .closed(_, let revoked) = event { unauthorized = revoked; closed.fulfill() }
    }
    defer { socket.close() }
    await fulfillment(of: [closed], timeout: 5)
    XCTAssertTrue(unauthorized)
  }
}
