import CoreLocation
import CoreMotion
import ExpoModulesCore
import UIKit
import WidgetKit

#if canImport(ActivityKit)
import ActivityKit
#endif

private let speedUpdateEvent = "speedUpdate"
private let speedErrorEvent = "speedError"
private let gravityMps2 = 9.80665
private let preciseLocationPurposeKey = "V3l0cityPreciseLocation"
private let driveSurfacePublishIntervalMs = 1000.0
private let driveWidgetReloadIntervalMs = 60000.0
private let simulatedDriveTickSeconds = 1.0
private let simulatedDriveLoopSeconds = 62.0
private let simulatedCitySpeedMps = 13.4
private let simulatedSlowRollSpeedMps = 5.4
private let simulatedHighwaySpeedMps = 24.6

private struct LiveDriveSession {
  var tripId: String?
  var units: String
  var tripPaused: Bool
  var startedAtMs: Double
  var simulationActive: Bool
}

public final class V3l0citySpeedEngineModule: Module {
  private let engine = V3l0citySpeedEngineWrapper()
  private let engineQueue = DispatchQueue(label: "com.v3l0city.speedengine.core")
  private lazy var locationDelegate = SpeedLocationDelegate(owner: self)
  private lazy var locationManager = CLLocationManager()
  private lazy var motionManager = CMMotionManager()
  private lazy var motionQueue = OperationQueue()
  private var staleTimer: Timer?
  private var isStarted = false
  private var lastEmitTimestampMs = 0.0
  private var outputIntervalMs = 100.0
  private var liveDriveSession: LiveDriveSession?
  private let liveSessionLock = NSRecursiveLock()
  private var liveProjection = LiveDriveProjection()
  private var tripAccumulating = true
  private var lastDriveSurfacePublishMs = 0.0
  private var lastWidgetReloadMs = 0.0
  private var simulatedDriveTimer: Timer?
  private var simulatedDriveBackgroundTask: UIBackgroundTaskIdentifier = .invalid
  private var lastEngineState: [String: Any] = [:]

  public func definition() -> ModuleDefinition {
    Name("V3l0citySpeedEngine")

    Events(speedUpdateEvent, speedErrorEvent)

    AsyncFunction("start") { (options: [String: Any]) in
      DispatchQueue.main.async {
        self.startCollectors(options: options)
      }
    }

    AsyncFunction("stop") {
      DispatchQueue.main.async {
        self.stopCollectors()
      }
    }

    AsyncFunction("reset") {
      self.engineQueue.async {
        let state = self.engine.reset()
        self.emit(state: state, force: true)
      }
    }

    AsyncFunction("setTripAccumulation") { (active: Bool) in
      self.engineQueue.async {
        self.liveSessionLock.lock()
        defer { self.liveSessionLock.unlock() }
        self.tripAccumulating = active
        self.liveProjection.setAccumulating(active, timestampMs: Date().timeIntervalSince1970 * 1000.0)
        self.engine.setTripAccumulation(active)
      }
    }

    AsyncFunction("setMountOffsetDegrees") { (value: Double) in
      self.engineQueue.async {
        self.engine.setMountOffsetDegrees(value)
      }
    }

    AsyncFunction("writeDriveSurfaceSnapshot") { (snapshot: [String: Any]) in
      self.writeDriveSurfaceSnapshot(snapshot)
    }

    AsyncFunction("clearDriveSurfaceSnapshot") {
      self.clearDriveSurfaceSnapshot()
    }

    AsyncFunction("readDriveSurfaceSnapshot") { () -> [String: Any]? in
      self.readDriveSurfaceSnapshot()
    }

    AsyncFunction("startLiveDriveSession") { (snapshot: [String: Any]) in
      self.startLiveDriveSession(snapshot)
    }

    AsyncFunction("updateLiveDriveSession") { (snapshot: [String: Any]) in
      self.updateLiveDriveSession(snapshot)
    }

    AsyncFunction("stopLiveDriveSession") { (snapshot: [String: Any]) in
      self.stopLiveDriveSession(snapshot)
    }

    AsyncFunction("startTripLiveActivity") { (snapshot: [String: Any]) in
      self.startTripLiveActivity(snapshot)
    }

    AsyncFunction("updateTripLiveActivity") { (snapshot: [String: Any]) in
      self.updateTripLiveActivity(snapshot)
    }

    AsyncFunction("endTripLiveActivity") { (snapshot: [String: Any]) in
      self.endTripLiveActivity(snapshot)
    }

    OnCreate {
      self.locationManager.delegate = self.locationDelegate
      self.locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
      self.locationManager.distanceFilter = kCLDistanceFilterNone
      self.locationManager.activityType = .otherNavigation
      self.locationManager.pausesLocationUpdatesAutomatically = false
      self.motionQueue.qualityOfService = .userInteractive
    }

    OnAppEntersBackground {
      if !self.hasLiveDriveSession() {
        self.stopCollectors()
      }
    }

    OnDestroy {
      if !self.hasLiveDriveSession() {
        self.stopCollectors()
      }
    }
  }

