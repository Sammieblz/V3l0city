// Pure glance-session arithmetic. This is presentation state, never a durable
// recording or a location collector. Callers serialize access with session state.
struct LiveDriveProjection {
  private(set) var tripId: String?
  private(set) var distanceMeters = 0.0
  private(set) var maxSpeedMps = 0.0
  private var hasSession = false
  private var paused = false
  private var accumulating = true
  private var snapshotAtMs = 0.0
  private var lastEventAtMs = 0.0
  private var segmentBoundaryMs = 0.0
  private var lastCounter: Double?

  mutating func setAccumulating(_ active: Bool, timestampMs: Double? = nil) {
    if accumulating != active {
      lastCounter = nil
      if let timestamp = timestampMs, timestamp.isFinite, timestamp > 0 {
        segmentBoundaryMs = max(segmentBoundaryMs, timestamp)
      }
    }
    accumulating = active
  }

  @discardableResult
  mutating func synchronize(tripId: String?, distanceMeters: Double, maxSpeedMps: Double,
                            paused: Bool, snapshotAtMs: Double,
                            nativeCounter: Double?, nativeTimestampMs: Double?) -> Bool {
    guard distanceMeters.isFinite, distanceMeters >= 0, maxSpeedMps.isFinite, maxSpeedMps >= 0,
          snapshotAtMs.isFinite, snapshotAtMs > 0,
          !hasSession || snapshotAtMs >= self.snapshotAtMs else { return false }
    let sameTrip = hasSession && self.tripId == tripId
    let phaseChanged = sameTrip && self.paused != paused
    let confirmedAdvance = sameTrip && distanceMeters > self.distanceMeters
    self.tripId = tripId
    self.distanceMeters = sameTrip ? max(self.distanceMeters, distanceMeters) : distanceMeters
    self.maxSpeedMps = sameTrip ? max(self.maxSpeedMps, maxSpeedMps) : maxSpeedMps
    self.paused = paused
    self.snapshotAtMs = snapshotAtMs
    hasSession = true
    // UI receipt order and sensor event order are separate. Routine same-phase
    // refreshes must not discard a valid counter or one interval on every tick.
    if sameTrip && !phaseChanged && !confirmedAdvance { return true }
    if !sameTrip || phaseChanged {
      segmentBoundaryMs = snapshotAtMs
      lastEventAtMs = sameTrip ? max(lastEventAtMs, snapshotAtMs) : snapshotAtMs
    }
    // A cached counter from before the JS boundary cannot identify movement at
    // Start/Resume. Wait for a real post-boundary event instead of importing it.
    if let counter = nativeCounter, let timestamp = nativeTimestampMs,
       counter.isFinite, counter >= 0, timestamp.isFinite, timestamp >= lastEventAtMs {
      lastCounter = counter
      lastEventAtMs = timestamp
    } else {
      lastCounter = nil
      segmentBoundaryMs = max(segmentBoundaryMs, snapshotAtMs)
    }
    return true
  }

  mutating func observe(nativeCounter: Double, speedMps: Double, timestampMs: Double, fresh: Bool) {
    guard hasSession, timestampMs.isFinite, timestampMs > lastEventAtMs,
          timestampMs >= segmentBoundaryMs else { return }
    lastEventAtMs = timestampMs
    guard fresh, nativeCounter.isFinite, nativeCounter >= 0, speedMps.isFinite, speedMps >= 0 else {
      // Invalid/stale events cannot supply a bridge across an unknown interval.
      lastCounter = nil
      return
    }
    defer { lastCounter = nativeCounter }
    guard !paused && accumulating else { return }
    if let counter = lastCounter, nativeCounter >= counter {
      let next = distanceMeters + nativeCounter - counter
      if next.isFinite { distanceMeters = next }
    }
    // A counter drop is a reset: retain the last total and re-anchor, rather
    // than subtracting distance or adding an entire new native lifetime total.
    maxSpeedMps = max(maxSpeedMps, speedMps)
  }
}
