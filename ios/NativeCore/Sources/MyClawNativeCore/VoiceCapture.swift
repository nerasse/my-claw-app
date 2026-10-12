import Foundation

public struct VoiceTake: Codable, Equatable, Sendable {
  public let uri: URL
  public let durationMs: Int
  public let sizeBytes: Int64
  public init(uri: URL, durationMs: Int, sizeBytes: Int64) {
    self.uri = uri; self.durationMs = durationMs; self.sizeBytes = sizeBytes
  }
}

public struct VoiceDraft: Codable, Equatable, Sendable {
  public let id: UUID
  public let origin: String
  public let threadId: String?
  public let recording: VoiceTake
  public let reason: String
  public init(origin: String, threadId: String?, recording: VoiceTake, reason: String) {
    id = UUID(); self.origin = origin; self.threadId = threadId; self.recording = recording; self.reason = reason
  }
}

@MainActor public protocol MicrophoneCapture {
  func start() throws -> URL
  func stop() throws -> VoiceTake?
  func cancel()
}

public protocol VoiceDraftStore {
  func load(origin: String) throws -> [VoiceDraft]
  func save(_ drafts: [VoiceDraft], origin: String) throws
}

@MainActor public final class VoiceCaptureService {
  private let recorder: any MicrophoneCapture
  private let drafts: any VoiceDraftStore
  private var context: (origin: String, threadId: String?)?
  private var unsaved: [VoiceDraft] = []
  public init(recorder: any MicrophoneCapture, drafts: any VoiceDraftStore) { self.recorder = recorder; self.drafts = drafts }
  public func start(origin: String, threadId: String?) throws -> URL {
    guard context == nil, !origin.isEmpty else { throw NativeFailure.unpaired }
    let uri = try recorder.start()
    context = (origin, threadId)
    return uri
  }
  public func stop() throws -> VoiceTake? {
    guard context != nil else { return nil }
    defer { context = nil }
    return try recorder.stop()
  }
  public func cancel() { recorder.cancel(); context = nil }
  public func interrupt(reason: String) throws -> VoiceDraft? {
    guard let context else { return nil }
    guard let recording = try stop() else { return nil }
    let draft = VoiceDraft(origin: context.origin, threadId: context.threadId, recording: recording, reason: reason)
    unsaved.append(draft)
    try drafts.save(pending(origin: context.origin), origin: context.origin)
    unsaved.removeAll { $0.origin == context.origin }
    return draft
  }
  public func pending(origin: String) throws -> [VoiceDraft] {
    let saved = try drafts.load(origin: origin)
    let ids = Set(saved.map(\.id))
    return saved + unsaved.filter { $0.origin == origin && !ids.contains($0.id) }
  }
  public func acknowledge(uri: URL, origin: String) throws {
    let current = try pending(origin: origin)
    let remaining = current.filter { $0.recording.uri != uri }
    guard remaining.count != current.count else { return }
    try drafts.save(remaining, origin: origin)
    unsaved.removeAll { $0.origin == origin }
  }
}
