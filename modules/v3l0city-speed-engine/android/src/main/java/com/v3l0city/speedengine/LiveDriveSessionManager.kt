package com.v3l0city.speedengine

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

private const val LOG_TAG = "V3l0cityLiveDrive"
private const val DRIVE_SURFACE_PUBLISH_INTERVAL_MS = 1000L
private const val SIMULATED_DRIVE_TICK_MS = 1000L
private const val SIMULATED_DRIVE_LOOP_SECONDS = 62.0
private const val CITY_SPEED_MPS = 13.4
private const val SLOW_ROLL_SPEED_MPS = 5.4
private const val HIGHWAY_SPEED_MPS = 24.6

internal interface LiveDriveSessionListener {
  fun onSpeedUpdate(state: Map<String, Any?>)
  fun onSpeedError(code: String, message: String, recoverable: Boolean)
}

private data class LiveDriveSession(
  val tripId: String?,
  val units: String,
  val tripPaused: Boolean,
  val distanceOffsetMeters: Double,
  val maxSpeedBaselineMps: Double,
  val startedAtMs: Double,
  val simulationActive: Boolean,
  val simulatedDistanceOffsetMeters: Double
)

internal object LiveDriveSessionManager : SensorEventListener {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val listeners = mutableSetOf<LiveDriveSessionListener>()

  private var context: Context? = null
  private var fusedLocationClient: FusedLocationProviderClient? = null
  private var locationManager: LocationManager? = null
  private var sensorManager: SensorManager? = null

  private var engineHandle: Long = 0
  private var collectorsStarted = false
  private var dashboardActive = false
  private var outputIntervalMs = 100L
  private var lastEmitElapsedMs = 0L
  private var lastDriveSurfacePublishElapsedMs = 0L
  private var lastEngineState: Map<String, Any?> = emptyMap()
  private var liveDriveSession: LiveDriveSession? = null
  private var simulatedPublisherActive = false

  private var linearAccelerationSensor: Sensor? = null
  private var rotationVectorSensor: Sensor? = null
  private var gyroscopeSensor: Sensor? = null
  private var rotationVectorAccuracyDegrees = -1.0

  private val staleRunnable = object : Runnable {
    override fun run() {
      if (!collectorsStarted || engineHandle == 0L) {
        return
      }
      SpeedEngineJni.checkStale(engineHandle, System.currentTimeMillis().toDouble())?.let {
        emitState(it, force = false)
      }
      mainHandler.postDelayed(this, 500L)
    }
  }

