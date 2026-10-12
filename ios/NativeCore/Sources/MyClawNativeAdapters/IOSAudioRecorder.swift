#if os(iOS)
import Foundation
import AVFoundation
import MyClawNativeCore

@MainActor public final class IOSAudioRecorder: NSObject, MicrophoneCapture, AVAudioRecorderDelegate {
  private let directory: URL
  private let level: (Float, Int) -> Void
  private let failed: () -> Void
  private var recorder: AVAudioRecorder?
  private var meter: Timer?
  public init(directory: URL, level: @escaping (Float, Int) -> Void, failed: @escaping () -> Void) {
    self.directory = directory; self.level = level; self.failed = failed
    super.init()
  }

  public func permission() async -> String {
    let session = AVAudioSession.sharedInstance()
    switch session.recordPermission {
    case .granted: return "granted"
    case .denied: return "blocked"
    case .undetermined:
      let granted = await Self.requestPermission { reply in session.requestRecordPermission(reply) }
      return granted ? "granted" : "denied"
    @unknown default: return "blocked"
    }
  }

  static func requestPermission(_ request: (@escaping @Sendable (Bool) -> Void) -> Void) async -> Bool {
    await withCheckedContinuation { continuation in
      // AVAudioSession replies on its TCC queue; this callback must not inherit MainActor.
      request { @Sendable granted in continuation.resume(returning: granted) }
    }
  }

  public func start() throws -> URL {
    guard recorder == nil, AVAudioSession.sharedInstance().recordPermission == .granted else {
      throw CocoaError(.fileWriteNoPermission)
    }
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
    try session.setActive(true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let url = directory.appendingPathComponent(UUID().uuidString + ".m4a")
    let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100,
      AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 96_000]
    let recorder = try AVAudioRecorder(url: url, settings: settings)
    recorder.delegate = self
    recorder.isMeteringEnabled = true
    guard recorder.prepareToRecord(), recorder.record() else { throw CocoaError(.fileWriteUnknown) }
    self.recorder = recorder
    let timer = Timer(timeInterval: 1.0 / 16, repeats: true) { [weak self] _ in
      Task { @MainActor in self?.tick() }
    }
    meter = timer
    RunLoop.main.add(timer, forMode: .common)
    return url
  }

  public func stop() throws -> VoiceTake? {
    guard let recorder else { return nil }
    let duration = Int(recorder.currentTime * 1000)
    recorder.delegate = nil
    recorder.stop()
    self.recorder = nil
    meter?.invalidate(); meter = nil
    try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    let size = try recorder.url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard duration > 0, size > 0 else { try? FileManager.default.removeItem(at: recorder.url); return nil }
    return VoiceTake(uri: recorder.url, durationMs: duration, sizeBytes: Int64(size))
  }

  public func cancel() {
    guard let recorder else { return }
    recorder.delegate = nil
    recorder.stop()
    self.recorder = nil
    meter?.invalidate(); meter = nil
    try? FileManager.default.removeItem(at: recorder.url)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func tick() {
    guard let recorder else { return }
    recorder.updateMeters()
    let amplitude = pow(10, recorder.averagePower(forChannel: 0) / 20)
    level(min(1, max(0, amplitude)), Int(recorder.currentTime * 1000))
  }

  nonisolated public func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: (any Error)?) {
    stopped(ObjectIdentifier(recorder))
  }
  nonisolated public func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
    stopped(ObjectIdentifier(recorder))
  }
  nonisolated private func stopped(_ identifier: ObjectIdentifier) {
    Task { @MainActor [weak self] in
      guard let self, let recorder = self.recorder, ObjectIdentifier(recorder) == identifier else { return }
      failed()
    }
  }
}
#endif
