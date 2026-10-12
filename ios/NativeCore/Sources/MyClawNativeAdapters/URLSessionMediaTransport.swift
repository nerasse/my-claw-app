import Foundation
import MyClawNativeCore

public final class URLSessionMediaTransport: MediaTransport, Sendable {
  public init() {}
  public func upload(file: NativeFile, request authorized: URLRequest, type: String, threadId: String, transferId: String,
    progress: @escaping @Sendable (TransferProgress) -> Void) async throws -> UploadResponse {
    var request = authorized
    request.httpMethod = "POST"
    request.setValue("application/octet-stream", forHTTPHeaderField: "content-type")
    let alphabet = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
    request.setValue(file.name.addingPercentEncoding(withAllowedCharacters: alphabet), forHTTPHeaderField: "x-filename")
    request.setValue(type, forHTTPHeaderField: "x-type")
    request.setValue(threadId, forHTTPHeaderField: "x-thread-id")
    let session = makeSession()
    defer { session.invalidateAndCancel() }
    let (data, response) = try await session.upload(for: request, fromFile: file.uri,
      delegate: MediaTaskDelegate(id: transferId, progress: progress))
    guard let response = response as? HTTPURLResponse, data.count <= 1024 * 1024,
      let body = String(data: data, encoding: .utf8) else { throw URLError(.badServerResponse) }
    progress(TransferProgress(id: transferId, bytes: file.size, total: file.size))
    return UploadResponse(status: response.statusCode, body: body)
  }
  public func download(request: URLRequest, transferId: String,
    progress: @escaping @Sendable (TransferProgress) -> Void) async throws -> URL {
    let session = makeSession()
    defer { session.invalidateAndCancel() }
    let (temporary, response) = try await session.download(for: request,
      delegate: MediaTaskDelegate(id: transferId, progress: progress))
    guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
      throw URLError(.badServerResponse)
    }
    let destination = FileManager.default.temporaryDirectory.appendingPathComponent("myclaw-transfer-" + UUID().uuidString)
    try FileManager.default.moveItem(at: temporary, to: destination)
    let size = try destination.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    progress(TransferProgress(id: transferId, bytes: Int64(size), total: Int64(size)))
    return destination
  }

  private func makeSession() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.httpShouldSetCookies = false
    config.urlCache = nil
    config.timeoutIntervalForRequest = 60
    config.timeoutIntervalForResource = 600
    return URLSession(configuration: config)
  }

  public func discardDownload(_ uri: URL) {
    guard uri.isFileURL, uri.lastPathComponent.hasPrefix("myclaw-transfer-"),
      uri.deletingLastPathComponent().standardizedFileURL == FileManager.default.temporaryDirectory.standardizedFileURL else { return }
    try? FileManager.default.removeItem(at: uri)
  }
}

private final class MediaTaskDelegate: NSObject, URLSessionTaskDelegate, URLSessionDownloadDelegate, Sendable {
  private let id: String
  private let progress: @Sendable (TransferProgress) -> Void
  init(id: String, progress: @escaping @Sendable (TransferProgress) -> Void) { self.id = id; self.progress = progress }

  func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
    totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
    progress(TransferProgress(id: id, bytes: totalBytesSent, total: max(0, totalBytesExpectedToSend)))
  }
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
    progress(TransferProgress(id: id, bytes: totalBytesWritten, total: max(0, totalBytesExpectedToWrite)))
  }
  func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
    completionHandler(nil)
  }
}
