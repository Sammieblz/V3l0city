# V3l0city Speed Engine

V3l0city uses a foreground-only native speed engine for iOS and Android development builds. The React Native UI still talks to a stable hook shape, but real sensor collection and speed computation now live below JS.

## Data Flow

1. Swift and Kotlin collect platform sensor data while the app is in the foreground.
2. Native collectors normalize samples:
   - GPS location: latitude, longitude, accuracy, native speed when available, timestamp.
   - GPS course: course/bearing and bearing accuracy when available.
   - Heading: device heading, heading accuracy, and timestamp.
   - IMU: forward acceleration and timestamp.
3. Samples enter the shared C++ core in `modules/v3l0city-speed-engine/common/cpp`.
4. The C++ core updates speed, average, max, distance, heading, heading diagnostics, source, quality, stale state, and movement flags.
5. The Expo Module emits `speedUpdate` events to JS at up to 10 Hz.
6. `src/hooks/useVelocitySensors.ts` maps those events to the existing `VelocitySensorsState` used by the UI.
7. When a trip is actively recording, `src/components/speedometer.tsx` samples that live state at 2 Hz and saves the timeline with the trip in SQLite.
8. If telemetry is configured, `src/api/tripTelemetryService.ts` streams active samples over WebSocket and falls back to HTTP batch upload.

The JS fallback remains available for tests and unsupported runtimes. Native is the default when `V3l0citySpeedEngine` is present in iOS/Android development builds.

## Platform Collectors

iOS uses `CLLocationManager` with `kCLLocationAccuracyBestForNavigation`, no distance filter, foreground permission, heading updates, and `CoreMotion` device motion at roughly 50 Hz.

Android uses `FusedLocationProviderClient` with high-accuracy updates around 500 ms, no minimum distance, and `SensorManager` linear acceleration, rotation vector, and gyroscope where available.

The compass represents vehicle direction. While moving at or above the course
threshold, the C++ engine prefers GPS course/bearing. When stopped, moving
slowly, or missing a valid course, it uses device heading as a fallback. Mount
offset is applied only to device heading because GPS course already represents
travel direction.

Both platforms stop collectors when the app backgrounds. This first implementation does not include background tracking.

## Trip Speed Stream

V3l0city stores a real per-trip speed stream locally. The UI still renders from the live 10 Hz engine updates, but trip history captures a 2 Hz stream so saved trips have a usable timeline without bloating SQLite.

- Samples are captured only while a trip is active and not paused.
- The app records at most two samples per second.
- Each sample stores trip id, sequence, timestamp, elapsed time, speed, distance, heading, heading source, heading accuracy, heading quality, heading reasons, source, signal quality, quality diagnostics, upload state, movement flags, and stale state.
- Samples are saved in the `trip_speed_samples` SQLite table beside the aggregate `trips` row.
- Clearing or deleting trips also removes their samples.
- JSON export includes each trip's `speedSamples`; CSV export includes a trip summary section plus a sample section.

This stream is local-first and tied to trip recording. Telemetry upload is a sidecar: failed WebSocket or HTTP uploads never affect local speed display or local trip saving.

## Telemetry API

The backend lives in `server/src` and uses Fastify, `@fastify/websocket`, SQLite, and Zod. Run it locally with:

```bash
npm run server:dev
```

Mobile telemetry is enabled only when both environment variables are set:

```bash
EXPO_PUBLIC_V3L0CITY_API_URL=http://<lan-ip>:8787
EXPO_PUBLIC_V3L0CITY_WS_URL=ws://<lan-ip>:8787
```

API endpoints:

- `POST /v1/devices/register` for anonymous install registration.
- `POST /v1/trips` to create a remote trip and live session.
- `POST /v1/trips/:tripId/samples/batch` for idempotent HTTP sample upload.
- `POST /v1/trips/:tripId/complete` for final trip aggregates.
- `GET /v1/trips/:tripId` for authenticated debug summaries.

WebSocket endpoint:

- `/v1/trips/:tripId/live?sessionToken=<token>`
- Client messages: `hello`, `sample_batch`, `trip_complete`, `ping`.
- Server messages: `ack`, `error`, `pong`.

The mobile app stores an anonymous install id locally with `expo-crypto` and `AsyncStorage`, registers for a device token, streams small live batches over WebSocket, and retries unsent samples over HTTP at trip completion.

See [Telemetry API](telemetry-api.md) for request and response schemas, server environment variables, database tables, and retry semantics.

## C++ Core Rules

- Prefer a valid native GPS speed sample when the platform provides one.
- Fall back to distance/time when native speed is missing or invalid.
- Reject poor GPS accuracy and unrealistic GPS outliers.
- Use a scalar Kalman-style filter for speed smoothing.
- Predict between GPS fixes with clamped forward acceleration from IMU samples.
- Accumulate trip distance only from accepted GPS movement.
- Preserve live speed when trip accumulation is paused, while freezing distance, average, and max trip stats.
- Mark stale GPS and decay displayed speed to `0` after the stale timeout.
- Keep GPS course from driving the compass after stale timeout.
- Emit heading source, heading accuracy, heading quality, and heading reasons.
- Emit `qualityScore`, `qualityReasons`, `gpsAccuracyMeters`, `fixAgeMs`, and `nativeSpeedUsed` for every native state update.

## Tuning Constants

Default native start options are set from `src/hooks/useVelocitySensors.ts`:

- `staleTimeoutMs`: `3000`
- `outputRateHz`: `10`
- `mountOffsetDegrees`: selected by the UI
- `accumulateTrip`: selected by trip controls

