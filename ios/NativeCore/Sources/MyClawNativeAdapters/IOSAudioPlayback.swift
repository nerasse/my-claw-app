#if os(iOS)
import Foundation
import AVFoundation
import MyClawNativeCore

@MainActor public final class IOSAudioPlayback: AudioPlayback {
  private var player: AVPlayer?
  private var uri: URL?
  private var rate: Float = 1
  private var observer: Any?
  private var finish: NSObjectProtocol?
  private var statusObserver: NSKeyValueObservation?
  private var generation = UUID()
  private var ended = false
  private let failed: () -> Void
  private let progress: (PlaybackProgress) -> Void
  public init(progress: @escaping (PlaybackProgress) -> Void, failed: @escaping () -> Void = {}) { self.progress = progress; self.failed = failed }

  public func play(_ uri: URL, rate: Float) throws {
    guard rate.isFinite, (0.5...2).contains(rate) else { throw NativeFailure.invalidParameter }
    guard uri.isFileURL else { throw NativeFailure.invalidParameter }
    _ = try AVAudioFile(forReading: uri)
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playback, mode: .spokenAudio)
    try session.setActive(true)
    self.rate = rate
    if self.uri != uri {
      stop()
      let item = AVPlayerItem(url: uri)
      item.audioTimePitchAlgorithm = .timeDomain
      let player = AVPlayer(playerItem: item)
      self.player = player
      self.uri = uri
      let generation = self.generation
      observer = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.1, preferredTimescale: 600), queue: .main) { [weak self] _ in
        Task { @MainActor in if self?.generation == generation { self?.publish() } }
      }
      statusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
        let failed = item.status == .failed
        if failed { Task { @MainActor in
          guard let self, self.generation == generation else { return }; self.pause(); self.failed()
        } }
      }
      finish = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
        Task { @MainActor in
          guard let self, self.generation == generation else { return }; self.ended = true; self.pause()
        }
      }
    }
    if ended, let player {
      ended = false
      let generation = self.generation
      player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] completed in
        Task { @MainActor in
          guard let self, self.generation == generation, completed else { return }
          self.player?.playImmediately(atRate: self.rate); self.publish()
        }
      }
    } else { player?.playImmediately(atRate: rate); publish() }
  }

  public func setRate(_ rate: Float) throws {
    guard rate.isFinite, (0.5...2).contains(rate) else { throw NativeFailure.invalidParameter }
    self.rate = rate
    if let player, player.rate != 0 { player.rate = rate }
    publish()
  }
  public func pause() { player?.pause(); publish() }
  public func seek(_ positionMs: Int) {
    player?.seek(to: CMTime(seconds: Double(max(0, positionMs)) / 1000, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
    publish()
  }
  public func stop() {
    generation = UUID(); ended = false; statusObserver = nil
    if let observer { player?.removeTimeObserver(observer) }
    if let finish { NotificationCenter.default.removeObserver(finish) }
    observer = nil; finish = nil
    player?.pause(); player = nil; uri = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    publish()
  }
  private func publish() {
    let position = player?.currentTime().seconds ?? 0
    let duration = player?.currentItem?.duration.seconds ?? 0
    progress(PlaybackProgress(uri: uri, playing: (player?.rate ?? 0) != 0,
      positionMs: position.isFinite ? Int(max(0, position) * 1000) : 0,
      durationMs: duration.isFinite ? Int(max(0, duration) * 1000) : 0))
  }
}
#endif
