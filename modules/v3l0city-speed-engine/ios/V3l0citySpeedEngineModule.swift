import CoreLocation
import CoreMotion
import ExpoModulesCore

private let speedUpdateEvent = "speedUpdate"
private let speedErrorEvent = "speedError"
private let gravityMps2 = 9.80665
private let preciseLocationPurposeKey = "V3l0cityPreciseLocation"

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
        self.engine.setTripAccumulation(active)
      }
    }

    AsyncFunction("setMountOffsetDegrees") { (value: Double) in
      self.engineQueue.async {
        self.engine.setMountOffsetDegrees(value)
      }
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
      self.stopCollectors()
    }

    OnDestroy {
      self.stopCollectors()
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

    DispatchQueue.main.async {
      let body = state.reduce(into: [String: Any]()) { result, entry in
        guard let key = entry.key as? String else {
          return
        }
        result[key] = entry.value
      }
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