  private func startCollectors(options: [String: Any]) {
    let staleTimeoutMs = numericOption(options, "staleTimeoutMs", fallback: 3000)
    let outputRateHz = max(1, min(30, numericOption(options, "outputRateHz", fallback: 10)))
    let mountOffsetDegrees = numericOption(options, "mountOffsetDegrees", fallback: 0)
    let accumulateTrip = options["accumulateTrip"] as? Bool ?? true

    outputIntervalMs = 1000.0 / outputRateHz
    lastEmitTimestampMs = 0
    engineQueue.async {
      self.liveSessionLock.lock()
      defer { self.liveSessionLock.unlock() }
      self.tripAccumulating = accumulateTrip
      self.liveProjection.setAccumulating(accumulateTrip, timestampMs: Date().timeIntervalSince1970 * 1000.0)
      self.engine.setOptionsWithStaleTimeoutMs(
        staleTimeoutMs,
        outputRateHz: outputRateHz,
        mountOffsetDegrees: mountOffsetDegrees,
        accumulateTrip: accumulateTrip
      )
    }

    guard CLLocationManager.locationServicesEnabled() else {
      emitError(code: "location_services_disabled", message: "Location services are disabled.", recoverable: true)
      return
    }

    let authorization = locationManager.authorizationStatus
    if authorization == .notDetermined {
      locationManager.requestWhenInUseAuthorization()
      isStarted = true
      return
    }

    guard authorization == .authorizedWhenInUse || authorization == .authorizedAlways else {
      emitError(code: "permission_denied", message: "Location permission was denied.", recoverable: true)
      return
    }

    guard ensurePreciseLocationThenStartIfNeeded() else {
      return
    }

    startAllCollectorsAfterPermission()
  }

  private func startAllCollectorsAfterPermission() {
    startLocationCollectors()
    startMotionIfAvailable()
    startStaleTimer()
  }

  private func startLocationCollectors() {
    isStarted = true
    let hasSession = hasLiveDriveSession()
    locationManager.allowsBackgroundLocationUpdates = hasSession
    locationManager.showsBackgroundLocationIndicator = hasSession
    locationManager.startUpdatingLocation()
    if CLLocationManager.headingAvailable() {
      locationManager.headingFilter = kCLHeadingFilterNone
      locationManager.startUpdatingHeading()
    }
  }

