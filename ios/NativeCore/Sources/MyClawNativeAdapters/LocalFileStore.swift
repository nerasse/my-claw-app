import Foundation
import MyClawNativeCore

public actor LocalFileStore: FileAccess {
  private let directory: URL
  private let allowedRoot: URL
  public init(directory: URL, allowedRoot: URL) {
    self.directory = directory
    self.allowedRoot = allowedRoot.resolvingSymlinksInPath().standardizedFileURL
  }

  public func prepare(_ uri: URL) throws -> NativeFile {
    let file = try inspect(uri)
    return try adoptDownloaded(file.uri, name: file.name)
  }

  public func inspect(_ uri: URL) throws -> NativeFile {
    let resolved = uri.resolvingSymlinksInPath().standardizedFileURL
    guard uri.isFileURL, resolved.path.hasPrefix(allowedRoot.path + "/") else {
      throw CocoaError(.fileReadNoPermission)
    }
    return try metadata(resolved)
  }

  public func adoptDownloaded(_ uri: URL, name: String) throws -> NativeFile {
    guard uri.isFileURL else { throw CocoaError(.fileReadNoPermission) }
    _ = try metadata(uri)
    let folder = directory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let basename = URL(fileURLWithPath: name).lastPathComponent
      .components(separatedBy: .controlCharacters).joined()
    let safeName = String(basename.prefix(192))
    let destination = folder.appendingPathComponent(safeName.isEmpty || safeName == "." || safeName == ".." ? "file" : safeName)
    do {
      try FileManager.default.copyItem(at: uri, to: destination)
#if os(iOS)
      try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: destination.path)
#endif
      return try metadata(destination)
    } catch {
      try? FileManager.default.removeItem(at: folder)
      throw error
    }
  }

  private func metadata(_ uri: URL) throws -> NativeFile {
    let values = try uri.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard values.isRegularFile == true, let size = values.fileSize else { throw CocoaError(.fileReadUnsupportedScheme) }
    return NativeFile(uri: uri, name: uri.lastPathComponent, size: Int64(size))
  }
}
