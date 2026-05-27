# Native Speed Engine

The native speed engine is the core runtime feature of V3l0city. It exists so
sensor collection and speed computation are not limited by JavaScript timer
behavior or React render cadence.

For the lower-level algorithm notes and simulation commands, also read
[../speed-engine.md](../speed-engine.md).

## Module Layout

```text
modules/v3l0city-speed-engine/
  package.json
  expo-module.config.json
  index.js
  index.d.ts
  V3l0citySpeedEngine.podspec

  common/cpp/
    SpeedEngine.h
    SpeedEngine.cpp
    tests/
      SpeedEngineTests.cpp
      run_speed_engine_tests.sh

  ios/
    V3l0citySpeedEngineModule.swift
    SpeedEngineWrapper.h
    SpeedEngineWrapper.mm

  android/
    build.gradle
    CMakeLists.txt
    src/main/java/com/v3l0city/speedengine/
      V3l0citySpeedEngineModule.kt
      SpeedEngineJni.kt
    src/main/cpp/
      V3l0citySpeedEngineJni.cpp
```

The package is linked into the app with:

```json
"v3l0city-speed-engine": "file:modules/v3l0city-speed-engine"
```

Expo autolinking discovers the module for iOS and Android development builds.

## JavaScript API

`modules/v3l0city-speed-engine/index.js` exposes:

- `isAvailable()`
- `start(options)`
- `stop()`
- `reset()`
- `setTripAccumulation(active)`
- `setMountOffsetDegrees(value)`
- `addSpeedUpdateListener(listener)`
- `addSpeedErrorListener(listener)`

`start(options)` accepts:

- `mountOffsetDegrees`
- `accumulateTrip`
- `staleTimeoutMs`
- `outputRateHz`

Events:

- `speedUpdate`: current speed state.
- `speedError`: recoverable or nonrecoverable sensor/module error.

The React hook treats this package as optional. If it is unavailable, the app
uses the JS fallback path.

## Output State

The native state maps to `VelocitySensorsState` in
`src/hooks/useVelocitySensors.ts`.

Important fields:

- `speedMps`: current speed in meters per second.
- `averageSpeedMps`: trip average when accumulation is enabled.
- `maxSpeedMps`: trip max when accumulation is enabled.
- `distanceMeters`: trip distance when accumulation is enabled.
- `headingDegrees`: selected vehicle direction in degrees, or `null`.
- `headingSource`: `course`, `device`, or `none`.
- `headingAccuracyDegrees`: platform heading/course accuracy when available.
- `headingQuality`: `good`, `medium`, or `poor`.
- `headingReasons`: diagnostic labels such as `course-used`,
  `device-heading-used`, `low-speed-course-ignored`,
  `poor-heading-accuracy`, `no-heading`, and
  `precise-location-required`.
- `source`: `none`, `gps`, `blended`, or `motion-only`.
- `quality`: `good`, `medium`, or `poor`.
- `stale`: true when the last GPS fix is too old.
- `gpsAvailable`, `motionAvailable`, `headingAvailable`.
- `isMoving`, `isStopped`.
- `qualityScore`, `qualityReasons`, `gpsAccuracyMeters`, `fixAgeMs`,
  `nativeSpeedUsed`.

## iOS Collector

Primary file:

```text
modules/v3l0city-speed-engine/ios/V3l0citySpeedEngineModule.swift
```

Responsibilities:

- Define the Expo Module.
- Expose async functions.
- Own `CLLocationManager`.
- Own `CMMotionManager`.
- Normalize iOS location, heading, and motion samples.
- Send samples into `SpeedEngineWrapper`.
- Emit JS events on the main queue.
- Stop collectors when the app backgrounds or the module is destroyed.

iOS location settings:

- `desiredAccuracy = kCLLocationAccuracyBestForNavigation`
- `distanceFilter = kCLDistanceFilterNone`
- `activityType = .otherNavigation`
- `pausesLocationUpdatesAutomatically = false`

iOS heading behavior:

- `CLLocation.course` is passed to C++ as GPS course when nonnegative.
- `CLLocation.courseAccuracy` is passed when the OS reports it.
- `CLHeading.trueHeading` is preferred, then `magneticHeading`.
- Negative course and accuracy values are treated as unavailable.
- iOS 14+ reduced accuracy is not accepted for the native speed engine. The
  module requests temporary full accuracy with the
  `V3l0cityPreciseLocation` purpose key and emits
  `precise_location_required` if full accuracy remains unavailable.

iOS motion settings:

- Device motion updates at roughly 50 Hz.
- Forward acceleration is derived from `userAcceleration.y`.
- Acceleration is converted to meters per second squared.

iOS error handling:

- Missing permission emits `permission_denied`.
- Disabled location services emits `location_services_disabled`.
- Transient `CLError.locationUnknown` is ignored because it commonly appears
  before the simulator or device has its first fix.
- Other location errors emit `location_error`.

Bridge file:

```text
modules/v3l0city-speed-engine/ios/SpeedEngineWrapper.mm
```

This file converts Swift-friendly method calls and dictionaries into C++ structs
and back.

## Android Collector

Primary file:

```text
modules/v3l0city-speed-engine/android/src/main/java/com/v3l0city/speedengine/V3l0citySpeedEngineModule.kt
```

Responsibilities:

- Define the Expo Module.
- Check foreground location permission.
- Configure high-accuracy fused location updates.
- Listen to GPS provider updates where available.
- Configure motion sensors where available.
- Normalize Android samples.
- Feed JNI bridge methods.
- Emit JS events at a controlled rate.
- Stop collectors when appropriate.

JNI declarations:

```text
modules/v3l0city-speed-engine/android/src/main/java/com/v3l0city/speedengine/SpeedEngineJni.kt
```

