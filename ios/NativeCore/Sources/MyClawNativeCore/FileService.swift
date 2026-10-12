import Foundation

@MainActor public protocol DocumentSelection {
  func select() async throws -> [NativeFile]
  func export(_ file: NativeFile) async throws -> URL?
}

@MainActor public protocol GalleryExport {
  func save(_ file: NativeFile) async throws
}

@MainActor public final class FileService {
  private let files: any FileAccess
  private let transport: any MediaTransport
  private let documents: any DocumentSelection
  private let gallery: any GalleryExport
  private let authorize: (String) throws -> URLRequest
  private let progress: @Sendable (TransferProgress) -> Void

  public init(files: any FileAccess, transport: any MediaTransport, documents: any DocumentSelection,
    gallery: any GalleryExport, authorize: @escaping (String) throws -> URLRequest,
    progress: @escaping @Sendable (TransferProgress) -> Void) {
    self.files = files; self.transport = transport; self.documents = documents; self.gallery = gallery
    self.authorize = authorize; self.progress = progress
  }

  public func select() async throws -> [NativeFile] { try await documents.select() }
  public func prepare(_ uri: URL) async throws -> NativeFile { try await files.prepare(uri) }

  public func upload(uri: URL, address: String, name: String, type: String, threadId: String, id: String) async throws -> UploadResponse {
    let request = try authorize(address)
    let local = try await files.inspect(uri)
    guard try authorize(address) == request else { throw NativeFailure.instanceMismatch }
    return try await transport.upload(file: NativeFile(uri: local.uri, name: name, size: local.size), request: request,
      type: type, threadId: threadId, transferId: id, progress: progress)
  }

  public func cache(address: String, name: String, id: String) async throws -> NativeFile {
    let request = try authorize(address)
    let temporary = try await transport.download(request: request, transferId: id, progress: progress)
    defer { transport.discardDownload(temporary) }
    guard try authorize(address) == request else { throw NativeFailure.instanceMismatch }
    let cached = try await files.adoptDownloaded(temporary, name: name)
    guard try authorize(address) == request else { throw NativeFailure.instanceMismatch }
    return cached
  }

  public func save(address: String, name: String, id: String) async throws -> URL? {
    let file = try await cache(address: address, name: name, id: id)
    return try await documents.export(file)
  }

  public func download(address: String, name: String, toGallery: Bool, id: String) async throws -> URL? {
    let file = try await cache(address: address, name: name, id: id)
    if toGallery { try await gallery.save(file); return file.uri }
    return try await documents.export(file)
  }
}
