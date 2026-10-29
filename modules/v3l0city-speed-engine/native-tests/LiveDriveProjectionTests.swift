// Compile with the production helper, without UIKit, CoreLocation or Expo.
private func expect(_ actual: Double, _ expected: Double, _ name: String) {
  precondition(actual.isFinite && abs(actual - expected) < 0.000001, "\(name): expected \(expected), got \(actual)")
}

@main
struct LiveDriveProjectionTests {
  static func main() {
    var cases = 0
    func baseline(_ distance: Double = 0, _ peak: Double = 0, _ counter: Double = 150) -> LiveDriveProjection {
      var projection = LiveDriveProjection()
      precondition(projection.synchronize(tripId: "one", distanceMeters: distance, maxSpeedMps: peak,
        paused: false, snapshotAtMs: 1000, nativeCounter: counter, nativeTimestampMs: 1000))
      return projection
    }

    var fresh = baseline()
    expect(fresh.distanceMeters, 0, "retained counter is not new-trip distance")
    fresh.observe(nativeCounter: 160, speedMps: 10, timestampMs: 1100, fresh: true)
    expect(fresh.distanceMeters, 10, "new trip positive delta")
    expect(fresh.maxSpeedMps, 10, "current speed, not old cumulative peak")
    cases += 1

    for counter in [0.0, 150.0] {
      var recovery = baseline(100, 25, counter)
      recovery.observe(nativeCounter: counter + 10, speedMps: 10, timestampMs: 1100, fresh: true)
      expect(recovery.distanceMeters, 110, "recovered counter \(counter)")
      expect(recovery.maxSpeedMps, 25, "full recovered peak survives")
      recovery.observe(nativeCounter: counter + 20, speedMps: 30, timestampMs: 1200, fresh: true)
      expect(recovery.maxSpeedMps, 30, "fresh new peak")
      cases += 1
    }

    var reset = baseline(100, 25)
    reset.observe(nativeCounter: 160, speedMps: 5, timestampMs: 1100, fresh: true)
    reset.observe(nativeCounter: 0, speedMps: 0, timestampMs: 1200, fresh: true)
    expect(reset.distanceMeters, 110, "counter reset preserves total")
    reset.observe(nativeCounter: 5, speedMps: 5, timestampMs: 1300, fresh: true)
    expect(reset.distanceMeters, 115, "counter reset reanchors")
    cases += 1

    var cached = LiveDriveProjection()
    precondition(cached.synchronize(tripId: "one", distanceMeters: 100, maxSpeedMps: 25,
      paused: false, snapshotAtMs: 1000, nativeCounter: 150, nativeTimestampMs: 900))
    cached.observe(nativeCounter: 160, speedMps: 10, timestampMs: 1100, fresh: true)
    expect(cached.distanceMeters, 100, "pre-boundary cache excluded")
    cached.observe(nativeCounter: 170, speedMps: 10, timestampMs: 1200, fresh: true)
    expect(cached.distanceMeters, 110, "first actual event anchors")
    cases += 1

    var reconcile = baseline(100, 25)
    reconcile.observe(nativeCounter: 160, speedMps: 30, timestampMs: 1100, fresh: true)
    precondition(reconcile.synchronize(tripId: "one", distanceMeters: 100, maxSpeedMps: 20,
      paused: false, snapshotAtMs: 1100, nativeCounter: 160, nativeTimestampMs: 1100))
    expect(reconcile.distanceMeters, 110, "same trip cannot rewind projected movement")
    expect(reconcile.maxSpeedMps, 30, "same trip cannot rewind actual peak")
    reconcile.observe(nativeCounter: 170, speedMps: 5, timestampMs: 1200, fresh: true)
    expect(reconcile.distanceMeters, 120, "reconcile does not double count")
    cases += 1

    var refresh = baseline(100, 25)
    for index in 1...3 {
      let counter = 150 + Double(index) * 10
      let timestamp = 1000 + Double(index) * 100
      refresh.observe(nativeCounter: counter, speedMps: 10, timestampMs: timestamp, fresh: true)
      precondition(refresh.synchronize(tripId: "one", distanceMeters: 100 + Double(index) * 10, maxSpeedMps: 25,
        paused: false, snapshotAtMs: timestamp + 1, nativeCounter: counter, nativeTimestampMs: timestamp))
    }
    expect(refresh.distanceMeters, 130, "repeated UI receipts cannot discard native intervals")
    precondition(refresh.synchronize(tripId: "one", distanceMeters: 150, maxSpeedMps: 25,
      paused: false, snapshotAtMs: 1302, nativeCounter: 180, nativeTimestampMs: 1300))
    refresh.observe(nativeCounter: 190, speedMps: 10, timestampMs: 1400, fresh: true)
    expect(refresh.distanceMeters, 160, "confirmed advancement reanchors without double counting")
    cases += 1

    precondition(reconcile.synchronize(tripId: "two", distanceMeters: 0, maxSpeedMps: 0,
      paused: false, snapshotAtMs: 2000, nativeCounter: 170, nativeTimestampMs: 2000))
    expect(reconcile.distanceMeters, 0, "new trip resets old projection")
    expect(reconcile.maxSpeedMps, 0, "new trip excludes old peak")
    precondition(!reconcile.synchronize(tripId: "one", distanceMeters: 999, maxSpeedMps: 999,
      paused: false, snapshotAtMs: 1500, nativeCounter: 999, nativeTimestampMs: 1500))
    precondition(reconcile.tripId == "two")
    reconcile.observe(nativeCounter: 175, speedMps: 5, timestampMs: 2100, fresh: true)
    expect(reconcile.distanceMeters, 5, "new trip has its own anchor")
    expect(reconcile.maxSpeedMps, 5, "old cumulative peak excluded")
    cases += 1

    var paused = baseline(100, 25)
    precondition(paused.synchronize(tripId: "one", distanceMeters: 100, maxSpeedMps: 25,
      paused: true, snapshotAtMs: 2000, nativeCounter: 150, nativeTimestampMs: 2000))
    paused.observe(nativeCounter: 190, speedMps: 90, timestampMs: 2100, fresh: true)
    expect(paused.distanceMeters, 100, "paused distance frozen")
    expect(paused.maxSpeedMps, 25, "paused speed cannot raise peak")
    precondition(paused.synchronize(tripId: "one", distanceMeters: 100, maxSpeedMps: 25,
      paused: false, snapshotAtMs: 3000, nativeCounter: 190, nativeTimestampMs: 3000))
    paused.observe(nativeCounter: 200, speedMps: 10, timestampMs: 3100, fresh: true)
    expect(paused.distanceMeters, 110, "pause interval excluded after resume")
    cases += 1

    var disabled = baseline(100, 25)
    disabled.setAccumulating(false, timestampMs: 1100)
    disabled.observe(nativeCounter: 190, speedMps: 90, timestampMs: 1100, fresh: true)
    expect(disabled.distanceMeters, 100, "non-accumulating distance frozen")
    expect(disabled.maxSpeedMps, 25, "non-accumulating peak frozen")
    disabled.setAccumulating(true, timestampMs: 1200)
    disabled.observe(nativeCounter: 195, speedMps: 99, timestampMs: 1150, fresh: true)
    disabled.observe(nativeCounter: 200, speedMps: 10, timestampMs: 1200, fresh: true)
    expect(disabled.distanceMeters, 100, "accumulation transition reanchors")
    disabled.observe(nativeCounter: 210, speedMps: 10, timestampMs: 1300, fresh: true)
    expect(disabled.distanceMeters, 110, "only resumed deltas count")
    cases += 1

    var ordered = baseline(100, 25)
    ordered.observe(nativeCounter: 999, speedMps: 99, timestampMs: 900, fresh: true)
    ordered.observe(nativeCounter: 999, speedMps: 99, timestampMs: 1000, fresh: true)
    ordered.observe(nativeCounter: 160, speedMps: 10, timestampMs: 1100, fresh: true)
    expect(ordered.distanceMeters, 110, "old/duplicate events cannot move anchor")
    expect(ordered.maxSpeedMps, 25, "old/duplicate peak excluded")
    ordered.observe(nativeCounter: 50, speedMps: 99, timestampMs: 50, fresh: false)
    ordered.observe(nativeCounter: -1, speedMps: 99, timestampMs: 50, fresh: true)
    ordered.observe(nativeCounter: 170, speedMps: 10, timestampMs: 1150, fresh: true)
    expect(ordered.distanceMeters, 120, "old stale/invalid events cannot erase a newer anchor")
    ordered.observe(nativeCounter: 200, speedMps: 99, timestampMs: 1200, fresh: false)
    ordered.observe(nativeCounter: 210, speedMps: 10, timestampMs: 1300, fresh: true)
    expect(ordered.distanceMeters, 120, "stale interval cannot bridge counter")
    ordered.observe(nativeCounter: 220, speedMps: 10, timestampMs: 1400, fresh: true)
    expect(ordered.distanceMeters, 130, "fresh reanchor after stale")
    expect(ordered.maxSpeedMps, 25, "stale peak excluded")
    cases += 1

    for invalidSpeed in [false, true] {
      var delayed = baseline(100, 25)
      delayed.observe(nativeCounter: 160, speedMps: 10, timestampMs: 1100, fresh: true)
      delayed.observe(nativeCounter: 200, speedMps: invalidSpeed ? .nan : 99, timestampMs: 1300, fresh: invalidSpeed)
      delayed.observe(nativeCounter: 170, speedMps: 99, timestampMs: 1200, fresh: true)
      delayed.observe(nativeCounter: 220, speedMps: 10, timestampMs: 1400, fresh: true)
      expect(delayed.distanceMeters, 110, "delayed valid event cannot bridge a newer rejected interval")
      delayed.observe(nativeCounter: 230, speedMps: 10, timestampMs: 1500, fresh: true)
      expect(delayed.distanceMeters, 120, "fresh post-gap anchor counts only subsequent movement")
      expect(delayed.maxSpeedMps, 25, "delayed and invalid peaks excluded")
      cases += 1
    }

    var invalid = baseline(100, 25)
    invalid.observe(nativeCounter: .nan, speedMps: 99, timestampMs: 1100, fresh: true)
    invalid.observe(nativeCounter: -1, speedMps: 99, timestampMs: 1200, fresh: true)
    invalid.observe(nativeCounter: 160, speedMps: .infinity, timestampMs: 1300, fresh: true)
    expect(invalid.distanceMeters, 100, "invalid readings excluded")
    expect(invalid.maxSpeedMps, 25, "invalid peak excluded")
    precondition(!invalid.synchronize(tripId: "bad", distanceMeters: -.infinity, maxSpeedMps: 0,
      paused: false, snapshotAtMs: 2000, nativeCounter: 0, nativeTimestampMs: 2000))
    precondition(invalid.tripId == "one")
    cases += 1

    print("Swift LiveDriveProjection: \(cases) scenarios passed")
  }
}
