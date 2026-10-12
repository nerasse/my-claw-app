#if os(iOS)
import Foundation
import DeviceCheck
import MyClawNativeCore

@MainActor public final class IOSAppAttest: AppAttestPort {
  public init() {}
  public var supported: Bool { DCAppAttestService.shared.isSupported }
  public func generateKey() async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      DCAppAttestService.shared.generateKey { key, error in
        if let key { continuation.resume(returning: key) }
        else { continuation.resume(throwing: error ?? CocoaError(.featureUnsupported)) }
      }
    }
  }
  public func attest(key: String, hash: Data) async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
      DCAppAttestService.shared.attestKey(key, clientDataHash: hash) { value, error in
        if let value { continuation.resume(returning: value) }
        else { continuation.resume(throwing: error ?? CocoaError(.featureUnsupported)) }
      }
    }
  }
  public func assertion(key: String, hash: Data) async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
      DCAppAttestService.shared.generateAssertion(key, clientDataHash: hash) { value, error in
        if let value { continuation.resume(returning: value) }
        else { continuation.resume(throwing: error ?? CocoaError(.featureUnsupported)) }
      }
    }
  }
}
#endif
