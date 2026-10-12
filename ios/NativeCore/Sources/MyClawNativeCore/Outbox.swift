import Foundation

public struct PendingFrame: Codable, Equatable, Sendable {
  public let id: UUID
  public let text: String
  public init(id: UUID = UUID(), text: String) { self.id = id; self.text = text }
}

public protocol OutboxStore {
  func load(origin: String) throws -> [PendingFrame]
  func save(_ frames: [PendingFrame], origin: String) throws
}

public final class DurableOutbox {
  private let origin: String
  private let store: any OutboxStore
  private var frames: [PendingFrame]
  private var sentCount = 0

  public init(origin: String, store: any OutboxStore) throws {
    self.origin = origin
    self.store = store
    frames = try store.load(origin: origin)
    guard frames.count <= 200 else { throw CocoaError(.fileReadCorruptFile) }
  }

  public var pendingCount: Int { frames.count }
  public var nextToSend: PendingFrame? { sentCount < frames.count ? frames[sentCount] : nil }
  public var lastSentID: UUID? { sentCount > 0 ? frames[sentCount - 1].id : nil }

  public func enqueue(_ text: String) throws -> Bool {
    guard !text.isEmpty, frames.count < 200 else { return false }
    let updated = frames + [PendingFrame(text: text)]
    try store.save(updated, origin: origin)
    frames = updated
    return true
  }

  public func markSent(_ id: UUID) {
    guard nextToSend?.id == id else { return }
    sentCount += 1
  }

  public func acknowledge(through id: UUID) throws {
    guard let index = frames.firstIndex(where: { $0.id == id }), index < sentCount else { return }
    let updated = Array(frames.dropFirst(index + 1))
    try store.save(updated, origin: origin)
    frames = updated
    sentCount -= index + 1
  }

  public func resetForRetry() { sentCount = 0 }

  public func clear() throws {
    try store.save([], origin: origin)
    frames = []
    sentCount = 0
  }
}
