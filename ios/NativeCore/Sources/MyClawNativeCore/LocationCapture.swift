import Foundation

public struct LocationFix: Sendable {
  public let latitude: Double
  public let longitude: Double
  public let accuracyMeters: Double
  public let capturedAt: Date
  public let altitudeMeters: Double?
  public let headingDegrees: Double?
  public let speedMetersPerSecond: Double?
  public init(latitude: Double, longitude: Double, accuracyMeters: Double, capturedAt: Date,
    altitudeMeters: Double?, headingDegrees: Double?, speedMetersPerSecond: Double?) {
    self.latitude = latitude; self.longitude = longitude; self.accuracyMeters = accuracyMeters
    self.capturedAt = capturedAt; self.altitudeMeters = altitudeMeters
    self.headingDegrees = headingDegrees; self.speedMetersPerSecond = speedMetersPerSecond
  }
}

@MainActor public protocol LocationCapture { func current() async throws -> LocationFix }
