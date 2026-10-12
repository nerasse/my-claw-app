import Foundation

public struct NativeFile: Equatable, Sendable {
  public let uri: URL
  public let name: String
  public let size: Int64
  public init(uri: URL, name: String, size: Int64) { self.uri = uri; self.name = name; self.size = size }
}

public struct TransferProgress: Equatable, Sendable {
  public let id: String
  public let bytes: Int64
  public let total: Int64
  public init(id: String, bytes: Int64, total: Int64) { self.id = id; self.bytes = bytes; self.total = total }
}

public struct UploadResponse: Sendable {
  public let status: Int
  public let body: String
  public init(status: Int, body: String) { self.status = status; self.body = body }
}

public protocol FileAccess: Sendable {
  func prepare(_ uri: URL) async throws -> NativeFile
  func inspect(_ uri: URL) async throws -> NativeFile
  func adoptDownloaded(_ uri: URL, name: String) async throws -> NativeFile
}

public protocol MediaTransport: Sendable {
  func upload(file: NativeFile, request: URLRequest, type: String, threadId: String, transferId: String,
    progress: @escaping @Sendable (TransferProgress) -> Void) async throws -> UploadResponse
  func download(request: URLRequest, transferId: String,
    progress: @escaping @Sendable (TransferProgress) -> Void) async throws -> URL
  func discardDownload(_ uri: URL)
}

public enum MediaAuthorization {
  public static func authorize(_ raw: String, identity: DeviceIdentity, ticket: String? = nil, allowInsecure: Bool = false) throws -> URLRequest {
    let address = try ServerAddress(raw, allowInsecure: allowInsecure)
    guard address.origin == identity.origin, let url = URL(string: raw),
      ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
      !identity.deviceId.isEmpty, !identity.token.isEmpty else {
      throw NativeFailure.instanceMismatch
    }
    let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    guard !query.contains(where: { ["device", "token"].contains($0.name) }) else { throw NativeFailure.instanceMismatch }
    let tickets = query.filter { $0.name == "ticket" }.map(\.value)
    guard tickets.isEmpty || (ticket != nil && tickets == [ticket]) else { throw NativeFailure.instanceMismatch }
    var request = URLRequest(url: url)
    request.setValue(identity.deviceId, forHTTPHeaderField: "X-My-Claw-Device")
    request.setValue("Bearer " + identity.token, forHTTPHeaderField: "Authorization")
    return request
  }
}
