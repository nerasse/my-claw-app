import Foundation

@MainActor public protocol AppAttestPort {
  var supported: Bool { get }
  func generateKey() async throws -> String
  func attest(key: String, hash: Data) async throws -> Data
  func assertion(key: String, hash: Data) async throws -> Data
}

public enum PushRegistrationFailure: Error { case revoked, unavailable }

public enum PushPermission: String, Sendable { case granted, denied, notDetermined, unavailable }
public enum PushStatus: String, Sendable { case notConfigured, permissionRequired, blocked, waitingForToken, registering, registered, unavailable, failed }
public struct PushState: Sendable {
  public let permission: PushPermission
  public let status: PushStatus
  public let reason: String?
  public init(permission: PushPermission = .unavailable, status: PushStatus = .notConfigured, reason: String? = nil) {
    self.permission = permission; self.status = status; self.reason = reason
  }
}
public struct PushEnrollment: Codable, Equatable, Sendable {
  public let relay: URL
  public let origin: String
  public let deviceId: String
  public let registrationId: String
  public let secret: String
  public var token: String
  public init(relay: URL, origin: String, deviceId: String, registrationId: String, secret: String, token: String) {
    self.relay = relay; self.origin = origin; self.deviceId = deviceId; self.registrationId = registrationId; self.secret = secret; self.token = token
  }
}
public enum PushTarget: Equatable, Sendable { case thread(String), job(String) }
public struct PushOpen: Equatable, Sendable {
  public let origin: String
  public let registrationId: String
  public let target: PushTarget
  public init(origin: String, registrationId: String, target: PushTarget) { self.origin = origin; self.registrationId = registrationId; self.target = target }
  public var link: String {
    switch target { case .thread(let id): "myclaw://thread/" + id; case .job(let id): "myclaw://job/" + id }
  }
}
@MainActor public protocol PushPermissionPort { func authorization(request: Bool) async throws -> PushPermission }
@MainActor public protocol PushEnrollmentStore {
  func load() throws -> PushEnrollment?
  func save(_ enrollment: PushEnrollment?) throws
}
@MainActor public protocol PushRegistrationPort {
  func register(relay: URL, identity: DeviceIdentity, token: String) async throws -> PushEnrollment
  func rotate(_ enrollment: PushEnrollment, token: String) async throws
  func revoke(_ enrollment: PushEnrollment) async throws
}

@MainActor public final class PushRegistrationService {
  private let store: any PushEnrollmentStore
  private let permission: any PushPermissionPort
  private let relay: any PushRegistrationPort
  private let emit: (PushState) -> Void
  private var identity: DeviceIdentity?
  private var relayAddress: URL?
  private var generation = UUID()
  private var work: Task<Void, Never>?
  private var workId: UUID?
  public private(set) var enrollment: PushEnrollment?
  public private(set) var state = PushState()
  public init(store: any PushEnrollmentStore, permission: any PushPermissionPort, relay: any PushRegistrationPort,
    emit: @escaping (PushState) -> Void = { _ in }) { self.store = store; self.permission = permission; self.relay = relay; self.emit = emit }
  public func select(_ identity: DeviceIdentity?, relay: URL?) throws {
    if self.identity == identity && relayAddress == relay { return }
    generation = UUID(); self.identity = identity; relayAddress = relay
    let saved = try store.load()
    enrollment = saved.flatMap { matches($0) ? $0 : nil }
    update(PushState(status: relay == nil || identity == nil ? .notConfigured : .waitingForToken))
  }
  public func refresh(token: String?, requestPermission: Bool = false) async {
    let previous = work; let id = UUID(); workId = id
    let next = Task { @MainActor [self] in
      await previous?.value
      await perform(token: token, requestPermission: requestPermission)
    }
    work = next; await next.value
    if workId == id { work = nil; workId = nil }
  }
  public func accepts(_ open: PushOpen) -> Bool {
    guard let enrollment, matches(enrollment) else { return false }
    return open.origin == enrollment.origin && open.registrationId == enrollment.registrationId
  }
  public func deactivate() { generation = UUID(); identity = nil; enrollment = nil; update(PushState()) }
  public func revoke() async throws {
    let saved = try store.load(); let previous = work
    deactivate(); await previous?.value
    if let saved {
      try await relay.revoke(saved)
      if try store.load()?.registrationId == saved.registrationId { try store.save(nil) }
    }
  }
  private func matches(_ value: PushEnrollment) -> Bool {
    value.origin == identity?.origin && value.deviceId == identity?.deviceId && value.relay == relayAddress
  }
  private func update(_ value: PushState) { state = value; emit(value) }
  private func perform(token: String?, requestPermission: Bool) async {
    guard let identity, let address = relayAddress else { update(PushState()); return }
    let generation = self.generation
    var authorization = PushPermission.unavailable
    do {
      authorization = try await permission.authorization(request: requestPermission)
      guard generation == self.generation else { return }
      guard authorization == .granted else {
        update(PushState(permission: authorization, status: authorization == .denied ? .blocked : .permissionRequired)); return
      }
      guard let token else { update(PushState(permission: authorization, status: .waitingForToken)); return }
      update(PushState(permission: authorization, status: .registering))
      var saved = try store.load()
      if var current = saved, matches(current) {
        do {
          try await relay.rotate(current, token: token); current.token = token
          guard generation == self.generation else { return }
          try store.save(current); enrollment = current
        } catch PushRegistrationFailure.revoked {
          guard generation == self.generation else { return }
          try store.save(nil); enrollment = nil; saved = nil
        }
      } else if let old = saved {
        // select() already rejects this association. An offline previous relay or
        // a different Apple environment must not prevent the new enrollment.
        try? await relay.revoke(old)
        guard generation == self.generation else { return }
        try store.save(nil); saved = nil
      }
      if saved == nil {
        let created = try await relay.register(relay: address, identity: identity, token: token)
        guard generation == self.generation else { try await relay.revoke(created); return }
        try store.save(created); enrollment = created
      }
      update(PushState(permission: authorization, status: .registered))
    } catch PushRegistrationFailure.unavailable {
      if generation == self.generation { update(PushState(permission: authorization, status: .unavailable, reason: "App Attest is unavailable on this device. Chat and media remain usable.")) }
    } catch {
      if generation == self.generation { update(PushState(permission: authorization, status: .failed, reason: "Notification registration could not be completed. Retry when connected.")) }
    }
  }
}
