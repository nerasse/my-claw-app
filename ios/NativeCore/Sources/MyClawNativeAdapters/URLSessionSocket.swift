import Foundation
import MyClawNativeCore

@MainActor public struct URLSessionSocketFactory: SocketFactory {
  public init() {}
  public func open(url: URL, identity: DeviceIdentity, receive: @escaping @MainActor (SocketEvent) -> Void) -> any SocketTransport {
    var request = URLRequest(url: url)
    request.setValue(identity.deviceId, forHTTPHeaderField: "X-My-Claw-Device")
    request.setValue("Bearer " + identity.token, forHTTPHeaderField: "Authorization")
    return URLSessionSocket(request: request, receive: receive)
  }
}

@MainActor private final class URLSessionSocket: NSObject, SocketTransport, URLSessionWebSocketDelegate {
  private let receive: @MainActor (SocketEvent) -> Void
  private var session: URLSession?
  private var socket: URLSessionWebSocketTask?
  private var reader: Task<Void, Never>?
  private var stopped = false

  init(request: URLRequest, receive: @escaping @MainActor (SocketEvent) -> Void) {
    self.receive = receive
    super.init()
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpShouldSetCookies = false
    configuration.urlCache = nil
    configuration.timeoutIntervalForRequest = 15
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    self.session = session
    let socket = session.webSocketTask(with: request)
    self.socket = socket
    socket.resume()
  }

  func send(_ text: String) async throws {
    guard !stopped, let socket else { throw URLError(.notConnectedToInternet) }
    try await socket.send(.string(text))
  }

  func close() {
    guard !stopped else { return }
    stopped = true
    reader?.cancel()
    reader = nil
    socket?.cancel(with: .goingAway, reason: nil)
    socket = nil
    session?.invalidateAndCancel()
    session = nil
  }

  private func opened() {
    guard !stopped, let socket else { return }
    receive(.opened)
    reader = Task { [weak self] in
      do {
        while !Task.isCancelled {
          let message = try await socket.receive()
          guard let self, !self.stopped else { return }
          switch message {
          case .string(let text): self.receive(.message(text))
          case .data(let data):
            if let text = String(data: data, encoding: .utf8) { self.receive(.message(text)) }
          @unknown default: break
          }
        }
      } catch {
        // The task delegate reports the HTTP upgrade status before a retry is scheduled.
      }
    }
  }

  private func ended(unauthorized: Bool) {
    guard !stopped else { return }
    close()
    receive(.closed(reason: unauthorized ? "identity refused" : "connection closed", unauthorized: unauthorized))
  }

  nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
    didOpenWithProtocol protocol: String?) {
    Task { @MainActor [weak self] in self?.opened() }
  }

  nonisolated func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
    let unauthorized = closeCode == .policyViolation
    Task { @MainActor [weak self] in self?.ended(unauthorized: unauthorized) }
  }

  nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let status = (task.response as? HTTPURLResponse)?.statusCode
    let unauthorized = status == 401 || status == 403
    Task { @MainActor [weak self] in self?.ended(unauthorized: unauthorized) }
  }

  nonisolated func urlSession(_ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
    let original = task.originalRequest?.url.flatMap { try? ServerAddress($0.absoluteString, allowInsecure: true) }
    let redirected = request.url.flatMap { try? ServerAddress($0.absoluteString, allowInsecure: true) }
    completionHandler(original?.origin != nil && original?.origin == redirected?.origin ? request : nil)
  }
}
