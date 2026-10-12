import Foundation
import XCTest
@testable import MyClawNativeCore

final class MemoryOutboxStore: OutboxStore {
  var snapshots: [String: [PendingFrame]] = [:]
  var failWrites = false
  func load(origin: String) throws -> [PendingFrame] { snapshots[origin] ?? [] }
  func save(_ frames: [PendingFrame], origin: String) throws {
    if failWrites { throw CocoaError(.fileWriteNoPermission) }
    snapshots[origin] = frames
  }
}

final class OutboxTests: XCTestCase {
  func testAcceptedFramesSurviveTerminationBeforePong() throws {
    let storage = MemoryOutboxStore()
    let queue = try DurableOutbox(origin: "https://one.example", store: storage)
    XCTAssertTrue(try queue.enqueue("first"))
    XCTAssertTrue(try queue.enqueue("second"))
    let first = try XCTUnwrap(queue.nextToSend)
    queue.markSent(first.id)
    XCTAssertEqual(queue.nextToSend?.text, "second")
    let restored = try DurableOutbox(origin: "https://one.example", store: storage)
    XCTAssertEqual(restored.pendingCount, 2)
    XCTAssertEqual(restored.nextToSend?.text, "first")
  }

  func testPongSettlesOnlyFramesCoveredByItsPing() throws {
    let queue = try DurableOutbox(origin: "https://one.example", store: MemoryOutboxStore())
    XCTAssertTrue(try queue.enqueue("first"))
    let first = try XCTUnwrap(queue.nextToSend)
    queue.markSent(first.id)
    XCTAssertTrue(try queue.enqueue("second"))
    queue.markSent(try XCTUnwrap(queue.nextToSend).id)
    try queue.acknowledge(through: first.id)
    XCTAssertEqual(queue.pendingCount, 1)
    queue.resetForRetry()
    XCTAssertEqual(queue.nextToSend?.text, "second")
  }

  func testAFullQueueRefusesTheFrameRatherThanDroppingAnOlderOne() throws {
    let storage = MemoryOutboxStore()
    let queue = try DurableOutbox(origin: "https://one.example", store: storage)
    for index in 0..<200 { XCTAssertTrue(try queue.enqueue("frame-\(index)")) }
    queue.markSent(try XCTUnwrap(queue.nextToSend).id)
    XCTAssertFalse(try queue.enqueue("overflow"))
    XCTAssertEqual(queue.pendingCount, 200)
    let restored = try DurableOutbox(origin: "https://one.example", store: storage)
    XCTAssertEqual(restored.nextToSend?.text, "frame-0")
  }

  func testNoFrameIsAcceptedWhenPersistenceFails() throws {
    let storage = MemoryOutboxStore()
    let queue = try DurableOutbox(origin: "https://one.example", store: storage)
    storage.failWrites = true
    XCTAssertThrowsError(try queue.enqueue("never durable"))
    XCTAssertEqual(queue.pendingCount, 0)
  }

  func testFramesNeverMoveToAnotherInstance() throws {
    let storage = MemoryOutboxStore()
    let one = try DurableOutbox(origin: "https://one.example", store: storage)
    XCTAssertTrue(try one.enqueue("private to one"))
    let two = try DurableOutbox(origin: "https://two.example", store: storage)
    XCTAssertEqual(two.pendingCount, 0)
    XCTAssertEqual(try DurableOutbox(origin: "https://one.example", store: storage).pendingCount, 1)
  }

  func testFailedAcknowledgementKeepsTheFrameDurable() throws {
    let storage = MemoryOutboxStore()
    let queue = try DurableOutbox(origin: "https://one.example", store: storage)
    XCTAssertTrue(try queue.enqueue("first"))
    let frame = try XCTUnwrap(queue.nextToSend)
    queue.markSent(frame.id)
    storage.failWrites = true
    XCTAssertThrowsError(try queue.acknowledge(through: frame.id))
    XCTAssertEqual(queue.pendingCount, 1)
  }
}
