import Foundation
import XCTest
@testable import MyClawNativeCore

final class MediaAuthorizationTests: XCTestCase {
  private let identity = DeviceIdentity(deviceId: "phone", token: "fixture-token", origin: "https://one.example")
  func testAStaleIdentityOrOriginCannotTransferToAnotherInstance() throws {
    XCTAssertThrowsError(try MediaAuthorization.authorize("https://two.example/media?device=phone&token=fixture-token", identity: identity))
    XCTAssertThrowsError(try MediaAuthorization.authorize("https://one.example/media?device=other&token=fixture-token", identity: identity))
    XCTAssertThrowsError(try MediaAuthorization.authorize("https://one.example/media?device=phone&token=old-token", identity: identity))
  }
  func testCredentialsAreUnambiguousAndTLSIsRequired() throws {
    XCTAssertThrowsError(try MediaAuthorization.authorize("https://one.example/media?device=phone&token=fixture-token&token=old", identity: identity))
    XCTAssertThrowsError(try MediaAuthorization.authorize("http://one.example/media?device=phone&token=fixture-token", identity: identity))
    let url = try MediaAuthorization.authorize("https://one.example/media", identity: identity)
    XCTAssertEqual(url.url?.path, "/media")
    XCTAssertEqual(url.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-token")
    XCTAssertEqual(url.value(forHTTPHeaderField: "X-My-Claw-Device"), "phone")
  }
  func testOnlyTheCurrentInstancesTicketCanBeUsed() throws {
    let raw = "https://one.example/media/id?ticket=read-ticket"
    XCTAssertThrowsError(try MediaAuthorization.authorize(raw, identity: identity))
    XCTAssertThrowsError(try MediaAuthorization.authorize(raw, identity: identity, ticket: "old-ticket"))
    XCTAssertThrowsError(try MediaAuthorization.authorize(raw + "&ticket=read-ticket", identity: identity, ticket: "read-ticket"))
    let request = try MediaAuthorization.authorize(raw, identity: identity, ticket: "read-ticket")
    XCTAssertEqual(request.url?.absoluteString, raw)
    XCTAssertFalse(request.url!.absoluteString.contains(identity.token))
  }
}

@MainActor private final class TransferIdentity {
  var value = DeviceIdentity(deviceId: "phone", token: "fixture-token", origin: "https://one.example")
  func replace() { value = DeviceIdentity(deviceId: "other-phone", token: "new-token", origin: value.origin) }
}

private struct TransferFiles: FileAccess {
  var beforeInspect: @Sendable () async -> Void = {}
  var beforeAdopt: @Sendable () async -> Void = {}
  func prepare(_ uri: URL) async throws -> NativeFile { NativeFile(uri: uri, name: "note.txt", size: 1) }
  func inspect(_ uri: URL) async throws -> NativeFile { await beforeInspect(); return try await prepare(uri) }
  func adoptDownloaded(_ uri: URL, name: String) async throws -> NativeFile { await beforeAdopt(); return try await prepare(uri) }
}
private struct TransferTransport: MediaTransport {
  var beforeDownloadFinishes: @Sendable () async -> Void = {}
  func upload(file: NativeFile, request: URLRequest, type: String, threadId: String, transferId: String,
    progress: @escaping @Sendable (TransferProgress) -> Void) async throws -> UploadResponse { UploadResponse(status: 200, body: "{}") }
  func download(request: URLRequest, transferId: String,
    progress: @escaping @Sendable (TransferProgress) -> Void) async throws -> URL {
    await beforeDownloadFinishes(); return URL(fileURLWithPath: "/tmp/synthetic-transfer")
  }
  func discardDownload(_ uri: URL) {}
}
@MainActor private struct TransferDocuments: DocumentSelection {
  func select() async throws -> [NativeFile] { [] }
  func export(_ file: NativeFile) async throws -> URL? { nil }
}
@MainActor private struct TransferGallery: GalleryExport {
  func save(_ file: NativeFile) async throws {}
}

@MainActor final class FileServiceScopeTests: XCTestCase {
  private func service(_ scope: TransferIdentity, files: TransferFiles = TransferFiles(),
    transport: TransferTransport = TransferTransport()) -> FileService {
    FileService(files: files, transport: transport, documents: TransferDocuments(), gallery: TransferGallery(),
      authorize: { try MediaAuthorization.authorize($0, identity: scope.value) }, progress: { _ in })
  }
  func testReplacingCredentialsDuringFilePreparationRejectsTheOldUpload() async throws {
    let scope = TransferIdentity()
    let files = TransferFiles(beforeInspect: { await scope.replace() })
    do {
      _ = try await service(scope, files: files).upload(uri: URL(fileURLWithPath: "/tmp/synthetic-transfer"),
        address: "https://one.example/media/upload", name: "note.txt", type: "file", threadId: "fixture", id: "upload")
      XCTFail("The previous identity must not upload after it was replaced")
    } catch { XCTAssertEqual(error as? NativeFailure, .instanceMismatch) }
  }
  func testReplacingCredentialsDuringDownloadRejectsCachingThePreviousIdentitysFile() async throws {
    let scope = TransferIdentity()
    let transport = TransferTransport(beforeDownloadFinishes: { await scope.replace() })
    do {
      _ = try await service(scope, transport: transport).cache(address: "https://one.example/media/fixture", name: "note.txt", id: "download")
      XCTFail("The previous identity's download must not enter the new identity's cache")
    } catch { XCTAssertEqual(error as? NativeFailure, .instanceMismatch) }
  }
  func testReplacingCredentialsDuringCachePreparationRejectsReturningThePreviousFile() async throws {
    let scope = TransferIdentity()
    let files = TransferFiles(beforeAdopt: { await scope.replace() })
    do {
      _ = try await service(scope, files: files).cache(address: "https://one.example/media/fixture", name: "note.txt", id: "download")
      XCTFail("The previous file must not be returned after its identity changes")
    } catch { XCTAssertEqual(error as? NativeFailure, .instanceMismatch) }
  }
}