C++ JNI bridge:

```text
modules/v3l0city-speed-engine/android/src/main/cpp/V3l0citySpeedEngineJni.cpp
```

Android native build:

```text
modules/v3l0city-speed-engine/android/CMakeLists.txt
```

The debug APK build compiles the speed engine native library for Android ABIs.

Android heading behavior:

- `Location.bearing` is passed to C++ as GPS course when available.
- Android O+ `bearingAccuracyDegrees` is passed when available.
- Rotation-vector heading is used as the device-heading fallback.
- `SensorManager` rotation-vector accuracy is mapped to approximate degrees so
  unreliable compass data can lower heading quality.
- `ACCESS_FINE_LOCATION` is required. Coarse-only approximate location emits
  `precise_location_required` and does not start native collection.

## Shared C++ Core

Files:

```text
modules/v3l0city-speed-engine/common/cpp/SpeedEngine.h
modules/v3l0city-speed-engine/common/cpp/SpeedEngine.cpp
```

Inputs:

- `LocationSample`
- `HeadingSample`
- `ImuSample`
- `EngineOptions`

Output:

- `SpeedState`

Core rules:

- Ignore non-finite coordinates and timestamps.
- Track GPS availability after the first location sample.
- Reject GPS accuracy above the hard rejection threshold.
- Prefer valid native speed.
- Use distance/time derived speed when native speed is missing or invalid.
- Clamp speed to a configured maximum.
- Reject derived outliers with impossible acceleration.
- Smooth accepted measurements with a scalar Kalman-style filter.
- Predict between GPS fixes from clamped IMU acceleration.
- Set speed to zero after stale GPS timeout.
- Accumulate distance only from accepted GPS movement.
- Freeze average, max, and distance when trip accumulation is disabled.
- Track moving/stopped state with sustain windows.
- Prefer GPS course while moving at or above the course threshold.
- Use device heading when stopped/slow or when GPS course is invalid.
- Apply mount offset only to device heading. GPS course represents vehicle
  travel direction and is never mount-offset.
- Normalize heading to `[0, 360)`.
- Emit quality score and reason mask.

## C++ Data Types

`EngineOptions` contains:

- `staleTimeoutMs`
- `outputRateHz`
- `mountOffsetDegrees`
- `maxGpsAccuracyMeters`
- `maxHeadingAccuracyDegrees`
- `minCourseSpeedMps`
- `minMovingSpeedMps`
- `maxSpeedMps`
- `maxForwardAccelerationMps2`
- `maxOutlierAccelerationMps2`
- `movingSustainMs`
- `stoppedSustainMs`
- `accumulateTrip`

`SpeedSource`:

- `None`
- `Gps`
- `Blended`
- `MotionOnly`

`SignalQuality`:

- `Good`
- `Medium`
- `Poor`

Quality reason mask:

- `QualityReasonStale`
- `QualityReasonPoorAccuracy`
- `QualityReasonOutlierRejected`
- `QualityReasonImuPredicted`
- `QualityReasonNoGps`
- `QualityReasonNativeSpeedUsed`

## React Integration

`src/hooks/useVelocitySensors.ts` chooses native when:

- platform is iOS or Android.
- `NativeSpeedEngine.isAvailable()` returns true.
- development drive simulation is not active.

The hook subscribes to:

- `NativeSpeedEngine.addSpeedUpdateListener`
- `NativeSpeedEngine.addSpeedErrorListener`

On update, the hook copies native fields into React state. On error, it maps
native error codes to the UI status.

When trip pause/resume changes, the hook calls:

```ts
NativeSpeedEngine.setTripAccumulation(accumulateTrip)
```

When mount position changes, the hook calls:

```ts
NativeSpeedEngine.setMountOffsetDegrees(mountOffsetDegrees)
```

## JS Fallback

The fallback path remains for:

- tests
- unsupported runtimes
- environments where the native module is absent

Fallback uses:

- `expo-location`
- `expo-sensors`
- `src/hooks/useKalmanSpeedFilter.ts`
- `src/utils/sensorGuards.ts`
- `src/utils/speedMath.ts`
- `src/utils/motionMath.ts`

Do not remove the fallback unless the test strategy changes.

## Simulator Behavior

### App Drive Simulator

The development drive simulator bypasses native sensors and generates a
repeatable city/highway profile from JS. It is useful for:

- UI behavior
- trip save/history
- export
- telemetry

It does not validate native platform collectors.

### iOS Location Simulation

`scripts/simulate-ios-drive.sh` uses:

```bash
xcrun simctl location <device> set <lat>,<lon>
```

iOS Simulator may not attach `CLLocation.speed` to manually injected fixes.
That is expected. The C++ core should use distance/time fallback.

### Android Location Simulation

`scripts/simulate-android-drive.sh` uses:

```bash
adb emu geo fix <lon> <lat> <altitude> <satellites> <knots>
```

The Android emulator supports velocity in knots, so native speed can be tested
more directly.

## Testing

C++ tests:

```bash
npm run test:speed-engine:cpp
```

Native hook tests:

```bash
npx jest --runInBand __tests__/useVelocitySensors.native.test.tsx
```

iOS build:

```bash
npx expo run:ios --no-bundler
```

Android build:

```bash
cd android
JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home" \
  NODE_ENV=development \
  sh ./gradlew :app:assembleDebug
```

## Change Guidelines

- Change speed rules in C++ first.
- Add or update C++ tests for algorithm changes.
- Keep platform collectors focused on collecting and normalizing samples.
- Keep UI-specific state mapping in `useVelocitySensors`.
- Keep telemetry outside the speed engine.
- Do not make speed calculation depend on network state.
