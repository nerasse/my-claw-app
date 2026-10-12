import Foundation

@MainActor public final class ConnectionCoordinator {
  public private(set) var status = ConnectionStatus(state: "idle")
  public var pendingCount: Int { outbox?.pendingCount ?? 0 }
  private let identities: any IdentityStore
  private let outboxes: any OutboxStore
  private let sockets: any SocketFactory
  private let scheduler: any ConnectionScheduler
  private let allowInsecure: Bool
  private let emit: @MainActor (ConnectionEvent) -> Void
  private var target: ServerAddress?
  private var outbox: DurableOutbox?
  private var socket: (any SocketTransport)?
  private var scheduled: (any ScheduledAction)?
  private var generation: UInt64 = 0
  private var attempts = 0
  private var suspended = false
  private var authorized = false
  private var flushingGeneration: UInt64?
  private var pingOutstanding = false
  private var pingWatermark: UUID?
  private var heartbeatID: UUID?

  public init(
    identities: any IdentityStore,
    outboxes: any OutboxStore,
    sockets: any SocketFactory,
    scheduler: any ConnectionScheduler,
    allowInsecure: Bool = false,
    emit: @escaping @MainActor (ConnectionEvent) -> Void
  ) {
    self.identities = identities
    self.outboxes = outboxes
    self.sockets = sockets
    self.scheduler = scheduler
    self.allowInsecure = allowInsecure
    self.emit = emit
  }

  public func connect(_ raw: String) throws {
    let address = try ServerAddress(raw, allowInsecure: allowInsecure)
    closeCurrent()
    target = address
    suspended = false
    attempts = 0
    authorized = false
    outbox = nil
    try openAttempt()
  }

  public func send(_ text: String) throws -> Bool {
    guard authorized, let outbox else { return false }
    guard try outbox.enqueue(text) else { return false }
    reportPending()
    Task { await flush() }
    return true
  }

  public func clearOutbox() throws {
    try outbox?.clear()
    reportPending()
  }

  public func disconnect() {
    target = nil
    closeCurrent()
    outbox?.resetForRetry()
    setState("disconnected", reason: "disconnected")
  }

  public func suspend() {
    guard target != nil else { return }
    suspended = true
    closeCurrent()
    outbox?.resetForRetry()
    setState("disconnected", reason: "background")
  }

  public func resume() throws {
    guard suspended else { return }
    suspended = false
    try openAttempt()
  }

  private func openAttempt() throws {
    guard !suspended, let target else { return }
    guard let identity = try identities.load(origin: target.origin) else {
      authorized = false
      setState("disconnected", reason: "unauthorized")
      return
    }
    let url = try target.socketURL(identity: identity)
    closeCurrent()
    authorized = true
    outbox = try DurableOutbox(origin: target.origin, store: outboxes)
    let token = generation
    setState("connecting")
    socket = sockets.open(url: url, identity: identity) { [weak self] event in self?.receive(event, generation: token) }
    scheduled = scheduler.schedule(after: 15) { [weak self] in
      guard let self, generation == token, status.state == "connecting" else { return }
      lost(reason: "connection timed out", unauthorized: false)
    }
  }

  private func receive(_ event: SocketEvent, generation token: UInt64) {
    guard generation == token, !suspended else { return }
    switch event {
    case .opened:
      scheduled?.cancel()
      attempts = 0
      setState("connected")
      scheduleHeartbeat(generation: token)
      Task { await flush() }
    case .message(let text):
      if isPong(text), pingOutstanding {
        do {
          if let watermark = pingWatermark { try outbox?.acknowledge(through: watermark) }
          pingOutstanding = false
          pingWatermark = nil
          reportPending()
          Task { await flush() }
        } catch {
          emit(.diagnostic("outbox acknowledgement could not be persisted"))
          lost(reason: "storage unavailable", unauthorized: false)
          return
        }
      }
      emit(.message(text))
    case .closed(let reason, let unauthorized):
      lost(reason: reason, unauthorized: unauthorized)
    }
  }

  private func flush() async {
    let token = generation
    guard status.state == "connected", let socket, let outbox,
      flushingGeneration != token else { return }
    flushingGeneration = token
    defer { if flushingGeneration == token { flushingGeneration = nil } }
    while generation == token, status.state == "connected", let frame = outbox.nextToSend {
      do { try await socket.send(frame.text) }
      catch {
        if generation == token { lost(reason: "connection failed", unauthorized: false) }
        return
      }
      guard generation == token else { return }
      outbox.markSent(frame.id)
    }
    // Retire delivered frames before a quick suspension or another burst fills the queue.
    if outbox.lastSentID != nil { Task { await sendPing(generation: token) } }
  }

  private func scheduleHeartbeat(generation token: UInt64) {
    scheduled?.cancel()
    let id = UUID(); heartbeatID = id
    scheduled = scheduler.schedule(after: 15) { [weak self] in
      guard let self, generation == token, status.state == "connected", heartbeatID == id else { return }
      Task { await heartbeat(generation: token, id: id) }
    }
  }

  private func heartbeat(generation token: UInt64, id: UUID) async {
    guard generation == token, status.state == "connected", heartbeatID == id else { return }
    if pingOutstanding {
      lost(reason: "heartbeat timed out", unauthorized: false)
      return
    }
    await sendPing(generation: token)
  }

  private func sendPing(generation token: UInt64) async {
    guard generation == token, status.state == "connected", let socket, !pingOutstanding else { return }
    pingOutstanding = true
    pingWatermark = outbox?.lastSentID
    scheduleHeartbeat(generation: token)
    do { try await socket.send("{\"type\":\"ping\"}") }
    catch {
      if generation == token { lost(reason: "connection failed", unauthorized: false) }
      return
    }
  }

  private func lost(reason: String, unauthorized: Bool) {
    closeCurrent()
    outbox?.resetForRetry()
    if unauthorized { authorized = false }
    setState("disconnected", reason: unauthorized ? "unauthorized" : reason)
    guard !unauthorized, !suspended, target != nil else { return }
    attempts = min(attempts + 1, 30)
    let delay = min(30, pow(2, Double(min(attempts - 1, 5))))
    let token = generation
    scheduled = scheduler.schedule(after: delay) { [weak self] in
      guard let self, generation == token, !suspended, target != nil else { return }
      do { try openAttempt() }
      catch {
        emit(.diagnostic("connection could not restore its persistent state"))
        lost(reason: "storage unavailable", unauthorized: false)
      }
    }
  }

  private func closeCurrent() {
    generation &+= 1
    scheduled?.cancel()
    scheduled = nil
    socket?.close()
    socket = nil
    pingOutstanding = false
    pingWatermark = nil
    heartbeatID = nil
  }

  private func setState(_ state: String, reason: String? = nil) {
    status = ConnectionStatus(state: state, pending: pendingCount, reason: reason, attempts: attempts)
    emit(.state(status))
  }

  private func reportPending() {
    status = ConnectionStatus(state: status.state, pending: pendingCount, reason: status.reason, attempts: status.attempts)
    emit(.outbox(pendingCount))
  }

  private func isPong(_ text: String) -> Bool {
    guard let data = text.data(using: .utf8),
      let frame = try? JSONSerialization.jsonObject(with: data) as? [String: String] else { return false }
    return frame["type"] == "pong"
  }
}
