import Foundation
import UIKit
import AVFoundation
import MyClawNativeCore
import MyClawNativeAdapters

@MainActor final class DeviceRuntime {
  private let preferences = UserDefaults.standard
  private let identities = KeychainIdentityStore(service: (Bundle.main.bundleIdentifier ?? "MyClaw") + ".identity")
  private let emit: (String, [String: Any]) -> Void
  private var observers: [NSObjectProtocol] = []
  private(set) var keyboardHeight: CGFloat = 0
  private let fileStore = LocalFileStore(
    directory: URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Caches/MyClaw/media"),
    allowedRoot: URL(fileURLWithPath: NSHomeDirectory()))
  private lazy var documents = IOSDocuments(files: fileStore)
  lazy var files = FileService(files: fileStore, transport: URLSessionMediaTransport(), documents: documents,
    gallery: IOSGallery(), authorize: { [unowned self] in try authorizedMedia($0) }, progress: { [weak self] progress in
      Task { @MainActor in self?.emit("claw:transfer:progress", ["id": progress.id, "bytes": progress.bytes, "total": progress.total]) }
    })
  private lazy var recorder = IOSAudioRecorder(
    directory: URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support/MyClaw/voice"),
    level: { [weak self] level, elapsed in self?.emit("claw:voice:level", ["level": level, "elapsedMs": elapsed]) },
    failed: { [weak self] in self?.interruptCapture("audio capture stopped") })
  private lazy var capture = VoiceCaptureService(recorder: recorder,
    drafts: JSONVoiceDraftStore(directory: URL(fileURLWithPath: NSHomeDirectory())
      .appendingPathComponent("Library/Application Support/MyClaw/voice-drafts")))
  private let notifications = IOSNotifications.shared
  private var relayAvailable = false
  private var pushStorageFailure = false
  private lazy var pushStorage = PushSecureStorage(service: (Bundle.main.bundleIdentifier ?? "MyClaw") + ".push")
  private lazy var push: PushRegistrationService = PushRegistrationService(store: pushStorage, permission: notifications,
    relay: IOSPushRelay(storage: pushStorage, attest: IOSAppAttest()), emit: { [weak self] state in
      guard let self else { return }
      var event = pushDictionary(state)
      if state.status == .registered, !notifications.hasRegistrationFailure, let enrollment = push.enrollment {
        event["registrationId"] = enrollment.registrationId; event["secret"] = enrollment.secret
      }
      emit("claw:push:registration", event)
      emit("claw:push:open", [:])
    })
  private static var trustedRelay: URL? {
    guard let raw = Bundle.main.object(forInfoDictionaryKey: "MyClawRelayURL") as? String,
      let address = try? ServerAddress(raw), address.origin.hasPrefix("https://"),
      raw == address.origin || raw == address.origin + "/" else { return nil }
    return URL(string: address.origin)
  }
  private var recordingThread: String?
  private var activeOrigin: String?
  let location: any LocationCapture = IOSLocation()
  private lazy var playback: IOSAudioPlayback = IOSAudioPlayback(progress: { [weak self] value in
    guard let self else { return }
    emit("claw:voice:playback", ["uri": value.uri == nil ? NSNull() : audio.source.map { $0.absoluteString as Any } ?? NSNull(),
      "playing": value.playing, "positionMs": value.positionMs, "durationMs": value.durationMs])
  }, failed: { [weak self] in self?.emit("claw:diag", ["kind": "native", "message": "audio playback stopped unexpectedly"]) })
  private lazy var audio: AudioPlaybackService = AudioPlaybackService(playback: playback, resolve: { [unowned self] uri in
    if uri.isFileURL { return try await fileStore.inspect(uri).uri }
    return try await files.cache(address: uri.absoluteString, name: "audio.m4a", id: UUID().uuidString).uri
  }, authorize: { [unowned self] uri in
    if !uri.isFileURL { _ = try authorizedMedia(uri.absoluteString) }
  })
  private lazy var connection = ConnectionCoordinator(
    identities: identities,
    outboxes: EncryptedOutboxStore(directory: URL(fileURLWithPath: NSHomeDirectory())
      .appendingPathComponent("Library/Application Support/MyClaw/outbox", isDirectory: true),
      service: (Bundle.main.bundleIdentifier ?? "MyClaw") + ".outbox"),
    sockets: URLSessionSocketFactory(), scheduler: DispatchConnectionScheduler(),
    allowInsecure: Self.development, emit: { [weak self] in self?.connectionEvent($0) }
  )

