package com.v3l0city.speedengine

import kotlin.math.max

/** Glance-only arithmetic; not durable recording or another location collector.
 * Callers serialize access together with their session metadata. */
internal class LiveDriveProjection {
  var tripId: String? = null
    private set
  var distanceMeters = 0.0
    private set
  var maxSpeedMps = 0.0
    private set
  private var hasSession = false
  private var paused = false
  private var accumulating = true
  private var snapshotAtMs = 0.0
  private var lastEventAtMs = 0.0
  private var segmentBoundaryMs = 0.0
  private var lastCounter: Double? = null

  fun setAccumulating(active: Boolean, timestampMs: Double? = null) {
    if (accumulating != active) {
      lastCounter = null
      if (timestampMs != null && timestampMs.isFinite() && timestampMs > 0) {
        segmentBoundaryMs = max(segmentBoundaryMs, timestampMs)
      }
    }
    accumulating = active
  }

  fun synchronize(tripId: String?, distanceMeters: Double, maxSpeedMps: Double,
                  paused: Boolean, snapshotAtMs: Double,
                  nativeCounter: Double?, nativeTimestampMs: Double?): Boolean {
    if (!distanceMeters.isFinite() || distanceMeters < 0 || !maxSpeedMps.isFinite() || maxSpeedMps < 0 ||
      !snapshotAtMs.isFinite() || snapshotAtMs <= 0 || (hasSession && snapshotAtMs < this.snapshotAtMs)) return false
    val sameTrip = hasSession && this.tripId == tripId
    val phaseChanged = sameTrip && this.paused != paused
    val confirmedAdvance = sameTrip && distanceMeters > this.distanceMeters
    this.tripId = tripId
    this.distanceMeters = if (sameTrip) max(this.distanceMeters, distanceMeters) else distanceMeters
    this.maxSpeedMps = if (sameTrip) max(this.maxSpeedMps, maxSpeedMps) else maxSpeedMps
    this.paused = paused
    this.snapshotAtMs = snapshotAtMs
    hasSession = true
    // Routine UI refreshes do not move the separate sensor event watermark.
    if (sameTrip && !phaseChanged && !confirmedAdvance) return true
    if (!sameTrip || phaseChanged) {
      segmentBoundaryMs = snapshotAtMs
      lastEventAtMs = if (sameTrip) max(lastEventAtMs, snapshotAtMs) else snapshotAtMs
    }
    // Pre-boundary cached counters cannot identify movement at Start/Resume.
    if (nativeCounter != null && nativeTimestampMs != null && nativeCounter.isFinite() && nativeCounter >= 0 &&
      nativeTimestampMs.isFinite() && nativeTimestampMs >= lastEventAtMs) {
      lastCounter = nativeCounter
      lastEventAtMs = nativeTimestampMs
    } else {
      lastCounter = null
      segmentBoundaryMs = max(segmentBoundaryMs, snapshotAtMs)
    }
    return true
  }

  fun observe(nativeCounter: Double, speedMps: Double, timestampMs: Double, fresh: Boolean) {
    if (!hasSession || !timestampMs.isFinite() || timestampMs <= lastEventAtMs || timestampMs < segmentBoundaryMs) return
    lastEventAtMs = timestampMs
    if (!fresh || !nativeCounter.isFinite() || nativeCounter < 0 || !speedMps.isFinite() || speedMps < 0) {
      lastCounter = null
      return
    }
    if (!paused && accumulating) {
      lastCounter?.let { counter ->
        if (nativeCounter >= counter) {
          val next = distanceMeters + nativeCounter - counter
          if (next.isFinite()) distanceMeters = next
        }
      }
      // Retain the confirmed peak; engine cumulative peaks may belong to an old trip.
      maxSpeedMps = max(maxSpeedMps, speedMps)
    }
    // Counter resets re-anchor without reducing the total or importing a lifetime total.
    lastCounter = nativeCounter
  }
}
