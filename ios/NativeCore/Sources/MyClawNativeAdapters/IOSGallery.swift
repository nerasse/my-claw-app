#if os(iOS)
import Foundation
import Photos
import UniformTypeIdentifiers
import MyClawNativeCore

@MainActor public struct IOSGallery: GalleryExport {
  public init() {}
  public func save(_ file: NativeFile) async throws {
    let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    guard status == .authorized || status == .limited else { throw CocoaError(.fileWriteNoPermission) }
    let kind = UTType(filenameExtension: file.uri.pathExtension)
    guard kind?.conforms(to: .image) == true || kind?.conforms(to: .movie) == true else {
      throw CocoaError(.fileWriteUnsupportedScheme)
    }
    try await PHPhotoLibrary.shared().performChanges(Self.assetChanges(uri: file.uri, movie: kind?.conforms(to: .movie) == true))
  }

  // Photos runs this block on its transaction queue. Constructing it inside
  // the MainActor-isolated save method makes Swift enforce the wrong executor.
  nonisolated private static func assetChanges(uri: URL, movie: Bool) -> @Sendable () -> Void {
    return {
      if movie { PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: uri) }
      else { PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: uri) }
    }
  }
}
#endif
