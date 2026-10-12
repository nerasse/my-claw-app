import Foundation
import Security
import MyClawNativeCore

@MainActor public final class PushSecureStorage: PushEnrollmentStore {
  private let service: String
  private var prepared = false
  public init(service: String) { self.service = service }
  public func prepareInstallation(_ identifier: String) throws {
    prepared = false
    guard !identifier.isEmpty else { throw NativeFailure.invalidParameter }
    if try read("installation") == Data(identifier.utf8) { prepared = true; return }
    var request: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service, kSecAttrSynchronizable as String: false]
#if os(macOS)
    request[kSecMatchLimit as String] = kSecMatchLimitAll
#endif
    let status = SecItemDelete(request as CFDictionary)
    if status != errSecItemNotFound { try check(status) }
    try write(Data(identifier.utf8), account: "installation")
    prepared = true
  }
  public func load() throws -> PushEnrollment? {
    try requirePrepared()
    guard let data = try read("enrollment") else { return nil }
    return try JSONDecoder().decode(PushEnrollment.self, from: data)
  }
  public func save(_ enrollment: PushEnrollment?) throws {
    try requirePrepared()
    if let enrollment { try write(JSONEncoder().encode(enrollment), account: "enrollment") }
    else { try remove("enrollment") }
  }
  public func key(relay: URL) throws -> String? {
    try requirePrepared()
    guard let data = try read("attest:" + relay.absoluteString), let key = String(data: data, encoding: .utf8) else { return nil }
    return key
  }
  public func saveKey(_ key: String, relay: URL) throws { try requirePrepared(); try write(Data(key.utf8), account: "attest:" + relay.absoluteString) }
  private func requirePrepared() throws { if !prepared { throw CocoaError(.fileReadNoPermission) } }
  private func query(_ account: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
      kSecAttrAccount as String: account, kSecAttrSynchronizable as String: false]
  }
  private func read(_ account: String) throws -> Data? {
    var request = query(account); request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
    var value: CFTypeRef?; let status = SecItemCopyMatching(request as CFDictionary, &value)
    if status == errSecItemNotFound { return nil }; try check(status)
    guard let data = value as? Data else { throw CocoaError(.fileReadCorruptFile) }; return data
  }
  private func write(_ data: Data, account: String) throws {
    let query = query(account)
    let attributes = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly] as [String: Any]
    let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound { try check(SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)) }
    else { try check(status) }
  }
  private func remove(_ account: String) throws {
    let status = SecItemDelete(query(account) as CFDictionary); if status != errSecItemNotFound { try check(status) }
  }
  private func check(_ status: OSStatus) throws { if status != errSecSuccess { throw NSError(domain: "MyClawPushStorage", code: Int(status)) } }
}
