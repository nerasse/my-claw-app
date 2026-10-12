import Foundation

/// Keeps a logical note associated with its resolved file and invalidates suspended requests.
@MainActor public final class AudioPlaybackService {
  private let playback: any AudioPlayback
  private let resolve: @MainActor (URL) async throws -> URL
  private let authorize: @MainActor (URL) throws -> Void
  private var generation = UUID()
  private var cached: (source: URL, file: URL)?
  public private(set) var source: URL?

  public init(playback: any AudioPlayback, resolve: @escaping @MainActor (URL) async throws -> URL,
    authorize: @escaping @MainActor (URL) throws -> Void) {
    self.playback = playback; self.resolve = resolve; self.authorize = authorize
  }

  public func play(_ uri: URL, rate: Float) async throws {
    let request = UUID(); generation = request
    try authorize(uri)
    let file: URL
    if let cached, cached.source == uri { file = cached.file }
    else {
      do { file = try await resolve(uri) }
      catch {
        guard generation == request else { throw CancellationError() }
        throw error
      }
    }
    guard generation == request else { throw CancellationError() }
    try authorize(uri)
    let previous = source
    cached = (uri, file); source = uri
    do { try playback.play(file, rate: rate) }
    catch { cached = nil; source = previous; throw error }
  }

  public func pause() { generation = UUID(); playback.pause() }
  public func stop() { generation = UUID(); cached = nil; source = nil; playback.stop() }
  public func seek(_ positionMs: Int) { playback.seek(positionMs) }
  public func setRate(_ rate: Float) throws { try playback.setRate(rate) }
}
