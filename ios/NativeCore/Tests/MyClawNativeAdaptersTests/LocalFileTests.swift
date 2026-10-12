import Foundation
import XCTest
@testable import MyClawNativeAdapters

final class LocalFileTests: XCTestCase {
  func testPreparedDocumentRemainsReadableAfterTheSourceIsRemoved() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let source = root.appendingPathComponent("chosen.txt")
    try Data("fixture".utf8).write(to: source)
    let files = LocalFileStore(directory: root.appendingPathComponent("cache"), allowedRoot: root)
    let prepared = try await files.prepare(source)
    try FileManager.default.removeItem(at: source)
    XCTAssertEqual(prepared.name, "chosen.txt")
    XCTAssertEqual(prepared.size, 7)
    XCTAssertEqual(try Data(contentsOf: prepared.uri), Data("fixture".utf8))
  }

  func testSymlinkCannotReadAFileOutsideTheAllowedSandbox() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let allowed = root.appendingPathComponent("allowed")
    try FileManager.default.createDirectory(at: allowed, withIntermediateDirectories: true)
    let outside = root.appendingPathComponent("outside.txt")
    try Data("outside".utf8).write(to: outside)
    let link = allowed.appendingPathComponent("link.txt")
    try FileManager.default.createSymbolicLink(at: link, withDestinationURL: outside)
    let files = LocalFileStore(directory: allowed.appendingPathComponent("cache"), allowedRoot: allowed)
    do { _ = try await files.prepare(link); XCTFail("escaped sandbox") } catch {}
  }
}
