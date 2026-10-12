import Foundation
import XCTest
@testable import MyClawNativeCore

final class MemoryIdentityStore: IdentityStore {
  var entries: [String: DeviceIdentity] = [:]
  func load(origin: String) throws -> DeviceIdentity? { entries[origin] }
  func save(_ identity: DeviceIdentity) throws { entries[identity.origin] = identity }
}

@MainActor final class ManualAction: ScheduledAction {
  let seconds: TimeInterval
  let action: @MainActor () -> Void
  var cancelled = false
  init(seconds: TimeInterval, action: @escaping @MainActor () -> Void) {
    self.seconds = seconds; self.action = action
  }
  func cancel() { cancelled = true }
  func fire() { if !cancelled { cancelled = true; action() } }
}

@MainActor final class ManualScheduler: ConnectionScheduler {
  var actions: [ManualAction] = []
  func schedule(after seconds: TimeInterval, action: @escaping @MainActor () -> Void) -> any ScheduledAction {
    let task = ManualAction(seconds: seconds, action: action)
    actions.append(task)
    return task
  }
  var next: ManualAction? { actions.first { !$0.cancelled } }
}

@MainActor final class ControlledSocket: SocketTransport {
  let receive: @MainActor (SocketEvent) -> Void
  var sent: [String] = []
  var closed = false
  var onSend: ((String) -> Void)?
  init(receive: @escaping @MainActor (SocketEvent) -> Void) { self.receive = receive }
  func send(_ text: String) async throws { sent.append(text); onSend?(text) }
  func close() { closed = true }
}

@MainActor final class ControlledSockets: SocketFactory {
  var sockets: [ControlledSocket] = []
  var urls: [URL] = []
  func open(url: URL, identity: DeviceIdentity, receive: @escaping @MainActor (SocketEvent) -> Void) -> any SocketTransport {
    let socket = ControlledSocket(receive: receive)
    sockets.append(socket); urls.append(url)
    return socket
  }
}

@MainActor final class ConnectionCoordinatorTests: XCTestCase {
  func make(
    identities: MemoryIdentityStore = MemoryIdentityStore(),
    store: MemoryOutboxStore = MemoryOutboxStore(),
    sockets: ControlledSockets,
    scheduler: ManualScheduler,
    emit: @escaping @MainActor (ConnectionEvent) -> Void = { _ in }
  ) -> ConnectionCoordinator {
    identities.entries["https://one.example"] = DeviceIdentity(deviceId: "one", token: "token", origin: "https://one.example")
    return ConnectionCoordinator(identities: identities, outboxes: store, sockets: sockets, scheduler: scheduler, emit: emit)
  }

  func testCallbacksFromReplacedSocketsCannotOverwriteTheCurrentConnection() async throws {
    let sockets = ControlledSockets(), clock = ManualScheduler()
    var messages: [String] = []
    let core = make(sockets: sockets, scheduler: clock) { if case .message(let text) = $0 { messages.append(text) } }
    try core.connect("https://one.example")
    let old = try XCTUnwrap(sockets.sockets.first)
    try core.connect("https://one.example")
    let current = try XCTUnwrap(sockets.sockets.last)
    current.receive(.opened)
    old.receive(.message("stale"))
    old.receive(.closed(reason: "old failure", unauthorized: false))
    XCTAssertEqual(core.status.state, "connected")
    XCTAssertTrue(messages.isEmpty)
    XCTAssertTrue(old.closed)
    XCTAssertFalse(current.closed)
  }

  func testUnpairedInstancesNeverOpenAnAuthenticatedSocket() async throws {
    let sockets = ControlledSockets(), clock = ManualScheduler()
    let core = make(sockets: sockets, scheduler: clock)
    try core.connect("https://two.example")
    XCTAssertTrue(sockets.sockets.isEmpty)
    XCTAssertEqual(core.status.reason, "unauthorized")
    XCTAssertFalse(try core.send("cannot choose an identity"))
  }

  func testARevokedIdentityStopsAutomaticRetries() async throws {
    let sockets = ControlledSockets(), clock = ManualScheduler()
    let core = make(sockets: sockets, scheduler: clock)
    try core.connect("https://one.example")
    try XCTUnwrap(sockets.sockets.last).receive(.closed(reason: "unauthorized", unauthorized: true))
    XCTAssertEqual(core.status.reason, "unauthorized")
    XCTAssertNil(clock.next)
  }

