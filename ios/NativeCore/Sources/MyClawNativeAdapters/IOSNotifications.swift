#if os(iOS)
import Foundation
import UIKit
@preconcurrency import UserNotifications
import MyClawNativeCore

@MainActor public final class IOSNotifications: NSObject, PushPermissionPort, UNUserNotificationCenterDelegate {
  public static let shared = IOSNotifications()
  public private(set) var token: String?
  public private(set) var hasRegistrationFailure = false
  public var tokenChanged: (() -> Void)?
  public var registrationFailed: (() -> Void)?
  public var openAvailable: (() -> Void)?
  public var accepts: ((PushOpen) -> Bool)?
  public var visibleThread: String?
  private var pendingOpen: PushOpen?
  private var registrationInFlight = false
  private override init() { super.init() }
  public func prepare() { UNUserNotificationCenter.current().delegate = self }
  public func registered(_ data: Data) {
    registrationInFlight = false; hasRegistrationFailure = false
    let next = data.map { String(format: "%02x", $0) }.joined()
    guard token != next else { return }
    token = next; tokenChanged?()
  }
  public func failed() {
    registrationInFlight = false
    let hadToken = token != nil
    let firstFailure = !hasRegistrationFailure
    token = nil; hasRegistrationFailure = true
    if hadToken { tokenChanged?() }
    if firstFailure { registrationFailed?() }
  }
  /// Explicit enable/foreground action; token callbacks and permission reads never call this.
  public func registerDevice() {
    guard !registrationInFlight else { return }
    registrationInFlight = true; hasRegistrationFailure = false
    UIApplication.shared.registerForRemoteNotifications()
  }
  public func authorization(request: Bool) async throws -> PushPermission {
    let center = UNUserNotificationCenter.current()
    var settings = await center.notificationSettings()
    if settings.authorizationStatus == .notDetermined && request {
      _ = try await center.requestAuthorization(options: [.alert, .sound, .badge])
      settings = await center.notificationSettings()
    }
    switch settings.authorizationStatus {
    case .authorized, .provisional, .ephemeral: return .granted
    case .denied: return .denied
    case .notDetermined: return .notDetermined
    @unknown default: return .unavailable
    }
  }
  public func takeOpen() -> PushOpen? {
    guard let pendingOpen, accepts?(pendingOpen) == true else { return nil }
    self.pendingOpen = nil; return pendingOpen
  }
  public func discardOpen() { pendingOpen = nil }
  /// UIKit supplies the cold-launch response in the scene connection options.
  /// Keep it until the current enrollment and the React Native listener are ready.
  public func handleSceneResponse(_ response: UNNotificationResponse) {
    guard let open = PushEnvelope.decode(response.notification.request.content.userInfo) else { return }
    receive(open)
  }
  public func dismiss(thread: String) async {
    let center = UNUserNotificationCenter.current()
    let notifications = await center.deliveredNotifications()
    let ids = notifications.compactMap { notification -> String? in
      guard let open = PushEnvelope.decode(notification.request.content.userInfo), accepts?(open) == true,
        open.target == .thread(thread) else { return nil }
      return notification.request.identifier
    }
    center.removeDeliveredNotifications(withIdentifiers: ids)
  }
  nonisolated public func userNotificationCenter(_ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping @Sendable () -> Void) {
    let open = PushEnvelope.decode(response.notification.request.content.userInfo)
    // The async Objective-C bridge completes on its executor after the actor hop.
    // iOS 27 performs UIKit restoration from this completion and requires main.
    Task { @MainActor in
      if let open { self.receive(open) }
      completionHandler()
    }
  }
  private func receive(_ open: PushOpen) { pendingOpen = open; openAvailable?() }
  nonisolated public func userNotificationCenter(_ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping @Sendable (UNNotificationPresentationOptions) -> Void) {
    let open = PushEnvelope.decode(notification.request.content.userInfo)
    Task { @MainActor in completionHandler(open.map(self.presentation) ?? []) }
  }
  private func presentation(_ open: PushOpen) -> UNNotificationPresentationOptions {
    guard accepts?(open) == true else { return [] }
    if case .thread(let id) = open.target, visibleThread == id { return [] }
    return [.banner, .list, .sound]
  }
}
#endif
