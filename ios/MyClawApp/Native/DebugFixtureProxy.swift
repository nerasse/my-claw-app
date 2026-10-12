#if DEBUG
import Foundation
@preconcurrency import Network
import UIKit

/// Real-device XCTest runners can be denied Local Network without a prompt.
/// This opt-in loopback proxy uses the app's permission to reach our isolated
/// fixture. It never accepts an arbitrary host, path, body or credential.
@MainActor final class DebugFixtureProxy {
  private let listener: NWListener
  private let origin: URL
  private let session = URLSession(configuration: .ephemeral)
  private let paths: Set<String> = ["/facts", "/media", "/video", "/image", "/pause", "/hold-media",
    "/release-media", "/delay-status", "/frame-counts", "/push-state", "/push", "/ticket"]

  static func startIfRequested() -> DebugFixtureProxy? {
    let env = ProcessInfo.processInfo.environment
    guard env["MYCLAW_PHYSICAL_QA"] == "1", let raw = env["MYCLAW_IOS_UI_PROBE_URL"],
      var url = URLComponents(string: raw), url.scheme == "http", url.port == 39080,
      url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
      url.path.isEmpty || url.path == "/", let host = url.host else { return nil }
    let parts = host.split(separator: ".", omittingEmptySubsequences: false)
    let octets = parts.compactMap { Int($0) }
    guard parts.count == 4, octets.count == 4, octets.allSatisfy({ (0...255).contains($0) }),
      octets[0] == 10 || (octets[0] == 192 && octets[1] == 168) || (octets[0] == 172 && (16...31).contains(octets[1])) else { return nil }
    url.port = 39081; url.path = "/"
    guard let origin = url.url else { return nil }
    return try? DebugFixtureProxy(origin: origin)
  }

  private init(origin: URL) throws {
    self.origin = origin
    let parameters = NWParameters.tcp
    parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: 39082)
    listener = try NWListener(using: parameters)
    listener.newConnectionHandler = { [weak self] connection in
      Task { @MainActor in self?.receive(connection) }
    }
    listener.start(queue: .main)
    UIApplication.shared.isIdleTimerDisabled = true
  }

  private func receive(_ connection: NWConnection) {
    connection.start(queue: .main)
    connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, _, _ in
      Task { @MainActor in await self?.reply(connection, data: data) }
    }
  }

  private func reply(_ connection: NWConnection, data: Data?) async {
    guard let data, let request = String(data: data, encoding: .utf8),
      let line = request.components(separatedBy: "\r\n").first else { connection.cancel(); return }
    let fields = line.split(separator: " ")
    guard fields.count == 3, fields[0] == "GET", fields[2].hasPrefix("HTTP/1."),
      let relative = URLComponents(string: String(fields[1])), relative.scheme == nil, relative.host == nil,
      paths.contains(relative.path), relative.fragment == nil,
      relative.queryItems?.allSatisfy({ ["thread", "delay"].contains($0.name) }) ?? true,
      let destination = URL(string: String(fields[1]).dropFirst().description, relativeTo: origin)?.absoluteURL else {
      send(connection, status: 403, body: Data("{}".utf8)); return
    }
    var upstream = URLRequest(url: destination); upstream.timeoutInterval = 20
    do {
      let (body, response) = try await session.data(for: upstream)
      guard body.count <= 100_000 else { send(connection, status: 413, body: Data("{}".utf8)); return }
      send(connection, status: (response as? HTTPURLResponse)?.statusCode ?? 502, body: body)
    } catch { send(connection, status: 502, body: Data("{\"error\":\"QA fixture unavailable\"}".utf8)) }
  }

  private func send(_ connection: NWConnection, status: Int, body: Data) {
    var response = Data("HTTP/1.1 \(status) Fixture\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n".utf8)
    response.append(body)
    connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
  }
}
#endif