  static var development: Bool {
#if DEBUG
    true
#else
    false
#endif
  }

  init(emit: @escaping (String, [String: Any]) -> Void) {
    self.emit = emit
    let installation = preferences.string(forKey: "myclaw.ios.installation") ?? UUID().uuidString
    preferences.set(installation, forKey: "myclaw.ios.installation")
    do { try pushStorage.prepareInstallation(installation) } catch {
      pushStorageFailure = true
      emit("claw:diag", ["kind": "native", "message": "notification storage unavailable"])
    }
    notifications.tokenChanged = { [weak self] in self?.refreshPush() }
    notifications.registrationFailed = { [weak self] in
      guard let self else { return }
      emit("claw:push:registration", pushDictionary(push.state))
    }
    notifications.openAvailable = { [weak self] in self?.emit("claw:push:open", [:]) }
    notifications.accepts = { [weak self] open in self?.push.accepts(open) == true }
    observe(UIScene.didEnterBackgroundNotification) { [weak self] notification in
      guard let scene = notification.object as? UIWindowScene, scene.session.role == .windowApplication else { return }
      self?.interruptCapture("background")
      self?.audio.pause()
      self?.connection.suspend()
    }
    observe(UIScene.didActivateNotification) { [weak self] notification in
      guard let scene = notification.object as? UIWindowScene, scene.session.role == .windowApplication else { return }
      do { try self?.connection.resume() } catch { self?.reportFailure() }
      self?.refreshPush(registerDevice: true)
    }
    observe(UIResponder.keyboardWillChangeFrameNotification) { [weak self] notification in
      guard let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
        let window = IOSPresentation.window else { return }
      self?.keyboardHeight = max(0, window.bounds.maxY - window.convert(frame, from: nil).minY)
    }
    observe(UIResponder.keyboardWillHideNotification) { [weak self] _ in self?.keyboardHeight = 0 }
    observe(AVAudioSession.interruptionNotification) { [weak self] notification in
      guard let type = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
        type == AVAudioSession.InterruptionType.began.rawValue else { return }
      self?.interruptCapture("audio interruption")
      self?.audio.pause()
    }
    observe(AVAudioSession.mediaServicesWereResetNotification) { [weak self] _ in
      self?.interruptCapture("audio service reset"); self?.audio.stop()
    }
  }