  private func ensurePreciseLocationThenStartIfNeeded() -> Bool {
    if #available(iOS 14.0, *) {
      if locationManager.accuracyAuthorization == .fullAccuracy {
        return true
      }

      locationManager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: preciseLocationPurposeKey) { [weak self] _ in
        DispatchQueue.main.async {
          guard let self, self.isStarted else {
            return
          }
          if self.locationManager.accuracyAuthorization == .fullAccuracy {
            self.startAllCollectorsAfterPermission()
          } else {
            self.emitError(
              code: "precise_location_required",
              message: "Precise location is required for accurate speed and compass readings.",
              recoverable: true
            )
          }
        }
      }
      return false
    }

    return true
  }

  private func stopCollectors() {
    isStarted = false
    locationManager.allowsBackgroundLocationUpdates = false
    locationManager.showsBackgroundLocationIndicator = false
    locationManager.stopUpdatingLocation()
    locationManager.stopUpdatingHeading()
    motionManager.stopDeviceMotionUpdates()
    staleTimer?.invalidate()
    staleTimer = nil
  }

  private func startMotionIfAvailable() {
    guard motionManager.isDeviceMotionAvailable, !motionManager.isDeviceMotionActive else {
      return
    }

    motionManager.deviceMotionUpdateInterval = 0.02
    motionManager.startDeviceMotionUpdates(to: motionQueue) { [weak self] data, _ in
      guard let self, let data else {
        return
      }
      let timestampMs = Date().timeIntervalSince1970 * 1000.0
      let forwardAccelerationMps2 = data.userAcceleration.y * gravityMps2
      self.engineQueue.async {
        let state = self.engine.onImu(withForwardAcceleration: forwardAccelerationMps2, timestampMs: timestampMs)
        self.emit(state: state, force: false)
      }
    }
  }

  private func startStaleTimer() {
    staleTimer?.invalidate()
    staleTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
      guard let self else {
        return
      }
      let timestampMs = Date().timeIntervalSince1970 * 1000.0
      self.engineQueue.async {
        let state = self.engine.checkStale(atTimestampMs: timestampMs)
        self.emit(state: state, force: false)
      }
    }
  }

  fileprivate func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    guard isStarted else {
      return
    }
    let authorization = manager.authorizationStatus
    if authorization == .authorizedWhenInUse || authorization == .authorizedAlways {
      guard ensurePreciseLocationThenStartIfNeeded() else {
        return
      }
      startAllCollectorsAfterPermission()
    } else if authorization == .denied || authorization == .restricted {
      stopCollectors()
      emitError(code: "permission_denied", message: "Location permission was denied.", recoverable: true)
    }
  }

  fileprivate func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last else {
      return
    }

    let coordinate = location.coordinate
    let accuracy = location.horizontalAccuracy
    let speed = location.speed
    let timestampMs = location.timestamp.timeIntervalSince1970 * 1000.0
    let course = location.course >= 0 ? location.course : -1.0
    var courseAccuracy = -1.0
    if #available(iOS 13.4, *) {
      courseAccuracy = location.courseAccuracy >= 0 ? location.courseAccuracy : -1.0
    }

    engineQueue.async {
      let state = self.engine.onLocation(
        withLatitude: coordinate.latitude,
        longitude: coordinate.longitude,
        accuracyMeters: accuracy,
        nativeSpeedMps: speed,
        timestampMs: timestampMs,
        courseDegrees: course,
        courseAccuracyDegrees: courseAccuracy
      )
      self.emit(state: state, force: false)
    }
  }

  fileprivate func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    let heading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
    let accuracy = newHeading.headingAccuracy >= 0 ? newHeading.headingAccuracy : -1.0
    let timestampMs = Date().timeIntervalSince1970 * 1000.0

    engineQueue.async {
      let state = self.engine.onHeading(
        withDegrees: heading,
        timestampMs: timestampMs,
        accuracyDegrees: accuracy
      )
      self.emit(state: state, force: false)
    }
  }

  fileprivate func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    if let clError = error as? CLError, clError.code == .locationUnknown {
      return
    }

    let nsError = error as NSError
    if nsError.domain == kCLErrorDomain && nsError.code == CLError.Code.locationUnknown.rawValue {
      return
    }

    emitError(code: "location_error", message: error.localizedDescription, recoverable: true)
  }

  private func emit(state: [AnyHashable: Any], force: Bool) {
    let nowMs = Date().timeIntervalSince1970 * 1000.0
    if !force && nowMs - lastEmitTimestampMs < outputIntervalMs {
      return
    }
    lastEmitTimestampMs = nowMs
    let body = state.reduce(into: [String: Any]()) { result, entry in
      guard let key = entry.key as? String else {
        return
      }
      result[key] = entry.value
    }
    liveSessionLock.lock()
    lastEngineState = body
    publishLiveDriveSurface(from: body, force: force)
    liveSessionLock.unlock()

    DispatchQueue.main.async {
      self.sendEvent(speedUpdateEvent, body)
    }
  }

  private func emitError(code: String, message: String, recoverable: Bool) {
    DispatchQueue.main.async {
      self.sendEvent(speedErrorEvent, [
        "code": code,
        "message": message,
        "recoverable": recoverable
      ])
    }
  }

  private func numericOption(_ options: [String: Any], _ key: String, fallback: Double) -> Double {
    if let number = options[key] as? NSNumber {
      return number.doubleValue
    }
    if let value = options[key] as? Double {
      return value
    }
    if let value = options[key] as? Int {
      return Double(value)
    }
    return fallback
  }

  private func writeDriveSurfaceSnapshot(_ snapshot: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(snapshot),
          let data = try? JSONSerialization.data(withJSONObject: snapshot),
          let json = String(data: data, encoding: .utf8)
    else {
      return
    }

    let defaults = v3l0cityDriveSurfaceDefaults()
    defaults.set(json, forKey: v3l0cityDriveSurfaceSnapshotKey)
    defaults.synchronize()

    requestWidgetReload(force: boolValue(snapshot, "simulationActive", fallback: false))
  }

  private func clearDriveSurfaceSnapshot() {
    let defaults = v3l0cityDriveSurfaceDefaults()
    defaults.removeObject(forKey: v3l0cityDriveSurfaceSnapshotKey)
    defaults.synchronize()

    requestWidgetReload(force: true)
  }

  private func readDriveSurfaceSnapshot() -> [String: Any]? {
    guard
      let json = v3l0cityDriveSurfaceDefaults().string(forKey: v3l0cityDriveSurfaceSnapshotKey),
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data),
      let snapshot = object as? [String: Any]
    else {
      return nil
    }

    return snapshot
  }

  private func startLiveDriveSession(_ snapshot: [String: Any]) {
    liveSessionLock.lock()
    defer { liveSessionLock.unlock() }
    guard updateLiveSession(from: snapshot) else { return }
    lastDriveSurfacePublishMs = 0
    let simulationActive = boolValue(snapshot, "simulationActive", fallback: false)
    if simulationActive {
      startSimulatedDriveTimer()
    } else if locationManager.authorizationStatus == .authorizedWhenInUse {
      locationManager.requestAlwaysAuthorization()
    }
    if isStarted && !simulationActive {
      locationManager.allowsBackgroundLocationUpdates = true
      locationManager.showsBackgroundLocationIndicator = true
    }
    let projected = projectedDriveSnapshot(snapshot)
    writeDriveSurfaceSnapshot(projected)
    requestWidgetReload(force: true)
    startTripLiveActivity(projected)
  }

  private func updateLiveDriveSession(_ snapshot: [String: Any]) {
    liveSessionLock.lock()
    defer { liveSessionLock.unlock() }
    guard liveDriveSession != nil || boolValue(snapshot, "tripActive", fallback: false) else {
      writeDriveSurfaceSnapshot(snapshot)
      return
    }
    guard updateLiveSession(from: snapshot) else { return }
    if boolValue(snapshot, "simulationActive", fallback: false) {
      startSimulatedDriveTimer()
    }
    writeDriveSurfaceSnapshot(projectedDriveSnapshot(snapshot))
  }

  private func stopLiveDriveSession(_ snapshot: [String: Any]) {
    liveSessionLock.lock()
    defer { liveSessionLock.unlock() }
    if let session = liveDriveSession, let tripId = optionalStringValue(snapshot, "tripId"),
       session.tripId != tripId { return }
    liveDriveSession = nil
    liveProjection = LiveDriveProjection()
    liveProjection.setAccumulating(tripAccumulating)
    lastDriveSurfacePublishMs = 0
    stopSimulatedDriveTimer()
    locationManager.allowsBackgroundLocationUpdates = false
    locationManager.showsBackgroundLocationIndicator = false
    endTripLiveActivity(snapshot)
    clearDriveSurfaceSnapshot()
  }

  private func requestWidgetReload(force: Bool) {
    guard #available(iOS 14.0, *) else {
      return
    }

    let nowMs = Date().timeIntervalSince1970 * 1000.0
    if !force && nowMs - lastWidgetReloadMs < driveWidgetReloadIntervalMs {
      return
    }

    lastWidgetReloadMs = nowMs
    WidgetCenter.shared.reloadAllTimelines()
  }

  private func updateLiveSession(from snapshot: [String: Any]) -> Bool {
    let nowMs = Date().timeIntervalSince1970 * 1000.0
    let elapsedMs = doubleValue(snapshot, "elapsedMs", fallback: 0)
    let simulationActive = boolValue(snapshot, "simulationActive", fallback: false)
    let fresh = freshNativeState(lastEngineState, nowMs: nowMs)
    let counter = simulationActive ? simulatedDistance(at: elapsedMs / 1000.0)
      : fresh ? nullableDoubleValue(lastEngineState, "distanceMeters") : nil
    let timestamp = simulationActive ? nowMs : fresh ? nullableDoubleValue(lastEngineState, "timestampMs") : nil
    guard liveProjection.synchronize(
      tripId: optionalStringValue(snapshot, "tripId"),
      distanceMeters: doubleValue(snapshot, "distanceMeters", fallback: 0),
      maxSpeedMps: doubleValue(snapshot, "maxSpeedMps", fallback: 0),
      paused: boolValue(snapshot, "tripPaused", fallback: false),
      snapshotAtMs: doubleValue(snapshot, "updatedAtMs", fallback: nowMs),
      nativeCounter: counter, nativeTimestampMs: timestamp
    ) else { return false }
    liveDriveSession = LiveDriveSession(
      tripId: optionalStringValue(snapshot, "tripId"),
      units: stringValue(snapshot, "units", fallback: "MPH"),
      tripPaused: boolValue(snapshot, "tripPaused", fallback: false),
      startedAtMs: nowMs - max(0, elapsedMs),
      simulationActive: simulationActive
    )
    return true
  }

  private func hasLiveDriveSession() -> Bool {
    liveSessionLock.lock()
    defer { liveSessionLock.unlock() }
    return liveDriveSession != nil
  }

  // Called under the session lock. A lagging JS refresh must not visibly
  // replace already observed session movement/peak with an older summary.
  private func projectedDriveSnapshot(_ snapshot: [String: Any]) -> [String: Any] {
    var projected = snapshot
    let units = stringValue(snapshot, "units", fallback: "MPH")
    let elapsedMs = doubleValue(snapshot, "elapsedMs", fallback: 0)
    let average = liveProjection.distanceMeters / max(1, elapsedMs / 1000.0)
    projected["distanceMeters"] = liveProjection.distanceMeters
    projected["distanceText"] = formattedDistance(liveProjection.distanceMeters, units: units)
    projected["maxSpeedMps"] = liveProjection.maxSpeedMps
    projected["maxSpeedText"] = formattedSpeed(liveProjection.maxSpeedMps, units: units)
    projected["averageSpeedMps"] = average
    projected["averageSpeedText"] = formattedSpeed(average, units: units)
    return projected
  }

  private func freshNativeState(_ state: [String: Any], nowMs: Double) -> Bool {
    let timestamp = doubleValue(state, "timestampMs", fallback: 0)
    let fixAge = doubleValue(state, "fixAgeMs", fallback: 0)
    return !boolValue(state, "stale", fallback: false) && timestamp.isFinite && timestamp > 0
      && timestamp <= nowMs && nowMs - timestamp <= 3000 && fixAge.isFinite && fixAge >= 0 && fixAge < 3000
  }

  private func startSimulatedDriveTimer() {
    stopCollectors()
    beginSimulatedDriveBackgroundTask()
    if simulatedDriveTimer != nil {
      return
    }
    publishSimulatedLiveDriveSurface()
    let timer = Timer(timeInterval: simulatedDriveTickSeconds, repeats: true) { [weak self] _ in
      self?.publishSimulatedLiveDriveSurface()
    }
    simulatedDriveTimer = timer
    RunLoop.main.add(timer, forMode: .common)
  }

  private func stopSimulatedDriveTimer() {
    simulatedDriveTimer?.invalidate()
    simulatedDriveTimer = nil
    endSimulatedDriveBackgroundTask()
  }

  private func beginSimulatedDriveBackgroundTask() {
    guard simulatedDriveBackgroundTask == .invalid else {
      return
    }
    simulatedDriveBackgroundTask = UIApplication.shared.beginBackgroundTask(withName: "V3l0citySimulatedDrive") { [weak self] in
      self?.endSimulatedDriveBackgroundTask()
    }
  }

  private func endSimulatedDriveBackgroundTask() {
    guard simulatedDriveBackgroundTask != .invalid else {
      return
    }
    UIApplication.shared.endBackgroundTask(simulatedDriveBackgroundTask)
    simulatedDriveBackgroundTask = .invalid
  }

  private func publishSimulatedLiveDriveSurface() {
    liveSessionLock.lock()
    defer { liveSessionLock.unlock() }
    guard let session = liveDriveSession, session.simulationActive else {
      return
    }

    let nowMs = Date().timeIntervalSince1970 * 1000.0
    let elapsedMs = max(0, nowMs - session.startedAtMs)
    let elapsedSeconds = elapsedMs / 1000.0
    let speedMps = simulatedSpeed(at: elapsedSeconds)
    liveProjection.observe(nativeCounter: simulatedDistance(at: elapsedSeconds), speedMps: speedMps,
                           timestampMs: nowMs, fresh: true)
    let distanceMeters = liveProjection.distanceMeters
    let averageSpeedMps = distanceMeters / max(1, elapsedSeconds)
    let maxSpeedMps = liveProjection.maxSpeedMps
    let headingDegrees = simulatedHeading(at: elapsedSeconds)

    let snapshot: [String: Any] = [
      "schemaVersion": 1,
      "tripId": session.tripId ?? NSNull(),
      "tripActive": true,
      "tripPaused": session.tripPaused,
      "speedMps": speedMps,
      "speedText": formattedSpeed(speedMps, units: session.units),
      "units": session.units,
      "distanceMeters": distanceMeters,
      "distanceText": formattedDistance(distanceMeters, units: session.units),
      "averageSpeedMps": averageSpeedMps,
      "averageSpeedText": formattedSpeed(averageSpeedMps, units: session.units),
      "maxSpeedMps": maxSpeedMps,
      "maxSpeedText": formattedSpeed(maxSpeedMps, units: session.units),
      "elapsedMs": elapsedMs,
      "elapsedText": formattedElapsed(elapsedMs),
      "headingDegrees": headingDegrees,
      "headingText": formattedHeading(headingDegrees),
      "headingSource": speedMps >= 1 ? "course" : "device",
      "headingQuality": "good",
      "signalQuality": "good",
      "signalText": "Simulated",
      "stale": false,
      "permissionStatus": "ready",
      "updatedAtMs": nowMs,
      "simulationActive": true
    ]
    writeDriveSurfaceSnapshot(snapshot)
    startTripLiveActivity(snapshot)
  }

  private func publishLiveDriveSurface(from state: [String: Any], force: Bool) {
    liveSessionLock.lock()
    defer { liveSessionLock.unlock() }
    guard let session = liveDriveSession else {
      return
    }
    let nowMs = Date().timeIntervalSince1970 * 1000.0
    let speedMps = doubleValue(state, "speedMps", fallback: 0)
    let timestamp = doubleValue(state, "timestampMs", fallback: 0)
    // Future/corrupt timestamps cannot push the projection watermark forward.
    if timestamp.isFinite && timestamp > 0 && timestamp <= nowMs {
      liveProjection.observe(nativeCounter: doubleValue(state, "distanceMeters", fallback: 0), speedMps: speedMps,
        timestampMs: timestamp, fresh: freshNativeState(state, nowMs: nowMs))
    }
    if !force && nowMs - lastDriveSurfacePublishMs < driveSurfacePublishIntervalMs {
      return
    }
    lastDriveSurfacePublishMs = nowMs

    let distanceMeters = liveProjection.distanceMeters
    let maxSpeedMps = liveProjection.maxSpeedMps
    let elapsedMs = max(0, nowMs - session.startedAtMs)
    let averageSpeedMps = distanceMeters / max(1, elapsedMs / 1000.0)
    let headingDegrees = nullableDoubleValue(state, "headingDegrees")
    let quality = stringValue(state, "quality", fallback: "poor")
    let stale = boolValue(state, "stale", fallback: false)

    let snapshot: [String: Any] = [
      "schemaVersion": 1,
      "tripId": session.tripId ?? NSNull(),
      "tripActive": true,
      "tripPaused": session.tripPaused,
      "speedMps": speedMps,
      "speedText": formattedSpeed(speedMps, units: session.units),
      "units": session.units,
      "distanceMeters": distanceMeters,
      "distanceText": formattedDistance(distanceMeters, units: session.units),
      "averageSpeedMps": averageSpeedMps,
      "averageSpeedText": formattedSpeed(averageSpeedMps, units: session.units),
      "maxSpeedMps": maxSpeedMps,
      "maxSpeedText": formattedSpeed(maxSpeedMps, units: session.units),
      "elapsedMs": elapsedMs,
      "elapsedText": formattedElapsed(elapsedMs),
      "headingDegrees": headingDegrees ?? NSNull(),
      "headingText": formattedHeading(headingDegrees),
      "headingSource": stringValue(state, "headingSource", fallback: "none"),
      "headingQuality": stringValue(state, "headingQuality", fallback: "poor"),
      "signalQuality": quality,
      "signalText": signalText(quality: quality, stale: stale),
      "stale": stale,
      "permissionStatus": "ready",
      "updatedAtMs": nowMs,
      "simulationActive": false
    ]
    writeDriveSurfaceSnapshot(snapshot)
    startTripLiveActivity(snapshot)
  }

  private func formattedSpeed(_ speedMps: Double, units: String) -> String {
    let display = units == "km/h" ? speedMps * 3.6 : speedMps * 2.2369362921
    return "\(Int(round(max(0, display))))"
  }

  private func formattedDistance(_ distanceMeters: Double, units: String) -> String {
    if units == "km/h" {
      return String(format: "%.1f km", max(0, distanceMeters) / 1000.0)
    }
    return String(format: "%.1f mi", max(0, distanceMeters) / 1609.344)
  }

  private func formattedElapsed(_ elapsedMs: Double) -> String {
    let totalSeconds = max(0, Int(elapsedMs / 1000.0))
    let hours = totalSeconds / 3600
    let minutes = (totalSeconds % 3600) / 60
    let seconds = totalSeconds % 60
    return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
  }

  private func formattedHeading(_ headingDegrees: Double?) -> String {
    guard let headingDegrees else {
      return "--"
    }
    let normalized = headingDegrees.truncatingRemainder(dividingBy: 360) < 0
      ? headingDegrees.truncatingRemainder(dividingBy: 360) + 360
      : headingDegrees.truncatingRemainder(dividingBy: 360)
    return "\(Int(round(normalized)))°"
  }

  private func signalText(quality: String, stale: Bool) -> String {
    if stale {
      return "Stale"
    }
    if quality == "good" {
      return "Good"
    }
    if quality == "medium" {
      return "Fair"
    }
    return "Poor"
  }

  private func simulatedSpeed(at elapsedSeconds: Double) -> Double {
    let t = positiveRemainder(elapsedSeconds, simulatedDriveLoopSeconds)
    if t < 1.5 {
      return 0
    }
    if t < 7.5 {
      return lerp(0, simulatedCitySpeedMps, easeInOut((t - 1.5) / 6.0))
    }
    if t < 18 {
      return simulatedCitySpeedMps + sin(t * 1.7) * 0.7
    }
    if t < 24 {
      return lerp(simulatedCitySpeedMps, simulatedSlowRollSpeedMps, easeInOut((t - 18) / 6.0))
    }
    if t < 29 {
      return simulatedSlowRollSpeedMps + sin(t * 1.2) * 0.35
    }
    if t < 36 {
      return lerp(simulatedSlowRollSpeedMps, simulatedHighwaySpeedMps, easeInOut((t - 29) / 7.0))
    }
    if t < 50 {
      return simulatedHighwaySpeedMps + sin(t * 0.9) * 1.2
    }
    if t < 57 {
      return lerp(simulatedHighwaySpeedMps, 0, easeInOut((t - 50) / 7.0))
    }
    return 0
  }

  private func simulatedHeading(at elapsedSeconds: Double) -> Double {
    positiveRemainder(32 + elapsedSeconds * 2.8 + sin(elapsedSeconds / 6.0) * 24, 360)
  }

  private func simulatedDistance(at elapsedSeconds: Double) -> Double {
    if elapsedSeconds <= 0 {
      return 0
    }
    var distance = 0.0
    var t = 0.0
    var previousSpeed = simulatedSpeed(at: 0)
    let step = 0.5
    while t < elapsedSeconds {
      let nextT = min(elapsedSeconds, t + step)
      let nextSpeed = simulatedSpeed(at: nextT)
      distance += ((previousSpeed + nextSpeed) / 2.0) * (nextT - t)
      t = nextT
      previousSpeed = nextSpeed
    }
    return distance
  }

  private func simulatedMaxSpeed(at elapsedSeconds: Double) -> Double {
    var maxSpeed = 0.0
    var t = 0.0
    let step = 0.5
    while t <= elapsedSeconds {
      maxSpeed = max(maxSpeed, simulatedSpeed(at: t))
      t += step
    }
    return maxSpeed
  }

  private func lerp(_ from: Double, _ to: Double, _ amount: Double) -> Double {
    from + (to - from) * amount
  }

  private func easeInOut(_ amount: Double) -> Double {
    let clamped = max(0, min(1, amount))
    return clamped * clamped * (3 - 2 * clamped)
  }

  private func positiveRemainder(_ value: Double, _ divisor: Double) -> Double {
    let remainder = value.truncatingRemainder(dividingBy: divisor)
    return remainder < 0 ? remainder + divisor : remainder
  }

  private func startTripLiveActivity(_ snapshot: [String: Any]) {
#if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      let contentState = liveActivityContentState(from: snapshot)
      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        return
      }

      Task {
        if let existing = Activity<V3l0cityTripActivityAttributes>.activities.first {
          await existing.update(ActivityContent(state: contentState, staleDate: Date().addingTimeInterval(5)))
          return
        }

        let attributes = V3l0cityTripActivityAttributes(
          tripId: stringValue(snapshot, "tripId", fallback: "active-trip"),
          startedAtMs: doubleValue(snapshot, "updatedAtMs", fallback: Date().timeIntervalSince1970 * 1000.0)
        )
        _ = try? Activity.request(
          attributes: attributes,
          content: ActivityContent(state: contentState, staleDate: Date().addingTimeInterval(5)),
          pushType: nil
        )
      }
    }
