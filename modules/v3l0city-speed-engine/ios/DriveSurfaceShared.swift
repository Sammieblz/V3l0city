import Foundation

#if canImport(ActivityKit)
import ActivityKit
#endif

let v3l0cityDriveSurfaceAppGroup = "group.com.v3l0city.app"
let v3l0cityDriveSurfaceSnapshotKey = "driveSurfaceSnapshot"

struct V3l0cityDriveSurfaceSnapshot: Codable, Hashable {
  let schemaVersion: Int
  let tripId: String?
  let tripActive: Bool
  let tripPaused: Bool
  let speedMps: Double
  let speedText: String
  let units: String
  let distanceMeters: Double
  let distanceText: String
  let averageSpeedMps: Double
  let averageSpeedText: String?
  let maxSpeedMps: Double
  let maxSpeedText: String?
  let elapsedMs: Double
  let elapsedText: String
  let headingDegrees: Double?
  let headingText: String
  let headingSource: String
  let headingQuality: String
  let signalQuality: String
  let signalText: String
  let stale: Bool
  let permissionStatus: String
  let updatedAtMs: Double
  let simulationActive: Bool?
}

func v3l0cityDriveSurfaceDefaults() -> UserDefaults {
  UserDefaults(suiteName: v3l0cityDriveSurfaceAppGroup) ?? .standard
}

func v3l0cityDriveSurfaceSnapshotFromDefaults(now: Date = Date()) -> V3l0cityDriveSurfaceSnapshot? {
  guard
    let json = v3l0cityDriveSurfaceDefaults().string(forKey: v3l0cityDriveSurfaceSnapshotKey),
    let data = json.data(using: .utf8),
    let snapshot = try? JSONDecoder().decode(V3l0cityDriveSurfaceSnapshot.self, from: data)
  else {
    return nil
  }

  if snapshot.stale || now.timeIntervalSince1970 * 1000.0 - snapshot.updatedAtMs > 5000.0 {
    return nil
  }

  return snapshot
}

#if canImport(ActivityKit)
@available(iOS 16.2, *)
struct V3l0cityTripActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    let speedText: String
    let units: String
    let distanceText: String
    let elapsedText: String
    let headingText: String
    let signalText: String
    let isStale: Bool
    let tripActive: Bool
    let updatedAtMs: Double
  }

  let tripId: String
  let startedAtMs: Double
}
#endif
