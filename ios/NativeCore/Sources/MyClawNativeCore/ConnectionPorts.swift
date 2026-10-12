import Foundation

public protocol IdentityStore {
  func load(origin: String) throws -> DeviceIdentity?
  func save(_ identity: DeviceIdentity) throws
}

public enum SocketEvent: Equatable, Sendable {
  case opened
  case message(String)
  case closed(reason: String, unauthorized: Bool)
}

@MainActor public protocol SocketTransport: AnyObject {
  func send(_ text: String) async throws
  func close()
}

@MainActor public protocol SocketFactory {
  func open(url: URL, identity: DeviceIdentity, receive: @escaping @MainActor (SocketEvent) -> Void) -> any SocketTransport
}

@MainActor public protocol ScheduledAction {
  func cancel()
}

@MainActor public protocol ConnectionScheduler {
  func schedule(after seconds: TimeInterval, action: @escaping @MainActor () -> Void) -> any ScheduledAction
}

public struct ConnectionStatus: Equatable, Sendable {
  public let state: String
  public let pending: Int
  public let reason: String?
  public let attempts: Int
  public init(state: String, pending: Int = 0, reason: String? = nil, attempts: Int = 0) {
    self.state = state
    self.pending = pending
    self.reason = reason
    self.attempts = attempts
  }
}

public enum ConnectionEvent: Equatable, Sendable {
  case state(ConnectionStatus)
  case message(String)
  case outbox(Int)
  case diagnostic(String)
}
