import Foundation
import XCTest
import MyClawNativeCore
@testable import MyClawNativeAdapters

final class MediaProbeTests: XCTestCase {
  private func authorized(_ url: URL) throws -> URLRequest {
    let origin = try ServerAddress(url.absoluteString, allowInsecure: true).origin
    return try MediaAuthorization.authorize(url.absoluteString,
      identity: DeviceIdentity(deviceId: "fixture", token: "fixture-token", origin: origin), allowInsecure: true)
  }
  private func probeURL(_ path: String) throws -> URL {
    guard let raw = ProcessInfo.processInfo.environment["MYCLAW_IOS_MEDIA_PROBE_URL"],
      let url = URL(string: raw), url.host == "127.0.0.1" else { throw XCTSkip("Local media probe is gated") }
    return url.appendingPathComponent(path)
  }

  func testUploadStreamsTheLocalFileAndKeepsExistingMetadataHeaders() async throws {
    let url = try probeURL("upload")
    let source = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: source) }
    try Data(repeating: 65, count: 128 * 1024).write(to: source)
    let progress = expectation(description: "upload progress")
    progress.assertForOverFulfill = false
    let response = try await URLSessionMediaTransport().upload(
      file: NativeFile(uri: source, name: "note.txt", size: 128 * 1024), request: try authorized(url), type: "file",
      threadId: "fixture-thread", transferId: "transfer", progress: { value in
        if value.bytes == 128 * 1024, value.id == "transfer" { progress.fulfill() }
      })
    await fulfillment(of: [progress], timeout: 5)
    XCTAssertEqual(response.status, 200)
    let data = try XCTUnwrap(response.body.data(using: .utf8))
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: String])
    XCTAssertEqual(object["filename"], "note.txt")
    XCTAssertEqual(object["thread"], "fixture-thread")
    XCTAssertEqual(object["type"], "file")
    XCTAssertEqual(object["size"], "131072")
  }

  func testDownloadProducesAReadableNativeFileAndReportsProgress() async throws {
    let url = try probeURL("download")
    let progress = expectation(description: "download progress")
    progress.assertForOverFulfill = false
    let file = try await URLSessionMediaTransport().download(request: try authorized(url), transferId: "download", progress: { value in
      if value.bytes > 0, value.id == "download" { progress.fulfill() }
    })
    defer { try? FileManager.default.removeItem(at: file) }
    await fulfillment(of: [progress], timeout: 5)
    XCTAssertEqual(try Data(contentsOf: file), Data("native download fixture".utf8))
  }
}
