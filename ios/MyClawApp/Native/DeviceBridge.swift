import Foundation
import React
import UIKit
import UniformTypeIdentifiers
import MyClawNativeCore

@MainActor @objc(DeviceBridge) final class DeviceBridge: RCTEventEmitter {
  private var listening = false
  private lazy var runtime = DeviceRuntime { [weak self] name, body in
    guard let self, listening else { return }
    sendEvent(withName: name, body: body)
  }
  override func startObserving() { listening = true }
  override func stopObserving() { listening = false }
  nonisolated override func invalidate() { Task { @MainActor [self] in finishInvalidation() } }
  private func finishInvalidation() { listening = false; runtime.shutdown(); super.invalidate() }
  override static func requiresMainQueueSetup() -> Bool { true }
  override var methodQueue: DispatchQueue! { .main }
  override func supportedEvents() -> [String]! {
    ["claw:ws:state", "claw:ws:message", "claw:ws:outbox", "claw:diag", "claw:voice:level",
      "claw:voice:playback", "claw:voice:interrupted", "claw:transfer:progress", "claw:push:registration", "claw:push:open",
      "claw:instance", "claw:hotkey", "claw:update:install"]
  }

  private func result(_ resolve: RCTPromiseResolveBlock, _ reject: RCTPromiseRejectBlock,
    _ action: () throws -> Any?) {
    do { resolve(try action()) }
    catch { reject("IOS_OPERATION_FAILED", "The iOS operation could not be completed", nil) }
  }

  private func asyncResult(_ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock,
    _ action: @escaping () async throws -> Any?) {
    Task {
      do { resolve(try await action()) }
      catch { reject("IOS_OPERATION_FAILED", "The iOS operation could not be completed", nil) }
    }
  }
  private func uri(_ raw: String) throws -> URL {
    guard let url = URL(string: raw) else { throw CocoaError(.fileReadUnsupportedScheme) }
    return url
  }
  private func file(_ value: NativeFile, typed: Bool = false) -> [String: Any] {
    var output: [String: Any] = ["uri": value.uri.absoluteString, "name": value.name, "size": value.size]
    if typed { output["type"] = UTType(filenameExtension: value.uri.pathExtension)?.preferredMIMEType ?? "application/octet-stream" }
    return output
  }
  private func recording(_ value: VoiceTake) -> [String: Any] {
    ["uri": value.uri.absoluteString, "durationMs": value.durationMs, "sizeBytes": value.sizeBytes, "mimeType": "audio/mp4"]
  }

