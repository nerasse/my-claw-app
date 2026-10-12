import Foundation
import XCTest
@testable import MyClawNativeCore

@MainActor final class PushRegistrationTests: XCTestCase {
  private final class Store: PushEnrollmentStore {
    var value: PushEnrollment?
    func load() throws -> PushEnrollment? { value }
    func save(_ enrollment: PushEnrollment?) throws { value = enrollment }
  }
  private final class Permission: PushPermissionPort {
    var value: PushPermission = .granted
    var requested = false
    func authorization(request: Bool) async throws -> PushPermission { requested = request; return value }
  }
  private final class Relay: PushRegistrationPort {
    var counter = 0
    var revoked: [String] = []
    var rotations: [String] = []
    var pending: CheckedContinuation<Void, Never>?
    var revokedRegistration = false
    var revocationFailure = false
    var suspend = false
    var started: (() -> Void)?
    func register(relay: URL, identity: DeviceIdentity, token: String) async throws -> PushEnrollment {
      if suspend { await withCheckedContinuation { pending = $0; started?() } }
      counter += 1
      return PushEnrollment(relay: relay, origin: identity.origin, deviceId: identity.deviceId,
        registrationId: "registration-\(counter)", secret: "secret", token: token)
    }
    func rotate(_ enrollment: PushEnrollment, token: String) async throws {
      if revokedRegistration { revokedRegistration = false; throw PushRegistrationFailure.revoked }
      rotations.append(token)
    }
    func revoke(_ enrollment: PushEnrollment) async throws {
      revoked.append(enrollment.registrationId)
      if revocationFailure { throw URLError(.cannotConnectToHost) }
    }
  }
  private func identity(_ host: String, device: String = "device") -> DeviceIdentity {
    DeviceIdentity(deviceId: device, token: "credential", origin: "https://\(host).example")
  }
  func testOnlyAnExplicitActionRequestsPermissionAndFailuresDoNotAlterTheIdentity() async throws {
    let store = Store(); let permission = Permission(); let relay = Relay(); permission.value = .notDetermined
    let service = PushRegistrationService(store: store, permission: permission, relay: relay)
    try service.select(identity("one"), relay: URL(string: "https://relay.example")!)
    await service.refresh(token: "token")
    XCTAssertFalse(permission.requested); XCTAssertNil(store.value)
    await service.refresh(token: "token", requestPermission: true)
    XCTAssertTrue(permission.requested); XCTAssertEqual(service.state.status, .permissionRequired)
  }
  func testRotationKeepsTheAssociationButRePairingRevokesAndReplacesIt() async throws {
    let store = Store(); let relay = Relay()
    let service = PushRegistrationService(store: store, permission: Permission(), relay: relay)
    let url = URL(string: "https://relay.example")!
    try service.select(identity("one"), relay: url); await service.refresh(token: "one")
    let first = try XCTUnwrap(store.value)
    await service.refresh(token: "two")
    XCTAssertEqual(store.value?.registrationId, first.registrationId); XCTAssertEqual(relay.rotations, ["two"])
    try service.select(identity("one", device: "new-device"), relay: url)
    XCTAssertFalse(service.accepts(PushOpen(origin: first.origin, registrationId: first.registrationId, target: .thread("t"))))
    await service.refresh(token: "two")
    XCTAssertEqual(relay.revoked, [first.registrationId]); XCTAssertNotEqual(store.value?.registrationId, first.registrationId)
  }
  func testAnOldEnrollmentCannotBecomeCurrentAfterAnInstanceChangeDuringTheRequest() async throws {
    let store = Store(); let relay = Relay(); relay.suspend = true
    let service = PushRegistrationService(store: store, permission: Permission(), relay: relay)
    let url = URL(string: "https://relay.example")!
    try service.select(identity("one"), relay: url)
    let stream = AsyncStream<Void> { continuation in relay.started = { continuation.yield(()); continuation.finish() } }
    var iterator = stream.makeAsyncIterator()
    let work = Task { await service.refresh(token: "token") }
    _ = await iterator.next()
    try service.select(identity("two"), relay: url)
    relay.suspend = false; relay.pending?.resume()
    await work.value
    XCTAssertNil(store.value); XCTAssertEqual(relay.revoked, ["registration-1"])
    await service.refresh(token: "token")
    XCTAssertEqual(store.value?.origin, "https://two.example")
    XCTAssertFalse(service.accepts(PushOpen(origin: "https://one.example", registrationId: "registration-1", target: .thread("t"))))
  }
  func testARevokedRegistrationIsRecreatedEvenWhenTheAPNsTokenHasNotChanged() async throws {
    let store = Store(); let relay = Relay(); let permission = Permission()
    let original = PushRegistrationService(store: store, permission: permission, relay: relay)
    let url = URL(string: "https://relay.example")!
    try original.select(identity("one"), relay: url); await original.refresh(token: "unchanged-token")
    let first = try XCTUnwrap(store.value)
    let relaunched = PushRegistrationService(store: store, permission: permission, relay: relay)
    try relaunched.select(identity("one"), relay: url); relay.revokedRegistration = true
    await relaunched.refresh(token: "unchanged-token")
    XCTAssertEqual(relaunched.state.status, .registered)
    XCTAssertNotEqual(store.value?.registrationId, first.registrationId)
    XCTAssertEqual(store.value?.token, "unchanged-token")
  }
  func testAResumeRevalidatesTheSameTokenInTheExistingService() async throws {
    let store = Store(); let relay = Relay()
    let service = PushRegistrationService(store: store, permission: Permission(), relay: relay)
    try service.select(identity("one"), relay: URL(string: "https://relay.example")!)
    await service.refresh(token: "same-token")
    let first = try XCTUnwrap(store.value)
    relay.revokedRegistration = true
    await service.refresh(token: "same-token")
    XCTAssertEqual(service.state.status, .registered)
    XCTAssertNotEqual(store.value?.registrationId, first.registrationId)
    XCTAssertFalse(service.accepts(PushOpen(origin: first.origin, registrationId: first.registrationId, target: .thread("t"))))
  }


  func testUnavailablePreviousRelayDoesNotBlockNewEnrollmentOrPermitItsPushes() async throws {
    let store = Store(); let relay = Relay()
    let service = PushRegistrationService(store: store, permission: Permission(), relay: relay)
    try service.select(identity("old"), relay: URL(string: "https://old-relay.example")!)
    await service.refresh(token: "old-token")
    let old = try XCTUnwrap(store.value)
    let currentRelay = URL(string: "https://current-relay.example")!
    try service.select(identity("current"), relay: currentRelay)
    XCTAssertFalse(service.accepts(PushOpen(origin: old.origin, registrationId: old.registrationId, target: .thread("old-thread"))))
    relay.revocationFailure = true
    await service.refresh(token: "production-token")
    XCTAssertEqual(service.state.status, .registered)
    let current = try XCTUnwrap(store.value)
    XCTAssertEqual(current.relay, currentRelay)
    XCTAssertEqual(current.origin, "https://current.example")
    XCTAssertEqual(current.token, "production-token")
    XCTAssertEqual(relay.revoked, [old.registrationId])
    XCTAssertNotEqual(current.registrationId, old.registrationId)
    XCTAssertFalse(service.accepts(PushOpen(origin: old.origin, registrationId: old.registrationId, target: .thread("old-thread"))))
    XCTAssertTrue(service.accepts(PushOpen(origin: current.origin, registrationId: current.registrationId, target: .thread("current-thread"))))
  }

}
