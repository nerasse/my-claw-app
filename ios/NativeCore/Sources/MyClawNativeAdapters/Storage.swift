import Foundation
import CryptoKit
import Security
import MyClawNativeCore

public final class JSONOutboxStore: OutboxStore {
  private let directory: URL
  public init(directory: URL) { self.directory = directory }
  private func location(_ origin: String) -> URL {
    let hash = SHA256.hash(data: Data(origin.utf8)).map { String(format: "%02x", $0) }.joined()
    return directory.appendingPathComponent(hash + ".json")
  }
  public func load(origin: String) throws -> [PendingFrame] {
    do { return try JSONDecoder().decode([PendingFrame].self, from: Data(contentsOf: location(origin))) }
    catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoSuchFileError {
      return []
    }
  }
  public func save(_ frames: [PendingFrame], origin: String) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let data = try JSONEncoder().encode(frames)
#if os(iOS)
    try data.write(to: location(origin), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
#else
    try data.write(to: location(origin), options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: location(origin).path)
#endif
  }
}

public final class KeychainIdentityStore: IdentityStore {
  private let service: String
  public init(service: String) { self.service = service }

  private func query(_ origin: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
     kSecAttrService as String: service,
     kSecAttrAccount as String: origin,
     kSecAttrSynchronizable as String: false]
  }

  public func load(origin: String) throws -> DeviceIdentity? {
    var request = query(origin)
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(request as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    try check(status)
    guard let data = result as? Data else { throw CocoaError(.fileReadCorruptFile) }
    let identity = try JSONDecoder().decode(DeviceIdentity.self, from: data)
    guard identity.origin == origin else { throw NativeFailure.instanceMismatch }
    return identity
  }

  public func save(_ identity: DeviceIdentity) throws {
    guard !identity.deviceId.isEmpty, !identity.token.isEmpty else { throw NativeFailure.unpaired }
    let data = try JSONEncoder().encode(identity)
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    ]
    let request = query(identity.origin)
    let updated = SecItemUpdate(request as CFDictionary, attributes as CFDictionary)
    if updated == errSecItemNotFound {
      try check(SecItemAdd(request.merging(attributes) { _, new in new } as CFDictionary, nil))
    } else {
      try check(updated)
    }
  }

  public func remove(origin: String) throws {
    let status = SecItemDelete(query(origin) as CFDictionary)
    if status != errSecItemNotFound { try check(status) }
  }

  private func check(_ status: OSStatus) throws {
    guard status == errSecSuccess else {
      throw NSError(domain: "MyClawSecureStorage", code: Int(status), userInfo: [
        NSLocalizedDescriptionKey: "Secure storage unavailable"
      ])
    }
  }
}
