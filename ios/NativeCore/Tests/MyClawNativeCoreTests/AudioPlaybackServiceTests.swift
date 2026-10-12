import Foundation
import XCTest
@testable import MyClawNativeCore

@MainActor final class AudioPlaybackServiceTests: XCTestCase {
  private final class Player: AudioPlayback {
    var files: [URL] = []
    var stopped = false
    func play(_ uri: URL, rate: Float) { files.append(uri) }
    func setRate(_ rate: Float) {}
    func pause() {}
    func seek(_ positionMs: Int) {}
    func stop() { stopped = true }
  }
  @MainActor private final class HeldFile {
    let started: XCTestExpectation
    var pending: CheckedContinuation<URL, Error>?
    init(_ started: XCTestExpectation) { self.started = started }
    func resolve(_ uri: URL) async throws -> URL {
      try await withCheckedThrowingContinuation { pending = $0; started.fulfill() }
    }
    func finish(_ file: URL) { pending?.resume(returning: file); pending = nil }
  }
  private let remote = URL(string: "https://one.example/media/note")!
  private let firstFile = URL(fileURLWithPath: "/fixture/first.m4a")

  private func canceled(_ work: Task<Void, Error>, file: StaticString = #filePath, line: UInt = #line) async {
    do { try await work.value; XCTFail("Obsolete playback must be canceled", file: file, line: line) }
    catch is CancellationError {}
    catch { XCTFail("Unexpected playback error: \(error)", file: file, line: line) }
  }

  func testRemotePauseAndResumeUseTheSameResolvedFile() async throws {
    let player = Player(); var downloads = 0
    let service = AudioPlaybackService(playback: player, resolve: { _ in
      downloads += 1; return URL(fileURLWithPath: "/fixture/download-\(downloads).m4a")
    }, authorize: { _ in })
    try await service.play(remote, rate: 1); service.pause()
    try await service.play(remote, rate: 1.5)
    XCTAssertEqual(downloads, 1)
    XCTAssertEqual(player.files, [URL(fileURLWithPath: "/fixture/download-1.m4a"), URL(fileURLWithPath: "/fixture/download-1.m4a")])
    XCTAssertEqual(service.source, remote)
  }

  func testPauseInvalidatesAnAwaitingDownload() async throws {
    let player = Player(); let ready = expectation(description: "native source request started"); let held = HeldFile(ready)
    let service = AudioPlaybackService(playback: player, resolve: { try await held.resolve($0) }, authorize: { _ in })
    let work = Task { try await service.play(remote, rate: 1) }
    await fulfillment(of: [ready], timeout: 2)
    service.pause(); held.finish(firstFile)
    await canceled(work)
    XCTAssertTrue(player.files.isEmpty); XCTAssertNil(service.source)
  }

  func testStopInvalidatesAnAwaitingDownloadAndClearsTheSource() async throws {
    let player = Player(); let ready = expectation(description: "native source request started"); let held = HeldFile(ready)
    let service = AudioPlaybackService(playback: player, resolve: { try await held.resolve($0) }, authorize: { _ in })
    let work = Task { try await service.play(remote, rate: 1) }
    await fulfillment(of: [ready], timeout: 2)
    service.stop(); held.finish(firstFile)
    await canceled(work)
    XCTAssertTrue(player.stopped); XCTAssertTrue(player.files.isEmpty); XCTAssertNil(service.source)
  }

  func testAnOlderDownloadCannotReplaceTheNewerNote() async throws {
    let player = Player(); let ready = expectation(description: "older native source request started"); let held = HeldFile(ready)
    let newer = URL(string: "https://one.example/media/newer")!
    let newerFile = URL(fileURLWithPath: "/fixture/newer.m4a")
    let service = AudioPlaybackService(playback: player, resolve: { [remote] uri in
      if uri == remote { return try await held.resolve(uri) }
      return newerFile
    }, authorize: { _ in })
    let work = Task { try await service.play(remote, rate: 1) }
    await fulfillment(of: [ready], timeout: 2)
    try await service.play(newer, rate: 1)
    held.finish(firstFile); await canceled(work)
    XCTAssertEqual(player.files, [newerFile]); XCTAssertEqual(service.source, newer)
  }

  func testACachedNoteStillRequiresTheCurrentIdentity() async throws {
    let player = Player(); var authorized = true
    let service = AudioPlaybackService(playback: player, resolve: { [firstFile] _ in firstFile }, authorize: { _ in
      if !authorized { throw NativeFailure.unpaired }
    })
    try await service.play(remote, rate: 1); service.pause(); authorized = false
    do { try await service.play(remote, rate: 1); XCTFail("Cached media must not bypass identity validation") }
    catch NativeFailure.unpaired {}
    XCTAssertEqual(player.files, [firstFile])
  }

  func testAStopDropsTheResolvedFileBeforeTheNextPlay() async throws {
    let player = Player(); var downloads = 0
    let service = AudioPlaybackService(playback: player, resolve: { _ in
      downloads += 1; return URL(fileURLWithPath: "/fixture/download-\(downloads).m4a")
    }, authorize: { _ in })
    try await service.play(remote, rate: 1); service.stop()
    try await service.play(remote, rate: 1)
    XCTAssertEqual(player.files, [URL(fileURLWithPath: "/fixture/download-1.m4a"), URL(fileURLWithPath: "/fixture/download-2.m4a")])
  }
}