The C++ defaults also include:

- max GPS accuracy for normal distance accumulation: `25 m`
- max heading accuracy for good/medium heading: `45 deg`
- minimum speed to prefer GPS course: `1.5 m/s`
- GPS hard rejection threshold: `50 m`
- min moving speed: `0.5 m/s`
- max displayed speed: `80 m/s`
- max IMU acceleration contribution: `6 m/s²`
- GPS outlier acceleration threshold: `12 m/s²`
- moving/stopped sustain windows: `2.5 s`

Tune these in `modules/v3l0city-speed-engine/common/cpp/SpeedEngine.h` and cover changes with C++ tests.

## Permissions

iOS requires `NSLocationWhenInUseUsageDescription`,
`NSLocationTemporaryUsageDescriptionDictionary`, and
`NSMotionUsageDescription`, already present in `app.json`. The module requests
when-in-use location if authorization has not been determined. On iOS 14+, a
reduced-accuracy location grant is treated as insufficient; V3l0city requests
temporary full accuracy and emits `precise_location_required` if the user keeps
reduced accuracy enabled.

Android declares `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION`, but the
native speed engine requires fine/precise location. Coarse-only approximate
location emits `precise_location_required`. Motion and compass sensors do not
need a separate Android runtime permission for this foreground use case.

Expo Go will not include this local native module. Use development builds:

```bash
npm run ios
npm run android
```

## Simulator Testing

The app has two development-only options for testing speed behavior without
physically moving a device.

### App Drive Simulator

In a development build, open Settings and enable Drive Simulator. The hook uses a
repeatable city/highway profile at 10 Hz, sets `qualityReasons` to
`simulated-drive`, updates heading, accumulates trip distance when recording, and
continues to feed local persistence and telemetry just like live state.

To boot with the app simulator already enabled:

```bash
EXPO_PUBLIC_V3L0CITY_SIMULATED_DRIVE=1 npm run android
```

Use the same env var with `npm run ios` for iOS Simulator.

This path is ideal for UI, trip save/history, export, and telemetry testing. It
does not validate the native platform sensor collectors because it intentionally
bypasses them.

### Android Emulator GPS Route

For Android native-stack testing, run the development build on an emulator,
grant foreground location permission, start a trip, and stream a route from
another terminal:

```bash
npm run android:simulate-drive
```

The script sends `adb emu geo fix <longitude> <latitude> <altitude> <satellites>
<velocity>` samples. Velocity is sent in knots because that is what the Android
emulator console expects. This exercises `FusedLocationProviderClient`, the
Android native module, and the C++ engine.

Optional environment variables:

- `V3L0CITY_SIM_DURATION_SECONDS`, default `75`
- `V3L0CITY_SIM_INTERVAL_SECONDS`, default `0.5`
- `V3L0CITY_SIM_START_LAT`, default `37.7749`
- `V3L0CITY_SIM_START_LON`, default `-122.4194`
- `V3L0CITY_SIM_HEADING_DEGREES`, default `42`
- `V3L0CITY_SIM_ALTITUDE_METERS`, default `12`
- `V3L0CITY_SIM_SATELLITES`, default `10`

For native-path diagnosis, rebuild the Android development app and run:

```bash
npm run android:diagnose-speed
```

This helper turns on the `V3l0citySpeedEngine` Android log tag, grants emulator
foreground location permission, injects a short route, and prints the native
location samples plus computed C++ speed states. A healthy run should show log
lines with non-zero `nativeSpeed`, non-zero `stateSpeed`, `source=gps`, and
quality reasons such as `native-speed-used`.

### iOS Simulator GPS Route

For iOS native-stack testing, run the development build on a booted simulator,
grant foreground location permission, keep V3l0city foregrounded, and stream a
route from another terminal:

```bash
npm run ios:simulate-drive
```

The script sends `xcrun simctl location set <latitude>,<longitude>` fixes using
the same repeatable city/highway profile as Android. iOS Simulator may not attach
a native speed value to manually set fixes, so the C++ core uses distance/time
fallback when `CLLocation.speed` is unavailable. That still exercises
`CLLocationManager`, the Swift Expo Module wrapper, and the shared C++ engine.

Optional environment variables are the same as Android:

- `V3L0CITY_SIM_DURATION_SECONDS`, default `75`
- `V3L0CITY_SIM_INTERVAL_SECONDS`, default `0.5`
- `V3L0CITY_SIM_START_LAT`, default `37.7749`
- `V3L0CITY_SIM_START_LON`, default `-122.4194`
- `V3L0CITY_SIM_HEADING_DEGREES`, default `42`

## Accuracy Notes

Phone GPS speed is not mathematically perfect. V3l0city treats accuracy as measurable quality: no stale speed after timeout, no physically impossible spikes, smooth stop/start behavior, and clear degraded-quality labels. The telemetry stream exists so real-device speed quality can be compared across native samples, local trip exports, and server-ingested data.

## Tests

Run the shared core tests:

```bash
npm run test:speed-engine:cpp
```

Run the JS tests:

```bash
npx jest --runInBand
```

Validate TypeScript and lint:

```bash
npx tsc --noEmit
npm run lint
```

Run the server tests:

```bash
npm run server:test
```

Native validation should include an iOS simulator build and an Android debug APK build after dependency/autolinking changes.

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -workspace ios/V3l0city.xcworkspace \
  -scheme V3l0city \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  build

cd android
JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home" \
  NODE_ENV=development \
  sh ./gradlew :app:assembleDebug
```