  private func observe(_ name: Notification.Name, action: @escaping @MainActor @Sendable (Notification) -> Void) {
    observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { notification in
      MainActor.assumeIsolated { action(notification) }
    })
  }

  func shutdown() {
    interruptCapture("application closed")
    audio.stop()
    connection.disconnect()
    notifications.tokenChanged = nil; notifications.registrationFailed = nil
    notifications.openAvailable = nil; notifications.accepts = nil
    for observer in observers { NotificationCenter.default.removeObserver(observer) }
    observers.removeAll()
  }

  func connect(_ url: String) throws {
    let origin = try ServerAddress(url, allowInsecure: Self.development).origin
    if activeOrigin != origin {
      interruptCapture("server changed"); stopPlayback()
      activeOrigin = origin
      relayAvailable = false
      emit("claw:instance", ["origin": origin])
      // A restored enrollment emits push:open. The UI must reset for the instance
      // first, otherwise that reset erases the cold notification's destination.
      _ = selectPush(try currentIdentity())
    }
    try connection.connect(url)
  }
  func disconnect() { connection.disconnect() }
  func send(_ text: String) throws -> Bool { try connection.send(text) }
  func clearOutbox() throws { try connection.clearOutbox() }
  var pending: Int { connection.pendingCount }
  var state: String { connection.status.state }

  private func currentIdentity() throws -> DeviceIdentity? {
    guard let raw = prefs()["serverUrl"], !raw.isEmpty else { return nil }
    let address = try ServerAddress(raw, allowInsecure: Self.development)
    return try identities.load(origin: address.origin)
  }
  func identity() throws -> [String: String] {
    guard let identity = try currentIdentity() else { return ["deviceId": "", "token": ""] }
    return ["deviceId": identity.deviceId, "token": identity.token, "origin": identity.origin]
  }

  private var mediaTicket: (value: String, origin: String)?

  private func authorizedMedia(_ address: String) throws -> URLRequest {
    guard let identity = try currentIdentity() else { throw NativeFailure.unpaired }
    return try MediaAuthorization.authorize(address, identity: identity, ticket: mediaTicket?.origin == identity.origin ? mediaTicket?.value : nil, allowInsecure: Self.development)
  }

  func microphonePermission() async -> String { await recorder.permission() }
  func recordingContext(_ threadId: String?) {
    if recordingThread != threadId { interruptCapture("conversation changed") }
    recordingThread = threadId
  }
  func startRecording() throws -> URL {
    guard let identity = try currentIdentity() else { throw NativeFailure.unpaired }
    audio.stop()
    return try capture.start(origin: identity.origin, threadId: recordingThread)
  }
  func stopRecording() throws -> VoiceTake? { try capture.stop() }
  func cancelRecording() { capture.cancel() }
  func voiceDrafts() throws -> [VoiceDraft] {
    guard let identity = try currentIdentity() else { return [] }
    return try capture.pending(origin: identity.origin)
  }
  func acknowledgeVoiceDraft(_ uri: URL, origin: String) throws {
    try capture.acknowledge(uri: uri, origin: ServerAddress(origin, allowInsecure: Self.development).origin)
  }
  private func pushDictionary(_ state: PushState) -> [String: Any] {
    var value: [String: Any] = ["permission": state.permission.rawValue, "status": state.status.rawValue]
    if let reason = state.reason { value["reason"] = reason }
    if notifications.hasRegistrationFailure {
      value["status"] = "failed"; value["reason"] = "Apple device registration failed. Retry when connected."
    }
    return value
  }
  private func selectPush(_ identity: DeviceIdentity?) -> Bool {
    do {
      guard let installation = preferences.string(forKey: "myclaw.ios.installation") else { throw NativeFailure.invalidParameter }
      try pushStorage.prepareInstallation(installation)
      try push.select(identity, relay: Self.trustedRelay)
      pushStorageFailure = false; return true
    } catch {
      pushStorageFailure = true; push.deactivate(); notifications.discardOpen()
      emit("claw:diag", ["kind": "native", "message": "notification storage unavailable"])
      return false
    }
  }
  func configurePush(_ advertisedRelay: String) async throws -> [String: Any] {
    let advertised = try? ServerAddress(advertisedRelay)
    relayAvailable = Self.trustedRelay?.absoluteString == advertised?.origin
    if selectPush(try currentIdentity()), relayAvailable {
      try await registerPushDeviceIfAuthorized()
      await push.refresh(token: notifications.token)
    }
    return try await pushState()
  }
  func pushState() async throws -> [String: Any] {
    var value = pushDictionary(push.state)
    if let enrollment = push.enrollment { value["registrationId"] = enrollment.registrationId }
    value["permission"] = try await notifications.authorization(request: false).rawValue
    if pushStorageFailure { value["status"] = "failed"; value["reason"] = "Notification storage is unavailable. Retry when the device is unlocked." }
    if Self.trustedRelay == nil || !relayAvailable { value["status"] = "notConfigured"; value["reason"] = "Notifications are unavailable for this build or server." }
    return value
  }
  func requestPush() async throws -> [String: Any] {
    guard Self.trustedRelay != nil, relayAvailable else { return try await pushState() }
    guard selectPush(try currentIdentity()) else { return try await pushState() }
    let permission = try await notifications.authorization(request: true)
    guard relayAvailable, selectPush(try currentIdentity()) else { return try await pushState() }
    if permission == .granted { notifications.registerDevice() }
    await push.refresh(token: notifications.token)
    return try await pushState()
  }
  private func registerPushDeviceIfAuthorized() async throws {
    if try await notifications.authorization(request: false) == .granted { notifications.registerDevice() }
  }
  private func refreshPush(registerDevice: Bool = false) {
    guard relayAvailable else { return }
    Task {
      do {
        if selectPush(try currentIdentity()) {
          if registerDevice { try await registerPushDeviceIfAuthorized() }
          await push.refresh(token: notifications.token)
        }
      }
      catch { emit("claw:diag", ["kind": "native", "message": "notification identity unavailable"]) }
    }
  }
  func revokePush() async throws { try await push.revoke(); notifications.discardOpen(); relayAvailable = false }
  func invalidatePush() { push.deactivate(); notifications.discardOpen(); relayAvailable = false }
  func notificationOpen() throws -> String? {
    // React subscribes before its asynchronous preference/connection bootstrap.
    // Leave the open buffered until connect has announced the selected instance.
    let identity = try currentIdentity()
    guard let identity, activeOrigin == identity.origin, selectPush(identity) else { return nil }
    return notifications.takeOpen()?.link
  }
  func visibleNotificationThread(_ thread: String?) {
    notifications.visibleThread = thread
    if let thread { Task { await notifications.dismiss(thread: thread) } }
  }
  private func interruptCapture(_ reason: String) {
    do {
      if try capture.interrupt(reason: reason) != nil { emit("claw:voice:interrupted", ["reason": reason]) }
    } catch {
      emit("claw:voice:interrupted", ["reason": "recording kept in memory; storage unavailable"])
    }
  }
  func playAudio(_ uri: URL, rate: Float) async throws {
    interruptCapture("playback started")
    try await audio.play(uri, rate: rate)
  }
  func setPlaybackRate(_ rate: Float) throws { try audio.setRate(rate) }
  func pausePlayback() { audio.pause() }
  func seekPlayback(_ positionMs: Int) { audio.seek(positionMs) }
  func stopPlayback() { audio.stop() }

  func adopt(deviceId: String, token: String, origin: String) throws -> Bool {
    mediaTicket = nil
    let address = try ServerAddress(origin, allowInsecure: Self.development)
    invalidatePush()
    stopPlayback()
    try identities.save(DeviceIdentity(deviceId: deviceId, token: token, origin: address.origin))
    return true
  }

  func prefs() -> [String: String] { preferences.dictionary(forKey: "MyClaw.preferences") as? [String: String] ?? [:] }

  func setPreference(_ key: String, value: String?) throws {
    let keys = ["themeMode", "serverUrl", "lastThreadId", "updateOnMobileData", "chatFontScale",
      "collapsedFolders", "setupSkipped", "playbackRate"]
    guard keys.contains(key) else { throw NativeFailure.invalidParameter }
    var values = prefs()
    if key == "serverUrl", values[key] != value {
      interruptCapture("server changed"); stopPlayback(); connection.disconnect(); mediaTicket = nil; invalidatePush()
    }
    if key == "serverUrl", let value, var url = URLComponents(string: value), url.host != nil {
      guard url.user == nil, url.password == nil else { throw NativeFailure.invalidServerAddress }
      url.queryItems = url.queryItems?.filter { !["device", "token"].contains($0.name) }
      url.fragment = nil
      values[key] = url.string
    } else { values[key] = value }
    preferences.set(values, forKey: "MyClaw.preferences")
  }

  var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "" }

  private func reportFailure() {
    emit("claw:ws:state", ["state": "disconnected", "reason": "storage unavailable", "pending": pending])
  }

  private func connectionEvent(_ event: ConnectionEvent) {
    switch event {
    case .state(let status):
      if status.reason == "unauthorized" {
        if let activeOrigin { try? identities.remove(origin: activeOrigin) }
        relayAvailable = false
        Task { try? await push.revoke() }
      }
      var payload: [String: Any] = ["state": status.state, "pending": status.pending, "attempts": status.attempts]
      if let reason = status.reason { payload["reason"] = reason }
      emit("claw:ws:state", payload)
    case .message(let text):
      if let data = text.data(using: .utf8),
        let frame = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        frame["type"] as? String == "media.ticket", let ticket = frame["ticket"] as? String,
        let identity = try? currentIdentity() {
        mediaTicket = (ticket, identity.origin)
      }
      emit("claw:ws:message", ["text": text])
    case .outbox(let count): emit("claw:ws:outbox", ["pending": count])
    case .diagnostic(let message): emit("claw:diag", ["kind": "native", "message": message])
    }
  }
}