  func testReconnectDelayNeverExceedsThirtySeconds() async throws {
    let sockets = ControlledSockets(), clock = ManualScheduler()
    let core = make(sockets: sockets, scheduler: clock)
    try core.connect("https://one.example")
    var delays: [TimeInterval] = []
    for _ in 0..<8 {
      try XCTUnwrap(sockets.sockets.last).receive(.closed(reason: "network unavailable", unauthorized: false))
      let retry = try XCTUnwrap(clock.next)
      delays.append(retry.seconds)
      retry.fire()
    }
    XCTAssertEqual(delays, [1, 2, 4, 8, 16, 30, 30, 30])
  }

  func testBackgroundClosesTheSocketAndResumeReconnectsWithTheDurableQueue() async throws {
    let storage = MemoryOutboxStore(), sockets = ControlledSockets(), clock = ManualScheduler()
    let core = make(store: storage, sockets: sockets, scheduler: clock)
    try core.connect("https://one.example")
    let first = try XCTUnwrap(sockets.sockets.last)
    XCTAssertTrue(try core.send("first"))
    core.suspend()
    XCTAssertTrue(first.closed)
    XCTAssertNil(clock.next)
    try core.resume()
    let resumed = try XCTUnwrap(sockets.sockets.last)
    let sent = expectation(description: "durable frame sent after resume")
    resumed.onSend = { if $0 == "first" { sent.fulfill() } }
    resumed.receive(.opened)
    await fulfillment(of: [sent], timeout: 2)
    XCTAssertEqual(core.pendingCount, 1)
    XCTAssertEqual(sockets.sockets.count, 2)
  }

  func testPongAcknowledgesOnlyThePrefixThatPrecededThePing() async throws {
    let sockets = ControlledSockets(), clock = ManualScheduler()
    let core = make(sockets: sockets, scheduler: clock)
    try core.connect("https://one.example")
    let socket = try XCTUnwrap(sockets.sockets.last)
    socket.receive(.opened)
    let first = expectation(description: "first frame handed to socket")
    let ping = expectation(description: "application acknowledgement requested")
    socket.onSend = {
      if $0 == "first" { first.fulfill() }
      if $0 == "{\"type\":\"ping\"}" { ping.fulfill() }
    }
    XCTAssertTrue(try core.send("first"))
    await fulfillment(of: [first, ping], timeout: 2)
    let second = expectation(description: "later frame handed to socket")
    socket.onSend = { if $0 == "second" { second.fulfill() } }
    XCTAssertTrue(try core.send("second"))
    await fulfillment(of: [second], timeout: 2)
    socket.receive(.message("{\"type\":\"pong\"}"))
    XCTAssertEqual(core.pendingCount, 1)
  }

  func testRestoredFullQueueRequestsAcknowledgementWithoutWaitingForHeartbeat() async throws {
    let storage = MemoryOutboxStore(), sockets = ControlledSockets(), clock = ManualScheduler()
    storage.snapshots["https://one.example"] = (0..<200).map { PendingFrame(text: "frame-\($0)") }
    let core = make(store: storage, sockets: sockets, scheduler: clock)
    try core.connect("https://one.example")
    let socket = try XCTUnwrap(sockets.sockets.last)
    let acknowledgement = expectation(description: "flushed frames request a transport acknowledgement immediately")
    socket.onSend = { if $0 == "{\"type\":\"ping\"}" { acknowledgement.fulfill() } }
    socket.receive(.opened)
    await fulfillment(of: [acknowledgement], timeout: 1)
    socket.receive(.message("{\"type\":\"pong\"}"))
    XCTAssertEqual(core.pendingCount, 0)
    socket.onSend = nil
    XCTAssertTrue(try core.send("new message"), "A delivered restored queue must leave room for a new send")
    core.disconnect()
  }

  func testImmediatePingReplacesTheOldHeartbeatDeadline() async throws {
    let sockets = ControlledSockets(), clock = ManualScheduler()
    let core = make(sockets: sockets, scheduler: clock)
    defer { core.disconnect() }
    try core.connect("https://one.example")
    let socket = try XCTUnwrap(sockets.sockets.last)
    socket.receive(.opened)
    let oldDeadline = try XCTUnwrap(clock.next)
    let ping = expectation(description: "immediate acknowledgement requested")
    socket.onSend = { if $0 == "{\"type\":\"ping\"}" { ping.fulfill() } }
    XCTAssertTrue(try core.send("late batch"))
    await fulfillment(of: [ping], timeout: 1)
    socket.onSend = nil
    XCTAssertTrue(oldDeadline.cancelled, "An immediate ping must get its own full response interval")
    XCTAssertFalse(clock.next === oldDeadline)
    oldDeadline.fire()
    await Task.yield()
    XCTAssertEqual(core.status.state, "connected")
    socket.receive(.message("{\"type\":\"pong\"}"))
    XCTAssertEqual(core.pendingCount, 0)
  }
}