  private val locationCallback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      val location = result.lastLocation ?: return
      handleLocation(location, collector = "fused")
    }
  }

  private val rawGpsListener = LocationListener { location ->
    handleLocation(location, collector = "gps")
  }

  private val simulatedDriveRunnable = object : Runnable {
    override fun run() {
      publishSimulatedLiveDriveSurface()
      if (simulatedPublisherActive) {
        mainHandler.postDelayed(this, SIMULATED_DRIVE_TICK_MS)
      }
    }
  }

  fun ensureInitialized(context: Context) {
    val applicationContext = context.applicationContext
    if (this.context === applicationContext && engineHandle != 0L) {
      return
    }

    this.context = applicationContext
    fusedLocationClient = LocationServices.getFusedLocationProviderClient(applicationContext)
    locationManager = applicationContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    sensorManager = applicationContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    linearAccelerationSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
    rotationVectorSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    gyroscopeSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    if (engineHandle == 0L) {
      engineHandle = SpeedEngineJni.create()
    }
  }

  fun startDashboard(
    context: Context,
    options: Map<String, Any?>,
    listener: LiveDriveSessionListener
  ) {
    ensureInitialized(context)
    listeners.add(listener)
    dashboardActive = true
    configureEngine(options)
    startCollectors()
  }

  fun stopDashboard(listener: LiveDriveSessionListener) {
    listeners.remove(listener)
    dashboardActive = listeners.isNotEmpty()
    stopCollectorsIfIdle()
  }

  fun reset(listener: LiveDriveSessionListener? = null) {
    if (engineHandle == 0L) {
      return
    }
    SpeedEngineJni.reset(engineHandle)?.let {
      emitState(it, force = true, target = listener)
    }
  }

  fun setTripAccumulation(active: Boolean) {
    if (engineHandle != 0L) {
      SpeedEngineJni.setTripAccumulation(engineHandle, active)
    }
  }

  fun setMountOffsetDegrees(value: Double) {
    if (engineHandle != 0L) {
      SpeedEngineJni.setMountOffsetDegrees(engineHandle, value)
    }
  }

  fun writeDriveSurfaceSnapshot(context: Context, snapshot: Map<String, Any?>) {
    ensureInitialized(context)
    DriveSurfaceStore.write(context.applicationContext, snapshot)
  }

  fun clearDriveSurfaceSnapshot(context: Context) {
    ensureInitialized(context)
    DriveSurfaceStore.clear(context.applicationContext)
  }

  fun startLiveSession(context: Context, snapshot: Map<String, Any?>) {
    ensureInitialized(context)
    updateLiveSession(snapshot)
    lastDriveSurfacePublishElapsedMs = 0L
    DriveSurfaceStore.startSession(context.applicationContext, snapshot)
    if (liveDriveSession?.simulationActive == true) {
      startSimulatedPublisher()
      return
    }
    if (engineHandle == 0L) {
      engineHandle = SpeedEngineJni.create()
    }
    startCollectors()
  }

  fun updateLiveSession(context: Context, snapshot: Map<String, Any?>) {
    ensureInitialized(context)
    if (liveDriveSession == null && snapshot["tripActive"] != true) {
      DriveSurfaceStore.write(context.applicationContext, snapshot)
      return
    }
    updateLiveSession(snapshot)
    DriveSurfaceStore.write(context.applicationContext, snapshot)
    if (liveDriveSession?.simulationActive == true) {
      startSimulatedPublisher()
      return
    }
    startCollectors()
  }

  fun stopLiveSession(context: Context, snapshot: Map<String, Any?>) {
    ensureInitialized(context)
    liveDriveSession = null
    lastDriveSurfacePublishElapsedMs = 0L
    stopSimulatedPublisher()
    DriveSurfaceStore.stopSession(context.applicationContext, snapshot)
    stopCollectorsIfIdle()
  }

  fun startFromStoredSession(context: Context) {
    ensureInitialized(context)
    if (!DriveSurfaceStore.isSessionActive(context.applicationContext)) {
      stopCollectorsIfIdle()
      return
    }
    val snapshot = DriveSurfaceStore.read(context.applicationContext) ?: return
    updateLiveSession(jsonObjectToMap(snapshot))
    if (liveDriveSession?.simulationActive == true) {
      startSimulatedPublisher()
      return
    }
    startCollectors()
  }

  fun getStatus(context: Context): Map<String, Any?> {
    ensureInitialized(context)
    return mapOf(
      "active" to (liveDriveSession != null || DriveSurfaceStore.isSessionActive(context.applicationContext)),
      "collectorsActive" to collectorsStarted,
      "dashboardActive" to dashboardActive,
      "listenerCount" to listeners.size
    )
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (!collectorsStarted || engineHandle == 0L) {
      return
    }

    val timestampMs = System.currentTimeMillis().toDouble()
    when (event.sensor.type) {
      Sensor.TYPE_LINEAR_ACCELERATION -> {
        val forwardAcceleration = event.values.getOrNull(1)?.toDouble() ?: 0.0
        SpeedEngineJni.onImu(engineHandle, forwardAcceleration, timestampMs)?.let {
          emitState(it, force = false)
        }
      }

      Sensor.TYPE_ROTATION_VECTOR -> {
        val rotationMatrix = FloatArray(9)
        val orientation = FloatArray(3)
        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
        SensorManager.getOrientation(rotationMatrix, orientation)
        val headingDegrees = Math.toDegrees(orientation[0].toDouble()).let {
          if (it < 0.0) it + 360.0 else it
        }
        SpeedEngineJni.onHeading(
          engineHandle,
          headingDegrees,
          timestampMs,
          rotationVectorAccuracyDegrees
        )?.let {
          emitState(it, force = false)
        }
      }

      Sensor.TYPE_GYROSCOPE -> {
        // Registered to keep the motion stack warm on devices that fuse gyro
        // data into the rotation vector. The C++ core only needs forward accel.
      }
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
    if (sensor?.type != Sensor.TYPE_ROTATION_VECTOR) {
      return
    }

    rotationVectorAccuracyDegrees = when (accuracy) {
      SensorManager.SENSOR_STATUS_ACCURACY_HIGH -> 5.0
      SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM -> 20.0
      SensorManager.SENSOR_STATUS_ACCURACY_LOW -> 60.0
      SensorManager.SENSOR_STATUS_UNRELIABLE -> 180.0
      else -> -1.0
    }
  }

  private fun configureEngine(options: Map<String, Any?>) {
    if (engineHandle == 0L) {
      engineHandle = SpeedEngineJni.create()
    }

    val staleTimeoutMs = numericOption(options, "staleTimeoutMs", 3000.0)
    val outputRateHz = max(1.0, min(30.0, numericOption(options, "outputRateHz", 10.0)))
    val mountOffsetDegrees = numericOption(options, "mountOffsetDegrees", 0.0)
    val accumulateTrip = options["accumulateTrip"] as? Boolean ?: true
    outputIntervalMs = (1000.0 / outputRateHz).toLong()
    lastEmitElapsedMs = 0L
    SpeedEngineJni.setOptions(
      engineHandle,
      staleTimeoutMs,
      outputRateHz,
      mountOffsetDegrees,
      accumulateTrip
    )
  }

  private fun startCollectors() {
    val activeContext = context ?: return

    if (!hasAnyForegroundLocationPermission(activeContext)) {
      emitError("permission_denied", "Location permission was denied.", true)
      writePermissionSnapshot(activeContext, "permission_denied")
      return
    }
    if (!hasFineLocationPermission(activeContext)) {
      emitError(
        "precise_location_required",
        "Precise location is required for accurate speed and compass readings.",
        true
      )
      writePermissionSnapshot(activeContext, "precise_location_required")
      return
    }

    if (collectorsStarted) {
      return
    }

    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 500L)
      .setMinUpdateIntervalMillis(250L)
      .setMinUpdateDistanceMeters(0f)
      .setWaitForAccurateLocation(false)
      .build()

    try {
      fusedLocationClient?.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
      startRawGpsCollector()
      registerSensors()
      collectorsStarted = true
      debugLog("collectors started")
      mainHandler.removeCallbacks(staleRunnable)
      mainHandler.postDelayed(staleRunnable, 500L)
    } catch (securityException: SecurityException) {
      emitError("permission_denied", "Location permission was denied.", true)
      writePermissionSnapshot(activeContext, "permission_denied")
    } catch (error: Exception) {
      emitError("location_error", error.localizedMessage ?: "Unable to start location updates.", true)
    }
  }

  private fun stopCollectorsIfIdle() {
    if (dashboardActive || liveDriveSession != null) {
      return
    }
    stopSimulatedPublisher()
    stopCollectors()
    if (engineHandle != 0L) {
      SpeedEngineJni.destroy(engineHandle)
      engineHandle = 0
    }
  }

  private fun stopCollectors() {
    collectorsStarted = false
    debugLog("collectors stopped")
    fusedLocationClient?.removeLocationUpdates(locationCallback)
    locationManager?.removeUpdates(rawGpsListener)
    sensorManager?.unregisterListener(this)
    mainHandler.removeCallbacks(staleRunnable)
  }

  private fun registerSensors() {
    val activeSensorManager = sensorManager ?: return
    linearAccelerationSensor?.let {
      activeSensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
    }
    rotationVectorSensor?.let {
      activeSensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
    }
    gyroscopeSensor?.let {
      activeSensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
    }
  }

  private fun startRawGpsCollector() {
    val activeLocationManager = locationManager ?: return
    try {
      activeLocationManager.requestLocationUpdates(
        LocationManager.GPS_PROVIDER,
        250L,
        0f,
        rawGpsListener,
        Looper.getMainLooper()
      )
      debugLog("raw GPS collector started")
    } catch (securityException: SecurityException) {
      throw securityException
    } catch (error: Exception) {
      debugLog("raw GPS collector unavailable: ${error.localizedMessage ?: error.javaClass.simpleName}")
    }
  }

  private fun handleLocation(location: Location, collector: String) {
    if (engineHandle == 0L) {
      return
    }

    val accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else -1.0
    val speed = if (location.hasSpeed()) location.speed.toDouble() else -1.0
    val bearing = if (location.hasBearing()) location.bearing.toDouble() else -1.0
    val bearingAccuracy =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && location.hasBearingAccuracy()) {
        location.bearingAccuracyDegrees.toDouble()
      } else {
        -1.0
      }
    val timestampMs = if (location.time > 0L) location.time.toDouble() else System.currentTimeMillis().toDouble()
    val state = SpeedEngineJni.onLocation(
      engineHandle,
      location.latitude,
      location.longitude,
      accuracy,
      speed,
      timestampMs,
      bearing,
      bearingAccuracy
    ) ?: return

    debugLog(
      "location collector=$collector provider=${location.provider} " +
        "accuracy=$accuracy nativeSpeed=$speed bearing=$bearing " +
        "stateSpeed=${state["speedMps"]} quality=${state["quality"]}"
    )
    emitState(state, force = false)
  }

  private fun emitState(
    state: Map<String, Any?>,
    force: Boolean,
    target: LiveDriveSessionListener? = null
  ) {
    val now = SystemClock.elapsedRealtime()
    if (!force && now - lastEmitElapsedMs < outputIntervalMs) {
      return
    }
    lastEmitElapsedMs = now
    lastEngineState = state
    publishLiveDriveSurface(state, force)

    val targets = target?.let { listOf(it) } ?: listeners.toList()
    if (targets.isEmpty()) {
      return
    }
    mainHandler.post {
      targets.forEach { it.onSpeedUpdate(state) }
    }
  }

  private fun emitError(code: String, message: String, recoverable: Boolean) {
    val targets = listeners.toList()
    if (targets.isEmpty()) {
      return
    }
    mainHandler.post {
      targets.forEach { it.onSpeedError(code, message, recoverable) }
    }
  }

  private fun updateLiveSession(snapshot: Map<String, Any?>) {
    val nowMs = System.currentTimeMillis().toDouble()
    val engineDistanceMeters = numberFrom(lastEngineState, "distanceMeters", 0.0)
    val snapshotDistanceMeters = numberFrom(snapshot, "distanceMeters", 0.0)
    val elapsedMs = numberFrom(snapshot, "elapsedMs", 0.0)
    val simulationActive = boolFrom(snapshot, "simulationActive", false)
    val simulatedDistanceOffsetMeters =
      if (simulationActive) {
        snapshotDistanceMeters - simulatedDistanceAt(elapsedMs / 1000.0)
      } else {
        0.0
      }
    liveDriveSession = LiveDriveSession(
      tripId = snapshot["tripId"] as? String,
      units = snapshot["units"] as? String ?: "MPH",
      tripPaused = snapshot["tripPaused"] as? Boolean ?: false,
      distanceOffsetMeters = max(0.0, snapshotDistanceMeters - engineDistanceMeters),
      maxSpeedBaselineMps = max(
        0.0,
        numberFrom(snapshot, "maxSpeedMps", 0.0) - numberFrom(lastEngineState, "maxSpeedMps", 0.0)
      ),
      startedAtMs = nowMs - max(0.0, elapsedMs),
      simulationActive = simulationActive,
      simulatedDistanceOffsetMeters = simulatedDistanceOffsetMeters
    )
  }

  private fun startSimulatedPublisher() {
    if (simulatedPublisherActive) {
      return
    }
    stopCollectors()
    simulatedPublisherActive = true
    publishSimulatedLiveDriveSurface()
    mainHandler.removeCallbacks(simulatedDriveRunnable)
    mainHandler.postDelayed(simulatedDriveRunnable, SIMULATED_DRIVE_TICK_MS)
  }

  private fun stopSimulatedPublisher() {
    simulatedPublisherActive = false
    mainHandler.removeCallbacks(simulatedDriveRunnable)
  }

  private fun publishSimulatedLiveDriveSurface() {
    val session = liveDriveSession ?: return
    val activeContext = context ?: return
    if (!session.simulationActive) {
      return
    }

    val nowMs = System.currentTimeMillis().toDouble()
    val elapsedMs = max(0.0, nowMs - session.startedAtMs)
    val elapsedSeconds = elapsedMs / 1000.0
    val speedMps = simulatedSpeedAt(elapsedSeconds)
    val distanceMeters = max(0.0, session.simulatedDistanceOffsetMeters + simulatedDistanceAt(elapsedSeconds))
    val averageSpeedMps = if (elapsedSeconds > 1.0) distanceMeters / elapsedSeconds else 0.0
    val maxSpeedMps = max(session.maxSpeedBaselineMps, simulatedMaxSpeedAt(elapsedSeconds))
    val heading = simulatedHeadingAt(elapsedSeconds)

    DriveSurfaceStore.write(
      activeContext,
      mapOf(
        "schemaVersion" to 1,
        "tripId" to session.tripId,
        "tripActive" to true,
        "tripPaused" to session.tripPaused,
        "speedMps" to speedMps,
        "speedText" to formattedSpeed(speedMps, session.units),
        "units" to session.units,
        "distanceMeters" to distanceMeters,
        "distanceText" to formattedDistance(distanceMeters, session.units),
        "averageSpeedMps" to averageSpeedMps,
        "averageSpeedText" to formattedSpeed(averageSpeedMps, session.units),
        "maxSpeedMps" to maxSpeedMps,
        "maxSpeedText" to formattedSpeed(maxSpeedMps, session.units),
        "elapsedMs" to elapsedMs,
        "elapsedText" to formattedElapsed(elapsedMs),
        "headingDegrees" to heading,
        "headingText" to formattedHeading(heading),
        "headingSource" to if (speedMps >= 1.0) "course" else "device",
        "headingQuality" to "good",
        "signalQuality" to "good",
        "signalText" to "Simulated",
        "stale" to false,
        "permissionStatus" to "ready",
        "updatedAtMs" to nowMs,
        "simulationActive" to true
      )
    )
  }

  private fun publishLiveDriveSurface(state: Map<String, Any?>, force: Boolean) {
    val session = liveDriveSession ?: return
    val activeContext = context ?: return
    val nowElapsed = SystemClock.elapsedRealtime()
    if (!force && nowElapsed - lastDriveSurfacePublishElapsedMs < DRIVE_SURFACE_PUBLISH_INTERVAL_MS) {
      return
    }
    lastDriveSurfacePublishElapsedMs = nowElapsed

    val nowMs = System.currentTimeMillis().toDouble()
    val speedMps = numberFrom(state, "speedMps", 0.0)
    val engineDistanceMeters = numberFrom(state, "distanceMeters", 0.0)
    val distanceMeters = max(0.0, session.distanceOffsetMeters + engineDistanceMeters)
    val maxSpeedMps = max(session.maxSpeedBaselineMps, numberFrom(state, "maxSpeedMps", 0.0))
    val elapsedMs = max(0.0, nowMs - session.startedAtMs)
    val averageSpeedMps =
      if (elapsedMs > 1000.0) distanceMeters / (elapsedMs / 1000.0) else numberFrom(state, "averageSpeedMps", 0.0)
    val quality = state["quality"] as? String ?: "poor"
    val stale = state["stale"] as? Boolean ?: false
    val heading = nullableNumberFrom(state, "headingDegrees")

    val snapshot = mapOf(
      "schemaVersion" to 1,
      "tripId" to session.tripId,
      "tripActive" to true,
      "tripPaused" to session.tripPaused,
      "speedMps" to speedMps,
      "speedText" to formattedSpeed(speedMps, session.units),
      "units" to session.units,
      "distanceMeters" to distanceMeters,
      "distanceText" to formattedDistance(distanceMeters, session.units),
      "averageSpeedMps" to averageSpeedMps,
      "averageSpeedText" to formattedSpeed(averageSpeedMps, session.units),
      "maxSpeedMps" to maxSpeedMps,
      "maxSpeedText" to formattedSpeed(maxSpeedMps, session.units),
      "elapsedMs" to elapsedMs,
      "elapsedText" to formattedElapsed(elapsedMs),
      "headingDegrees" to heading,
      "headingText" to formattedHeading(heading),
      "headingSource" to (state["headingSource"] as? String ?: "none"),
      "headingQuality" to (state["headingQuality"] as? String ?: "poor"),
      "signalQuality" to quality,
      "signalText" to signalText(quality, stale),
      "stale" to stale,
      "permissionStatus" to "ready",
      "updatedAtMs" to nowMs,
      "simulationActive" to false
    )
    DriveSurfaceStore.write(activeContext, snapshot)
  }

  private fun writePermissionSnapshot(context: Context, permissionStatus: String) {
    if (!DriveSurfaceStore.isSessionActive(context)) {
      return
    }
    val snapshot = mapOf(
      "schemaVersion" to 1,
      "tripActive" to true,
      "tripPaused" to false,
      "speedText" to "--",
      "units" to "MPH",
      "distanceText" to "--",
      "averageSpeedText" to "--",
      "maxSpeedText" to "--",
      "elapsedText" to "--",
      "headingText" to "--",
      "signalText" to "Live widget needs location permission",
      "signalQuality" to "poor",
      "permissionStatus" to permissionStatus,
      "stale" to true,
      "updatedAtMs" to System.currentTimeMillis().toDouble(),
      "simulationActive" to false
    )
    DriveSurfaceStore.write(context, snapshot)
  }

  private fun simulatedSpeedAt(elapsedSeconds: Double): Double {
    val t = ((elapsedSeconds % SIMULATED_DRIVE_LOOP_SECONDS) + SIMULATED_DRIVE_LOOP_SECONDS) %
      SIMULATED_DRIVE_LOOP_SECONDS

    return when {
      t < 1.5 -> 0.0
      t < 7.5 -> lerp(0.0, CITY_SPEED_MPS, easeInOut((t - 1.5) / 6.0))
      t < 18.0 -> CITY_SPEED_MPS + sin(t * 1.7) * 0.7
      t < 24.0 -> lerp(CITY_SPEED_MPS, SLOW_ROLL_SPEED_MPS, easeInOut((t - 18.0) / 6.0))
      t < 29.0 -> SLOW_ROLL_SPEED_MPS + sin(t * 1.2) * 0.35
      t < 36.0 -> lerp(SLOW_ROLL_SPEED_MPS, HIGHWAY_SPEED_MPS, easeInOut((t - 29.0) / 7.0))
      t < 50.0 -> HIGHWAY_SPEED_MPS + sin(t * 0.9) * 1.2
      t < 57.0 -> lerp(HIGHWAY_SPEED_MPS, 0.0, easeInOut((t - 50.0) / 7.0))
      else -> 0.0
    }
  }

  private fun simulatedHeadingAt(elapsedSeconds: Double): Double {
    val raw = 32.0 + elapsedSeconds * 2.8 + sin(elapsedSeconds / 6.0) * 24.0
    return ((raw % 360.0) + 360.0) % 360.0
  }

  private fun simulatedDistanceAt(elapsedSeconds: Double): Double {
    if (elapsedSeconds <= 0.0) {
      return 0.0
    }
    var distance = 0.0
    var t = 0.0
    var previousSpeed = simulatedSpeedAt(0.0)
    val step = 0.5
    while (t < elapsedSeconds) {
      val nextT = min(elapsedSeconds, t + step)
      val nextSpeed = simulatedSpeedAt(nextT)
      distance += ((previousSpeed + nextSpeed) / 2.0) * (nextT - t)
      t = nextT
      previousSpeed = nextSpeed
    }
    return distance
  }

  private fun simulatedMaxSpeedAt(elapsedSeconds: Double): Double {
    var maxSpeed = 0.0
    var t = 0.0
    val step = 0.5
    while (t <= elapsedSeconds) {
      maxSpeed = max(maxSpeed, simulatedSpeedAt(t))
      t += step
    }
    return maxSpeed
  }

  private fun lerp(from: Double, to: Double, amount: Double): Double =
    from + (to - from) * amount

  private fun easeInOut(amount: Double): Double {
    val clamped = max(0.0, min(1.0, amount))
    return clamped * clamped * (3.0 - 2.0 * clamped)
  }

  private fun hasAnyForegroundLocationPermission(context: Context): Boolean {
    val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
  }

  private fun hasFineLocationPermission(context: Context): Boolean {
    val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
    return fine == PackageManager.PERMISSION_GRANTED
  }

  private fun numericOption(options: Map<String, Any?>, key: String, fallback: Double): Double {
    return when (val value = options[key]) {
      is Number -> value.toDouble()
      else -> fallback
    }
  }

  private fun numberFrom(values: Map<String, Any?>, key: String, fallback: Double): Double {
    return when (val value = values[key]) {
      is Number -> value.toDouble()
      else -> fallback
    }
  }

  private fun nullableNumberFrom(values: Map<String, Any?>, key: String): Double? {
    return when (val value = values[key]) {
      is Number -> value.toDouble()
      else -> null
    }
  }

  private fun boolFrom(values: Map<String, Any?>, key: String, fallback: Boolean): Boolean {
    return when (val value = values[key]) {
      is Boolean -> value
      is Number -> value.toInt() != 0
      else -> fallback
    }
  }

  private fun jsonObjectToMap(json: org.json.JSONObject): Map<String, Any?> {
    val values = mutableMapOf<String, Any?>()
    val keys = json.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      val value = json.opt(key)
      values[key] = if (value == org.json.JSONObject.NULL) null else value
    }
    return values
  }

  private fun formattedSpeed(speedMps: Double, units: String): String {
    val display = if (units == "km/h") speedMps * 3.6 else speedMps * 2.2369362921
    return max(0.0, display).let { kotlin.math.round(it).toInt().toString() }
  }

  private fun formattedDistance(distanceMeters: Double, units: String): String {
    return if (units == "km/h") {
      String.format("%.1f km", max(0.0, distanceMeters) / 1000.0)
    } else {
      String.format("%.1f mi", max(0.0, distanceMeters) / 1609.344)
    }
  }

  private fun formattedElapsed(elapsedMs: Double): String {
    val totalSeconds = max(0.0, elapsedMs / 1000.0).toInt()
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    return String.format("%02d:%02d:%02d", hours, minutes, seconds)
  }

  private fun formattedHeading(headingDegrees: Double?): String {
    if (headingDegrees == null) {
      return "--"
    }
    val normalized = ((headingDegrees % 360.0) + 360.0) % 360.0
    return "${kotlin.math.round(normalized).toInt()}°"
  }

  private fun signalText(quality: String, stale: Boolean): String {
    if (stale) return "Stale"
    return when (quality) {
      "good" -> "Good"
      "medium" -> "Fair"
      else -> "Poor"
    }
  }

  private fun debugLog(message: String) {
    if (Log.isLoggable(LOG_TAG, Log.DEBUG)) {
      Log.d(LOG_TAG, message)
    }
  }
}
