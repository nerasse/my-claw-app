import Foundation
import XCTest
@testable import MyClawNativeCore

@MainActor final class VoiceCaptureTests: XCTestCase {
  private final class Recorder: MicrophoneCapture {
    var recording = false
    let take = VoiceTake(uri: URL(fileURLWithPath: "/fixture/note.m4a"), durationMs: 1500, sizeBytes: 4096)
    func start() -> URL { recording = true; return take.uri }
    func stop() -> VoiceTake? { defer { recording = false }; return recording ? take : nil }
    func cancel() { recording = false }
  }
  private final class Drafts: VoiceDraftStore {
    var items: [String: [VoiceDraft]] = [:]
    var fail = false
    func load(origin: String) -> [VoiceDraft] { items[origin] ?? [] }
    func save(_ drafts: [VoiceDraft], origin: String) throws {
      if fail { throw CocoaError(.fileWriteNoPermission) }
      items[origin] = drafts
    }
  }

  func testAnInterruptionKeepsTheTakeInItsOriginalConversationWithoutSendingIt() async throws {
    let recorder = Recorder(); let store = Drafts()
    let capture = VoiceCaptureService(recorder: recorder, drafts: store)
    _ = try capture.start(origin: "https://one.example", threadId: "conversation")
    let interrupted = try XCTUnwrap(capture.interrupt(reason: "background"))
    XCTAssertFalse(recorder.recording)
    XCTAssertEqual(interrupted.threadId, "conversation")
    XCTAssertEqual(interrupted.recording, recorder.take)
    XCTAssertEqual(try capture.pending(origin: "https://one.example"), [interrupted])
    XCTAssertEqual(try capture.pending(origin: "https://two.example"), [])
    XCTAssertNil(try capture.stop())
  }

  func testADraftIsRetainedUntilAnExplicitAcknowledgement() async throws {
    let recorder = Recorder(); let store = Drafts()
    let capture = VoiceCaptureService(recorder: recorder, drafts: store)
    _ = try capture.start(origin: "https://one.example", threadId: nil)
    let draft = try XCTUnwrap(capture.interrupt(reason: "audio interruption"))
    let recreated = VoiceCaptureService(recorder: Recorder(), drafts: store)
    XCTAssertEqual(try recreated.pending(origin: draft.origin), [draft])
    try recreated.acknowledge(uri: draft.recording.uri, origin: "https://two.example")
    XCTAssertEqual(try recreated.pending(origin: draft.origin), [draft])
    try recreated.acknowledge(uri: draft.recording.uri, origin: draft.origin)
    XCTAssertEqual(try recreated.pending(origin: draft.origin), [])
  }

  func testAStorageFailureDoesNotDiscardTheInterruptedTakeInMemory() async throws {
    let recorder = Recorder(); let store = Drafts()
    let capture = VoiceCaptureService(recorder: recorder, drafts: store)
    _ = try capture.start(origin: "https://one.example", threadId: nil)
    store.fail = true
    XCTAssertThrowsError(try capture.interrupt(reason: "background"))
    XCTAssertEqual(try capture.pending(origin: "https://one.example").map(\.recording), [recorder.take])
  }
}
