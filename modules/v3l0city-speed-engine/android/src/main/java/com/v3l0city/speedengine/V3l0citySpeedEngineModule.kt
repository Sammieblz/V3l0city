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
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.max
import kotlin.math.min

private const val SPEED_UPDATE_EVENT = "speedUpdate"
private const val SPEED_ERROR_EVENT = "speedError"
private const val LOG_TAG = "V3l0citySpeedEngine"

private fun debugLog(message: String) {
  if (Log.isLoggable(LOG_TAG, Log.DEBUG)) {
    Log.d(LOG_TAG, message)
  }
}

class V3l0citySpeedEngineModule : Module(), SensorEventListener {
  private lateinit var context: Context
  private lateinit var fusedLocationClient: FusedLocationProviderClient
  private lateinit var locationManager: LocationManager
  private lateinit var sensorManager: SensorManager
  private val mainHandler = Handler(Looper.getMainLooper())

  private var engineHandle: Long = 0
  private var isStarted = false
  private var outputIntervalMs = 100L
  private var lastEmitElapsedMs = 0L

  private var linearAccelerationSensor: Sensor? = null
  private var rotationVectorSensor: Sensor? = null
  private var gyroscopeSensor: Sensor? = null
  private var rotationVectorAccuracyDegrees = -1.0

  private val staleRunnable = object : Runnable {
    override fun run() {
      if (!isStarted || engineHandle == 0L) {
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

  override fun definition() = ModuleDefinition {
    Name("V3l0citySpeedEngine")

    Events(SPEED_UPDATE_EVENT, SPEED_ERROR_EVENT)

    OnCreate {
      context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
      locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
      linearAccelerationSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
      rotationVectorSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
      gyroscopeSensor = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
      engineHandle = SpeedEngineJni.create()
    }

    AsyncFunction("start") { options: Map<String, Any?> ->
      startCollectors(options)
    }

    AsyncFunction("stop") {
      stopCollectors()
    }

    AsyncFunction("reset") {
      if (engineHandle != 0L) {
        SpeedEngineJni.reset(engineHandle)?.let {
          emitState(it, force = true)
        }
      }
    }

    AsyncFunction("setTripAccumulation") { active: Boolean ->
      if (engineHandle != 0L) {
        SpeedEngineJni.setTripAccumulation(engineHandle, active)
      }
    }

    AsyncFunction("setMountOffsetDegrees") { value: Double ->
      if (engineHandle != 0L) {
        SpeedEngineJni.setMountOffsetDegrees(engineHandle, value)
      }
    }

    AsyncFunction("writeDriveSurfaceSnapshot") { snapshot: Map<String, Any?> ->
      DriveSurfaceStore.write(context, snapshot)
    }

    AsyncFunction("clearDriveSurfaceSnapshot") {
      DriveSurfaceStore.clear(context)
    }

    AsyncFunction("startTripLiveActivity") { _: Map<String, Any?> ->
      // iOS-only. Android car-facing surfaces are the home-screen widget and active-trip notification.
    }

    AsyncFunction("updateTripLiveActivity") { _: Map<String, Any?> ->
      // iOS-only. Android car-facing surfaces are the home-screen widget and active-trip notification.
    }

    AsyncFunction("endTripLiveActivity") { _: Map<String, Any?> ->
      // iOS-only. Android car-facing surfaces are the home-screen widget and active-trip notification.
    }

    OnActivityEntersBackground {
      stopCollectors()
    }

    OnDestroy {
      stopCollectors()
      if (engineHandle != 0L) {
        SpeedEngineJni.destroy(engineHandle)
        engineHandle = 0
      }
    }
  }

  private fun startCollectors(options: Map<String, Any?>) {
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
    debugLog(
      "start staleTimeoutMs=$staleTimeoutMs outputRateHz=$outputRateHz " +
        "mountOffsetDegrees=$mountOffsetDegrees accumulateTrip=$accumulateTrip"
    )

    if (!hasAnyForegroundLocationPermission()) {
      debugLog("start blocked: missing foreground location permission")
      emitError("permission_denied", "Location permission was denied.", true)
      return
    }
    if (!hasFineLocationPermission()) {
      debugLog("start blocked: precise location required")
      emitError(
        "precise_location_required",
        "Precise location is required for accurate speed and compass readings.",
        true
      )
      return
    }

    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 500L)
      .setMinUpdateIntervalMillis(250L)
      .setMinUpdateDistanceMeters(0f)
      .setWaitForAccurateLocation(false)
      .build()

    try {
      fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
      startRawGpsCollector()
      registerSensors()
      isStarted = true
      debugLog("collectors started")
      mainHandler.removeCallbacks(staleRunnable)
      mainHandler.postDelayed(staleRunnable, 500L)
    } catch (securityException: SecurityException) {
      emitError("permission_denied", "Location permission was denied.", true)
    } catch (error: Exception) {
      emitError("location_error", error.localizedMessage ?: "Unable to start location updates.", true)
    }
  }

  private fun stopCollectors() {
    isStarted = false
    debugLog("collectors stopped")
    if (::fusedLocationClient.isInitialized) {
      fusedLocationClient.removeLocationUpdates(locationCallback)
    }
    if (::locationManager.isInitialized) {
      locationManager.removeUpdates(rawGpsListener)
    }
    if (::sensorManager.isInitialized) {
      sensorManager.unregisterListener(this)
    }
    mainHandler.removeCallbacks(staleRunnable)
  }

  private fun registerSensors() {
    linearAccelerationSensor?.let {
      sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
    }
    rotationVectorSensor?.let {
      sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
    }
    gyroscopeSensor?.let {
      sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
    }
  }

  private fun startRawGpsCollector() {
    if (!::locationManager.isInitialized) {
      return
    }

    try {
      locationManager.requestLocationUpdates(
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
        "lat=${location.latitude} lon=${location.longitude} accuracy=$accuracy " +
        "hasSpeed=${location.hasSpeed()} nativeSpeed=$speed bearing=$bearing " +
        "bearingAccuracy=$bearingAccuracy " +
        "stateSpeed=${state["speedMps"]} source=${state["source"]} " +
        "quality=${state["quality"]} reasons=${state["qualityReasons"]}"
    )
    emitState(state, force = false)
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (!isStarted || engineHandle == 0L) {
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
        // Registered to keep the motion stack warm on devices that fuse gyro data
        // into the rotation vector. The C++ core only needs forward acceleration.
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

  private fun emitState(state: Map<String, Any?>, force: Boolean) {
    val now = SystemClock.elapsedRealtime()
    if (!force && now - lastEmitElapsedMs < outputIntervalMs) {
      return
    }
    lastEmitElapsedMs = now
    sendEvent(SPEED_UPDATE_EVENT, state)
  }

  private fun emitError(code: String, message: String, recoverable: Boolean) {
    sendEvent(
      SPEED_ERROR_EVENT,
      mapOf(
        "code" to code,
        "message" to message,
        "recoverable" to recoverable
      )
    )
  }

  private fun hasAnyForegroundLocationPermission(): Boolean {
    val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
    return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
  }

  private fun hasFineLocationPermission(): Boolean {
    val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
    return fine == PackageManager.PERMISSION_GRANTED
  }

  private fun numericOption(options: Map<String, Any?>, key: String, fallback: Double): Double {
    return when (val value = options[key]) {
      is Number -> value.toDouble()
      else -> fallback
    }
  }
}
