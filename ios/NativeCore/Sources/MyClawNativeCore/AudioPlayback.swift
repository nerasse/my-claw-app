import Foundation

public struct PlaybackProgress: Equatable, Sendable {
  public let uri: URL?
  public let playing: Bool
  public let positionMs: Int
  public let durationMs: Int
  public init(uri: URL?, playing: Bool, positionMs: Int, durationMs: Int) {
    self.uri = uri; self.playing = playing; self.positionMs = positionMs; self.durationMs = durationMs
  }
}

@MainActor public protocol AudioPlayback {
  func play(_ uri: URL, rate: Float) throws
  func setRate(_ rate: Float) throws
  func pause()
  func seek(_ positionMs: Int)
  func stop()
}