#endif
  }

  private func updateTripLiveActivity(_ snapshot: [String: Any]) {
#if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      let contentState = liveActivityContentState(from: snapshot)
      Task {
        for activity in Activity<V3l0cityTripActivityAttributes>.activities {
          await activity.update(ActivityContent(state: contentState, staleDate: Date().addingTimeInterval(5)))
        }
      }
    }
#endif
  }

  private func endTripLiveActivity(_ snapshot: [String: Any]) {
#if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      let contentState = liveActivityContentState(from: snapshot)
      Task {
        for activity in Activity<V3l0cityTripActivityAttributes>.activities {
          await activity.end(ActivityContent(state: contentState, staleDate: nil), dismissalPolicy: .immediate)
        }
      }
    }
#endif
  }

#if canImport(ActivityKit)
  @available(iOS 16.2, *)
  private func liveActivityContentState(from snapshot: [String: Any]) -> V3l0cityTripActivityAttributes.ContentState {
    V3l0cityTripActivityAttributes.ContentState(
      speedText: stringValue(snapshot, "speedText", fallback: "--"),
      units: stringValue(snapshot, "units", fallback: "MPH"),
      distanceText: stringValue(snapshot, "distanceText", fallback: "0.0 mi"),
      elapsedText: stringValue(snapshot, "elapsedText", fallback: "00:00:00"),
      headingText: stringValue(snapshot, "headingText", fallback: "--"),
      signalText: stringValue(snapshot, "signalText", fallback: "Ready"),
      isStale: boolValue(snapshot, "stale", fallback: false),
      tripActive: boolValue(snapshot, "tripActive", fallback: false),
      updatedAtMs: doubleValue(snapshot, "updatedAtMs", fallback: Date().timeIntervalSince1970 * 1000.0)
    )
  }
