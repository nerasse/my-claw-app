import Foundation

public enum NativeFailure: Error, Equatable {
  case invalidParameter
  case invalidServerAddress
  case insecureServerAddress
  case unpaired
  case instanceMismatch
}

public struct DeviceIdentity: Codable, Equatable, Sendable {
  public let deviceId: String
  public let token: String
  public let origin: String

  public init(deviceId: String, token: String, origin: String) {
    self.deviceId = deviceId
    self.token = token
    self.origin = origin
  }
}

public struct ServerAddress: Equatable, Sendable {
  public let origin: String
  private let baseURL: URL
  public init(_ raw: String, allowInsecure: Bool = false) throws {
    guard var parts = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
      let scheme = parts.scheme?.lowercased(),
      ["http", "https", "ws", "wss"].contains(scheme),
      let host = parts.host, !host.isEmpty,
      parts.user == nil, parts.password == nil,
      parts.port.map({ (1...65535).contains($0) }) ?? true
    else { throw NativeFailure.invalidServerAddress }
    let secure = scheme == "https" || scheme == "wss"
    guard secure || allowInsecure else { throw NativeFailure.insecureServerAddress }
    parts.scheme = secure ? "https" : "http"
    parts.host = host.lowercased()
    if parts.port == (secure ? 443 : 80) { parts.port = nil }
    var scope = parts
    scope.path = ""
    scope.query = nil
    scope.fragment = nil
    guard let scopeURL = scope.url else { throw NativeFailure.invalidServerAddress }
    origin = scopeURL.absoluteString
    parts.scheme = secure ? "wss" : "ws"
    if parts.path.isEmpty || parts.path == "/" { parts.path = "/my-claw-app" }
    parts.fragment = nil
    guard let url = parts.url else { throw NativeFailure.invalidServerAddress }
    baseURL = url
  }
  public func socketURL(identity: DeviceIdentity) throws -> URL {
    guard identity.origin == origin else { throw NativeFailure.instanceMismatch }
    guard !identity.deviceId.isEmpty, !identity.token.isEmpty else { throw NativeFailure.unpaired }
    guard var parts = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
      throw NativeFailure.invalidServerAddress
    }
    parts.queryItems = parts.queryItems?.filter { !["device", "token", "ticket"].contains($0.name) }
    guard let url = parts.url else { throw NativeFailure.invalidServerAddress }
    return url
  }
}
