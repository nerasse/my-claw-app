import Foundation
import CryptoKit
import Security
import MyClawNativeCore

public final class EncryptedOutboxStore: OutboxStore {
  private let directory: URL
  private let service: String
  public init(directory: URL, service: String) { self.directory = directory; self.service = service }
  private func location(_ origin: String) -> URL {
    let hash = SHA256.hash(data: Data(origin.utf8)).map { String(format: "%02x", $0) }.joined()
    return directory.appendingPathComponent(hash + ".sealed")
  }
  public func load(origin: String) throws -> [PendingFrame] {
    let bytes: Data
    do { bytes = try Data(contentsOf: location(origin)) }
    catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoSuchFileError { return [] }
    let box = try AES.GCM.SealedBox(combined: bytes)
    let plaintext = try AES.GCM.open(box, using: key(origin), authenticating: Data(origin.utf8))
    return try JSONDecoder().decode([PendingFrame].self, from: plaintext)
  }
  public func save(_ frames: [PendingFrame], origin: String) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var folder = directory; var resources = URLResourceValues(); resources.isExcludedFromBackup = true
    try folder.setResourceValues(resources)
    let box = try AES.GCM.seal(JSONEncoder().encode(frames), using: key(origin), authenticating: Data(origin.utf8))
    guard let bytes = box.combined else { throw CocoaError(.fileWriteUnknown) }
#if os(iOS)
    try bytes.write(to: location(origin), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
#else
    try bytes.write(to: location(origin), options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: location(origin).path)
#endif
  }
  private func key(_ origin: String) throws -> SymmetricKey {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
      kSecAttrAccount as String: origin, kSecAttrSynchronizable as String: false]
    var request = query; request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?; let status = SecItemCopyMatching(request as CFDictionary, &result)
    if status == errSecSuccess, let data = result as? Data, data.count == 32 { return SymmetricKey(data: data) }
    guard status == errSecItemNotFound else { throw NSError(domain: "MyClawOutboxKey", code: Int(status)) }
    let key = SymmetricKey(size: .bits256)
    let attributes: [String: Any] = [kSecValueData as String: key.withUnsafeBytes { Data($0) },
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
    let inserted = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
    guard inserted == errSecSuccess else { throw NSError(domain: "MyClawOutboxKey", code: Int(inserted)) }; return key
  }
}