#endif

  private func stringValue(_ snapshot: [String: Any], _ key: String, fallback: String) -> String {
    if let value = snapshot[key] as? String, !value.isEmpty {
      return value
    }
    return fallback
  }

  private func optionalStringValue(_ snapshot: [String: Any], _ key: String) -> String? {
    if let value = snapshot[key] as? String, !value.isEmpty {
      return value
    }
    return nil
  }

  private func doubleValue(_ snapshot: [String: Any], _ key: String, fallback: Double) -> Double {
    if let value = snapshot[key] as? NSNumber {
      return value.doubleValue
    }
    if let value = snapshot[key] as? Double {
      return value
    }
    if let value = snapshot[key] as? Int {
      return Double(value)
    }
    return fallback
  }

  private func nullableDoubleValue(_ snapshot: [String: Any], _ key: String) -> Double? {
    if let value = snapshot[key] as? NSNumber {
      return value.doubleValue
    }
    if let value = snapshot[key] as? Double {
      return value
    }
    if let value = snapshot[key] as? Int {
      return Double(value)
    }
    return nil
  }

  private func boolValue(_ snapshot: [String: Any], _ key: String, fallback: Bool) -> Bool {
    if let value = snapshot[key] as? Bool {
      return value
    }
    if let value = snapshot[key] as? NSNumber {
      return value.boolValue
    }
    return fallback
  }
}

private final class SpeedLocationDelegate: NSObject, CLLocationManagerDelegate {
  private weak var owner: V3l0citySpeedEngineModule?

  init(owner: V3l0citySpeedEngineModule) {
    self.owner = owner
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    owner?.locationManagerDidChangeAuthorization(manager)
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    owner?.locationManager(manager, didUpdateLocations: locations)
  }

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    owner?.locationManager(manager, didUpdateHeading: newHeading)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    owner?.locationManager(manager, didFailWithError: error)
  }
}
