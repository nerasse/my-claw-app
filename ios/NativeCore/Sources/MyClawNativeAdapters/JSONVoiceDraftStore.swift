import Foundation
import CryptoKit
import MyClawNativeCore

public final class JSONVoiceDraftStore: VoiceDraftStore {
  private let directory: URL
  public init(directory: URL) { self.directory = directory }
  private func file(_ origin: String) -> URL {
    let hash = SHA256.hash(data: Data(origin.utf8)).map { String(format: "%02x", $0) }.joined()
    return directory.appendingPathComponent(hash + ".json")
  }
  public func load(origin: String) throws -> [VoiceDraft] {
    do {
      let values = try JSONDecoder().decode([VoiceDraft].self, from: Data(contentsOf: file(origin)))
      guard values.allSatisfy({ $0.origin == origin }) else { throw NativeFailure.instanceMismatch }
      return values
    } catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoSuchFileError { return [] }
  }
  public func save(_ drafts: [VoiceDraft], origin: String) throws {
    guard drafts.allSatisfy({ $0.origin == origin }) else { throw NativeFailure.instanceMismatch }
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let data = try JSONEncoder().encode(drafts)
#if os(iOS)
    try data.write(to: file(origin), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
#else
    try data.write(to: file(origin), options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file(origin).path)
#endif
  }
}
