#if os(iOS)
import Foundation
import CryptoKit
import MyClawNativeCore

private struct RelayFailure: Error { let status: Int }
private final class RelayRedirectGuard: NSObject, URLSessionTaskDelegate, Sendable {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
@MainActor public final class IOSPushRelay: PushRegistrationPort {
  private let storage: PushSecureStorage
  private let attest: any AppAttestPort
  private let session: URLSession
  public init(storage: PushSecureStorage, attest: any AppAttestPort) {
    self.storage = storage; self.attest = attest
    let config = URLSessionConfiguration.ephemeral; config.httpCookieStorage = nil; config.urlCache = nil
    config.timeoutIntervalForRequest = 15; config.timeoutIntervalForResource = 30
    session = URLSession(configuration: config, delegate: RelayRedirectGuard(), delegateQueue: nil)
  }
  private struct Challenge: Decodable { let nonce: String }
  private struct Registration: Decodable { let id: String; let secret: String }
  public func register(relay: URL, identity: DeviceIdentity, token: String) async throws -> PushEnrollment {
    let key = try await key(relay)
    let nonce = try await managementChallenge(relay, key: key)
    let body = try json(["nonce": nonce, "origin": identity.origin, "token": token])
    let response = try await signed(relay, path: "/v1/registrations", key: key, body: body)
    let registration = try JSONDecoder().decode(Registration.self, from: response)
    guard UUID(uuidString: registration.id) != nil, registration.secret.count == 43,
      registration.secret.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw CocoaError(.fileReadCorruptFile) }
    return PushEnrollment(relay: relay, origin: identity.origin, deviceId: identity.deviceId,
      registrationId: registration.id, secret: registration.secret, token: token)
  }
  public func rotate(_ enrollment: PushEnrollment, token: String) async throws {
    let key = try await key(enrollment.relay)
    let nonce = try await managementChallenge(enrollment.relay, key: key)
    _ = try await signed(enrollment.relay, path: "/v1/registrations/\(enrollment.registrationId)/token", key: key,
      body: json(["nonce": nonce, "token": token]))
  }
  public func revoke(_ enrollment: PushEnrollment) async throws {
    let key = try await key(enrollment.relay)
    let nonce = try await managementChallenge(enrollment.relay, key: key)
    _ = try await signed(enrollment.relay, path: "/v1/registrations/\(enrollment.registrationId)/revoke", key: key, body: json(["nonce": nonce]))
  }
  private func key(_ relay: URL) async throws -> String {
    guard attest.supported else { throw PushRegistrationFailure.unavailable }
    if let key = try storage.key(relay: relay) { return key }
    let key = try await attest.generateKey(); try storage.saveKey(key, relay: relay); return key
  }
  private func managementChallenge(_ relay: URL, key: String) async throws -> String {
    do { return try await challenge(relay, purpose: "manage", key: key) }
    catch let error as RelayFailure where error.status == 401 {
      let nonce = try await challenge(relay, purpose: "attest", key: key)
      let value = try await attest.attest(key: key, hash: Data(SHA256.hash(data: Data(nonce.utf8))))
      _ = try await request(relay, path: "/v1/attestations", body: json(["nonce": nonce, "keyId": key, "attestation": value.base64EncodedString()]))
      return try await challenge(relay, purpose: "manage", key: key)
    }
  }
  private func challenge(_ relay: URL, purpose: String, key: String) async throws -> String {
    let response = try await request(relay, path: "/v1/challenges", body: json(["purpose": purpose, "keyId": key]))
    let nonce = try JSONDecoder().decode(Challenge.self, from: response).nonce
    guard nonce.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { throw CocoaError(.fileReadCorruptFile) }
    return nonce
  }
  private func signed(_ relay: URL, path: String, key: String, body: Data) async throws -> Data {
    let payload = Data("POST\n\(path)\n".utf8) + body
    let value = try await attest.assertion(key: key, hash: Data(SHA256.hash(data: payload)))
    return try await request(relay, path: path, body: body,
      headers: ["x-app-attest-key": key, "x-app-attest-assertion": value.base64EncodedString()])
  }
  private func json(_ values: [String: String]) throws -> Data { try JSONSerialization.data(withJSONObject: values, options: [.sortedKeys]) }
  private func request(_ relay: URL, path: String, body: Data, headers: [String: String] = [:]) async throws -> Data {
    guard let parts = URLComponents(url: relay, resolvingAgainstBaseURL: false), parts.scheme == "https",
      parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
      parts.path.isEmpty || parts.path == "/", let url = URL(string: path, relativeTo: relay)?.absoluteURL else { throw NativeFailure.invalidServerAddress }
    var request = URLRequest(url: url); request.httpMethod = "POST"; request.httpBody = body
    request.setValue("application/json", forHTTPHeaderField: "content-type")
    for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
    let (bytes, response) = try await session.bytes(for: request)
    guard let response = response as? HTTPURLResponse else { throw RelayFailure(status: 503) }
    if response.statusCode == 410 { throw PushRegistrationFailure.revoked }
    guard (200..<300).contains(response.statusCode) else { throw RelayFailure(status: response.statusCode) }
    var data = Data()
    for try await byte in bytes { guard data.count < 96 * 1024 else { throw CocoaError(.fileReadTooLarge) }; data.append(byte) }
    return data
  }
}
#endif
