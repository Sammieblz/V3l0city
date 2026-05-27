package com.v3l0city.speedengine

internal object SpeedEngineJni {
  init {
    System.loadLibrary("v3l0cityspeedengine")
  }

  external fun create(): Long
  external fun destroy(handle: Long)
  external fun setOptions(
    handle: Long,
    staleTimeoutMs: Double,
    outputRateHz: Double,
    mountOffsetDegrees: Double,
    accumulateTrip: Boolean
  )
  external fun reset(handle: Long): Map<String, Any?>?
  external fun setTripAccumulation(handle: Long, active: Boolean)
  external fun setMountOffsetDegrees(handle: Long, value: Double)
  external fun onLocation(
    handle: Long,
    latitude: Double,
    longitude: Double,
    accuracyMeters: Double,
    nativeSpeedMps: Double,
    timestampMs: Double,
    courseDegrees: Double,
    courseAccuracyDegrees: Double
  ): Map<String, Any?>?
  external fun onHeading(
    handle: Long,
    headingDegrees: Double,
    timestampMs: Double,
    accuracyDegrees: Double
  ): Map<String, Any?>?
  external fun onImu(
    handle: Long,
    forwardAccelerationMps2: Double,
    timestampMs: Double
  ): Map<String, Any?>?
  external fun checkStale(handle: Long, timestampMs: Double): Map<String, Any?>?
  external fun currentState(handle: Long): Map<String, Any?>?
}