  @objc func connect(_ url: String) {
    do { try runtime.connect(url) }
    catch { sendEvent(withName: "claw:ws:state", body: ["state": "disconnected", "reason": "invalid address or storage unavailable"]) }
  }
  @objc func disconnect() { runtime.disconnect() }
  @objc func sendMessage(_ text: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    result(resolve, reject) { try runtime.send(text) }
  }
  @objc func pendingCount(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { resolve(runtime.pending) }
  @objc func clearOutbox(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    result(resolve, reject) { try runtime.clearOutbox(); return nil }
  }
  @objc func getConnectionState(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { resolve(runtime.state) }
  @objc func getDeviceInfo(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    result(resolve, reject) { try runtime.identity() }
  }
  @objc func adoptCredentials(_ deviceId: String, token: String, origin: String,
    resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    result(resolve, reject) { try runtime.adopt(deviceId: deviceId, token: token, origin: origin) }
  }
  @objc func getCapabilities(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { resolve(["wssConnection": true]) }
  @objc func getCurrentLocation(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) {
      let fix = try await self.runtime.location.current()
      var result: [String: Any] = ["latitude": fix.latitude, "longitude": fix.longitude,
        "accuracyMeters": fix.accuracyMeters, "capturedAt": ISO8601DateFormatter().string(from: fix.capturedAt)]
      result["altitudeMeters"] = fix.altitudeMeters
      result["headingDegrees"] = fix.headingDegrees
      result["speedMetersPerSecond"] = fix.speedMetersPerSecond
      return result
    }
  }
  @objc func prefsGetAll(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { resolve(runtime.prefs()) }
  @objc func prefsSet(_ key: String, value: String?, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    result(resolve, reject) { try runtime.setPreference(key, value: value); return nil }
  }
  @objc func getAppVersion(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { resolve(runtime.version) }
  @objc func getExitInfo(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { resolve(["versionName": runtime.version, "exits": []] as [String: Any]) }
  @objc func getNetworkType(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { resolve("other") }
  @objc func keyboardVisible(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(["visible": runtime.keyboardHeight > 0, "height": runtime.keyboardHeight] as [String: Any])
  }
  @objc func setHotkeys(_ combos: [String]) {}
  @objc func focusIfKeyboard(_ reactTag: NSNumber) {}
  @objc func restoreKeyboardFocus() {}
  @objc func drainInstallResult() {}
  @objc func getNotificationSounds(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { resolve(nil) }
  @objc func getNotificationChannelState(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { resolve(nil) }

  @objc func configureAPNs(_ relay: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) { try await self.runtime.configurePush(relay) }
  }
  @objc func getAPNsState(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) { try await self.runtime.pushState() }
  }
  @objc func requestAPNs(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) { try await self.runtime.requestPush() }
  }
  @objc func revokeAPNs(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) { try await self.runtime.revokePush(); return nil }
  }
  @objc func invalidateAPNs() { runtime.invalidatePush() }
  @objc func drainNotificationOpen(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    result(resolve, reject) { try runtime.notificationOpen() }
  }
  @objc func setVisibleNotificationThread(_ thread: String?) { runtime.visibleNotificationThread(thread) }
  @objc func pickFile(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) { try await self.runtime.files.select().map { self.file($0, typed: true) } }
  }
  @objc func prepareFile(_ raw: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) { self.file(try await self.runtime.files.prepare(self.uri(raw))) }
  }
  @objc func uploadFile(_ raw: String, url: String, filename: String, type: String, threadId: String, transferId: String,
    resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) {
      let response = try await self.runtime.files.upload(uri: self.uri(raw), address: url, name: filename,
        type: type, threadId: threadId, id: transferId)
      return ["status": response.status, "body": response.body] as [String: Any]
    }
  }
  @objc func cacheFile(_ url: String, filename: String, transferId: String,
    resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) { self.file(try await self.runtime.files.cache(address: url, name: filename, id: transferId)) }
  }
  @objc func saveFile(_ url: String, filename: String, transferId: String,
    resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) {
      guard let uri = try await self.runtime.files.save(address: url, name: filename, id: transferId) else { return nil }
      return ["path": uri.absoluteString]
    }
  }
  @objc func downloadFile(_ url: String, filename: String, toGallery: Bool, transferId: String,
    resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) {
      guard let uri = try await self.runtime.files.download(address: url, name: filename, toGallery: toGallery, id: transferId) else {
        throw CocoaError(.userCancelled)
      }
      return ["path": uri.absoluteString]
    }
  }
  @objc func clipboardHasImage(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { resolve(UIPasteboard.general.hasImages) }
  @objc func clipboardImage(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    result(resolve, reject) {
      guard let image = UIPasteboard.general.image, let data = image.pngData() else { return nil }
      let folder = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Caches/MyClaw/clipboard")
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      let uri = folder.appendingPathComponent(UUID().uuidString + ".png")
      try data.write(to: uri, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      return ["uri": uri.absoluteString, "name": "clipboard.png", "type": "image/png", "size": data.count] as [String: Any]
    }
  }
  @objc func microphonePermission(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) { await self.runtime.microphonePermission() }
  }
  @objc func setRecordingContext(_ threadId: String?) { runtime.recordingContext(threadId) }
  @objc func startRecording(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    result(resolve, reject) { try runtime.startRecording().absoluteString }
  }
  @objc func stopRecording(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    result(resolve, reject) { try runtime.stopRecording().map(recording) }
  }
  @objc func cancelRecording(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { runtime.cancelRecording(); resolve(nil) }
  @objc func voiceDrafts(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    result(resolve, reject) { try runtime.voiceDrafts().map { draft -> [String: Any] in
      ["id": draft.id.uuidString, "origin": draft.origin, "threadId": draft.threadId.map { $0 as Any } ?? NSNull(),
        "reason": draft.reason, "recording": recording(draft.recording)]
    } }
  }
  @objc func acknowledgeVoiceDraft(_ raw: String, origin: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    result(resolve, reject) { try runtime.acknowledgeVoiceDraft(uri(raw), origin: origin); return nil }
  }
  @objc func playAudio(_ raw: String, rate: Float, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    asyncResult(resolve, reject) { try await self.runtime.playAudio(self.uri(raw), rate: rate); return nil }
  }
  @objc func setPlaybackRate(_ rate: Float, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    result(resolve, reject) { try runtime.setPlaybackRate(rate); return nil }
  }
  @objc func pausePlayback(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { runtime.pausePlayback(); resolve(nil) }
  @objc func seekPlayback(_ positionMs: Int, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { runtime.seekPlayback(positionMs); resolve(nil) }
  @objc func stopPlayback(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) { runtime.stopPlayback(); resolve(nil) }
}
