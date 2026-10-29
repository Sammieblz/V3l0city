package com.v3l0city.speedengine

import kotlin.math.abs

private fun expect(actual: Double, expected: Double, name: String) {
  check(actual.isFinite() && abs(actual - expected) < 0.000001) { "$name: expected $expected, got $actual" }
}

/** Compile together with production LiveDriveProjection.kt; no Android/Expo dependencies. */
fun main() {
  var cases = 0
  fun baseline(distance: Double = 0.0, peak: Double = 0.0, counter: Double = 150.0): LiveDriveProjection {
    val projection = LiveDriveProjection()
    check(projection.synchronize("one", distance, peak, false, 1000.0, counter, 1000.0))
    return projection
  }

  val fresh = baseline()
  expect(fresh.distanceMeters, 0.0, "retained counter is not new-trip distance")
  fresh.observe(160.0, 10.0, 1100.0, true)
  expect(fresh.distanceMeters, 10.0, "new trip positive delta")
  expect(fresh.maxSpeedMps, 10.0, "current speed, not old cumulative peak")
  cases++

  for (counter in listOf(0.0, 150.0)) {
    val recovery = baseline(100.0, 25.0, counter)
    recovery.observe(counter + 10, 10.0, 1100.0, true)
    expect(recovery.distanceMeters, 110.0, "recovered counter $counter")
    expect(recovery.maxSpeedMps, 25.0, "full recovered peak survives")
    recovery.observe(counter + 20, 30.0, 1200.0, true)
    expect(recovery.maxSpeedMps, 30.0, "fresh new peak")
    cases++
  }

  val reset = baseline(100.0, 25.0)
  reset.observe(160.0, 5.0, 1100.0, true)
  reset.observe(0.0, 0.0, 1200.0, true)
  expect(reset.distanceMeters, 110.0, "counter reset preserves total")
  reset.observe(5.0, 5.0, 1300.0, true)
  expect(reset.distanceMeters, 115.0, "counter reset reanchors")
  cases++

  val cached = LiveDriveProjection()
  check(cached.synchronize("one", 100.0, 25.0, false, 1000.0, 150.0, 900.0))
  cached.observe(160.0, 10.0, 1100.0, true)
  expect(cached.distanceMeters, 100.0, "pre-boundary cache excluded")
  cached.observe(170.0, 10.0, 1200.0, true)
  expect(cached.distanceMeters, 110.0, "first actual event anchors")
  cases++

  val reconcile = baseline(100.0, 25.0)
  reconcile.observe(160.0, 30.0, 1100.0, true)
  check(reconcile.synchronize("one", 100.0, 20.0, false, 1100.0, 160.0, 1100.0))
  expect(reconcile.distanceMeters, 110.0, "same trip cannot rewind projected movement")
  expect(reconcile.maxSpeedMps, 30.0, "same trip cannot rewind actual peak")
  reconcile.observe(170.0, 5.0, 1200.0, true)
  expect(reconcile.distanceMeters, 120.0, "reconcile does not double count")
  cases++

  val refresh = baseline(100.0, 25.0)
  for (index in 1..3) {
    val counter = 150.0 + index * 10
    val timestamp = 1000.0 + index * 100
    refresh.observe(counter, 10.0, timestamp, true)
    check(refresh.synchronize("one", 100.0 + index * 10, 25.0, false, timestamp + 1, counter, timestamp))
  }
  expect(refresh.distanceMeters, 130.0, "repeated UI receipts cannot discard native intervals")
  check(refresh.synchronize("one", 150.0, 25.0, false, 1302.0, 180.0, 1300.0))
  refresh.observe(190.0, 10.0, 1400.0, true)
  expect(refresh.distanceMeters, 160.0, "confirmed advancement reanchors without double counting")
  cases++

  check(reconcile.synchronize("two", 0.0, 0.0, false, 2000.0, 170.0, 2000.0))
  expect(reconcile.distanceMeters, 0.0, "new trip resets old projection")
  expect(reconcile.maxSpeedMps, 0.0, "new trip excludes old peak")
  check(!reconcile.synchronize("one", 999.0, 999.0, false, 1500.0, 999.0, 1500.0))
  check(reconcile.tripId == "two")
  reconcile.observe(175.0, 5.0, 2100.0, true)
  expect(reconcile.distanceMeters, 5.0, "new trip has its own anchor")
  expect(reconcile.maxSpeedMps, 5.0, "old cumulative peak excluded")
  cases++

  val paused = baseline(100.0, 25.0)
  check(paused.synchronize("one", 100.0, 25.0, true, 2000.0, 150.0, 2000.0))
  paused.observe(190.0, 90.0, 2100.0, true)
  expect(paused.distanceMeters, 100.0, "paused distance frozen")
  expect(paused.maxSpeedMps, 25.0, "paused speed cannot raise peak")
  check(paused.synchronize("one", 100.0, 25.0, false, 3000.0, 190.0, 3000.0))
  paused.observe(200.0, 10.0, 3100.0, true)
  expect(paused.distanceMeters, 110.0, "pause interval excluded after resume")
  cases++

  val disabled = baseline(100.0, 25.0)
  disabled.setAccumulating(false, 1100.0)
  disabled.observe(190.0, 90.0, 1100.0, true)
  expect(disabled.distanceMeters, 100.0, "non-accumulating distance frozen")
  expect(disabled.maxSpeedMps, 25.0, "non-accumulating peak frozen")
  disabled.setAccumulating(true, 1200.0)
  disabled.observe(195.0, 99.0, 1150.0, true)
  disabled.observe(200.0, 10.0, 1200.0, true)
  expect(disabled.distanceMeters, 100.0, "accumulation transition reanchors")
  disabled.observe(210.0, 10.0, 1300.0, true)
  expect(disabled.distanceMeters, 110.0, "only resumed deltas count")
  cases++

  val ordered = baseline(100.0, 25.0)
  ordered.observe(999.0, 99.0, 900.0, true)
  ordered.observe(999.0, 99.0, 1000.0, true)
  ordered.observe(160.0, 10.0, 1100.0, true)
  expect(ordered.distanceMeters, 110.0, "old/duplicate events cannot move anchor")
  expect(ordered.maxSpeedMps, 25.0, "old/duplicate peak excluded")
  ordered.observe(50.0, 99.0, 50.0, false)
  ordered.observe(-1.0, 99.0, 50.0, true)
  ordered.observe(170.0, 10.0, 1150.0, true)
  expect(ordered.distanceMeters, 120.0, "old stale/invalid events cannot erase a newer anchor")
  ordered.observe(200.0, 99.0, 1200.0, false)
  ordered.observe(210.0, 10.0, 1300.0, true)
  expect(ordered.distanceMeters, 120.0, "stale interval cannot bridge counter")
  ordered.observe(220.0, 10.0, 1400.0, true)
  expect(ordered.distanceMeters, 130.0, "fresh reanchor after stale")
  expect(ordered.maxSpeedMps, 25.0, "stale peak excluded")
  cases++

  for (invalidSpeed in listOf(false, true)) {
    val delayed = baseline(100.0, 25.0)
    delayed.observe(160.0, 10.0, 1100.0, true)
    delayed.observe(200.0, if (invalidSpeed) Double.NaN else 99.0, 1300.0, invalidSpeed)
    delayed.observe(170.0, 99.0, 1200.0, true)
    delayed.observe(220.0, 10.0, 1400.0, true)
    expect(delayed.distanceMeters, 110.0, "delayed valid event cannot bridge a newer rejected interval")
    delayed.observe(230.0, 10.0, 1500.0, true)
    expect(delayed.distanceMeters, 120.0, "fresh post-gap anchor counts only subsequent movement")
    expect(delayed.maxSpeedMps, 25.0, "delayed and invalid peaks excluded")
    cases++
  }

  val invalid = baseline(100.0, 25.0)
  invalid.observe(Double.NaN, 99.0, 1100.0, true)
  invalid.observe(-1.0, 99.0, 1200.0, true)
  invalid.observe(160.0, Double.POSITIVE_INFINITY, 1300.0, true)
  expect(invalid.distanceMeters, 100.0, "invalid readings excluded")
  expect(invalid.maxSpeedMps, 25.0, "invalid peak excluded")
  check(!invalid.synchronize("bad", Double.NEGATIVE_INFINITY, 0.0, false, 2000.0, 0.0, 2000.0))
  check(invalid.tripId == "one")
  cases++

  println("Kotlin LiveDriveProjection: $cases scenarios passed")
}
