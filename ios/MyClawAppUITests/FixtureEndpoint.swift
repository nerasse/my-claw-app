import XCTest

enum FixtureEndpoint {
  static var physical: Bool { ProcessInfo.processInfo.environment["MYCLAW_PHYSICAL_QA"] == "1" }
  @MainActor private static var appPrepared = false
  @MainActor static func data(_ path: String) async throws -> (Data, URLResponse) {
    var url = try controlURL(path)
    if physical {
      // Loopback is exempt from Local Network privacy. The opt-in Debug app
      // forwards only fixture operations using its own granted permission.
      var components = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: true))
      components.host = "127.0.0.1"; components.port = 39082
      url = try XCTUnwrap(components.url)
      let app = XCUIApplication()
      if !appPrepared || app.state != .runningForeground { launch(app) }
    }
    return try await URLSession.shared.data(from: url)
  }

  @MainActor static func launch(_ app: XCUIApplication) {
    if physical {
      app.launchEnvironment["MYCLAW_PHYSICAL_QA"] = "1"
      app.launchEnvironment["MYCLAW_IOS_UI_PROBE_URL"] = ProcessInfo.processInfo.environment["MYCLAW_IOS_UI_PROBE_URL"]
    }
    app.launch()
    appPrepared = true
  }

  @MainActor static func type(_ text: String, into field: XCUIElement) {
    // RN controlled fields can lose repeated synthetic keys at XCTest's default
    // frequency. Waiting for each UI event also works with the phone's AZERTY keyboard.
    for character in text { field.typeText(String(character)) }
  }

  static func controlURL(_ path: String) throws -> URL {
    guard let raw = ProcessInfo.processInfo.environment["MYCLAW_IOS_UI_PROBE_URL"],
      var address = URLComponents(string: raw), address.scheme == "http", address.port == 39080,
      address.user == nil, address.password == nil, address.query == nil, address.fragment == nil,
      address.path.isEmpty || address.path == "/", let host = address.host else {
      throw XCTSkip("An isolated MyClaw UI fixture is required")
    }
    let parts = host.split(separator: ".", omittingEmptySubsequences: false)
    let octets = parts.compactMap { Int($0) }
    let privateIPv4 = parts.count == 4 && octets.count == 4 && octets.allSatisfy { (0...255).contains($0) }
      && (octets[0] == 10 || (octets[0] == 192 && octets[1] == 168)
        || (octets[0] == 172 && (16...31).contains(octets[1])))
    guard host == "127.0.0.1" || (physical && privateIPv4) else {
      throw XCTSkip("UI probes are restricted to loopback or explicitly enabled private-LAN hardware QA")
    }
    address.port = 39081; address.path = "/"
    return try XCTUnwrap(URL(string: path, relativeTo: address.url)?.absoluteURL)
  }
}

@MainActor extension XCUIElementQuery {
  var mostRecent: XCUIElement { element(boundBy: max(0, count - 1)) }
}
