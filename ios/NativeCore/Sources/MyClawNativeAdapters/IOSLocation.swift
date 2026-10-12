#if os(iOS)
import Foundation
import CoreLocation
import UIKit
import MyClawNativeCore

@MainActor public final class IOSLocation: NSObject, LocationCapture, CLLocationManagerDelegate {
  private let manager = CLLocationManager()
  private var waiting: CheckedContinuation<LocationFix, any Error>?
  private var timeout: (any ScheduledAction)?
  private var best: LocationFix?
  public override init() { super.init(); manager.delegate = self; manager.desiredAccuracy = kCLLocationAccuracyHundredMeters }

  public func current() async throws -> LocationFix {
    guard UIApplication.shared.applicationState == .active, waiting == nil else { throw CocoaError(.userCancelled) }
    return try await withCheckedThrowingContinuation { continuation in
      waiting = continuation
      best = nil
      timeout = DispatchConnectionScheduler().schedule(after: 8) { [weak self] in
        guard let self else { return }
        if let best { complete(.success(best)) } else { complete(.failure(URLError(.timedOut))) }
      }
      authorize()
    }
  }

  private func authorize() {
    guard waiting != nil else { return }
    switch manager.authorizationStatus {
    case .authorizedWhenInUse, .authorizedAlways: manager.startUpdatingLocation()
    case .notDetermined: manager.requestWhenInUseAuthorization()
    case .denied, .restricted: complete(.failure(CocoaError(.fileReadNoPermission)))
    @unknown default: complete(.failure(CocoaError(.fileReadNoPermission)))
    }
  }
  private func complete(_ result: Result<LocationFix, any Error>) {
    let continuation = waiting
    waiting = nil
    timeout?.cancel(); timeout = nil
    manager.stopUpdatingLocation()
    continuation?.resume(with: result)
  }
  private func received(_ fix: LocationFix) {
    guard waiting != nil, fix.accuracyMeters >= 0, abs(fix.capturedAt.timeIntervalSinceNow) <= 30 else { return }
    if best == nil || fix.accuracyMeters < (best?.accuracyMeters ?? .infinity) { best = fix }
    if fix.accuracyMeters <= 100 { complete(.success(fix)) }
  }

  nonisolated public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    Task { @MainActor [weak self] in self?.authorize() }
  }
  nonisolated public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last else { return }
    let fix = LocationFix(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude,
      accuracyMeters: location.horizontalAccuracy, capturedAt: location.timestamp,
      altitudeMeters: location.verticalAccuracy >= 0 ? location.altitude : nil,
      headingDegrees: location.course >= 0 ? location.course : nil,
      speedMetersPerSecond: location.speed >= 0 ? location.speed : nil)
    Task { @MainActor [weak self] in self?.received(fix) }
  }
  nonisolated public func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
    let denied = (error as? CLError)?.code == .denied
    if denied { Task { @MainActor [weak self] in self?.complete(.failure(CocoaError(.fileReadNoPermission))) } }
  }
}
#endif
