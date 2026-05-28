# Testing and Operations

This guide covers local commands, validation expectations, simulator workflows,
environment variables, and common troubleshooting paths.

## Install

```bash
npm install
```

## Run the App

iOS development build:

```bash
npm run ios
```

Android development build:

```bash
npm run android
```

Metro only, after a development build is already installed:

```bash
npm run start
```

Web:

```bash
npm run web
```

The native speed engine is not available in Expo Go. Use development builds for
iOS and Android speed-engine testing.

## Backend

Development server:

```bash
npm run server:dev
```

Single-run server:

```bash
npm run server:start
```

Default backend values:

- `PORT=8787`
- `HOST=0.0.0.0`
- `V3L0CITY_SERVER_DB=server/data/v3l0city.sqlite`

## Validation Matrix

Run these before handing off meaningful changes:

```bash
npx tsc --noEmit
npx jest --runInBand
npm run lint
npm run test:speed-engine:cpp
npm run server:test
```

Native build validation:

```bash
npx expo run:ios --no-bundler
```

```bash
cd android
JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home" \
  NODE_ENV=development \
  sh ./gradlew :app:assembleDebug
```

Use full native builds after changes to:

- package dependencies
- Expo module configuration
- native iOS or Android files
- C++ code
- app permissions
- app identifiers
- Gradle or CocoaPods configuration

## Test Types

### TypeScript

```bash
npx tsc --noEmit
```

Validates TypeScript across app and server code.

### Jest

```bash
npx jest --runInBand
```

Covers:

- UI snapshots and rendering.
- speed math
- motion math
- Kalman adapter
- sensor guards
- native hook integration
- precise-location-required status mapping
- telemetry API/client behavior
- export formatting

### C++ Speed Engine

```bash
npm run test:speed-engine:cpp
```

Covers:

- native GPS speed preference
- distance/time fallback
- invalid negative speed fallback
- stale timeout decay
- IMU prediction
- GPS outlier rejection
- quality score and reason behavior
- GPS course/device-heading selection
- mount offset behavior for device heading
- heading quality diagnostics

### Server

```bash
npm run server:test
```

Covers:

- device registration
- trip creation
- session tokens
- batch validation
- duplicate batch/sample behavior
- trip completion
- WebSocket acknowledgements

### Lint

```bash
npm run lint
```

The current project may show warnings. Treat new warnings as worth fixing even
when lint exits successfully.

## Simulator Workflows

### App-Level Drive Simulator

Use this for UI, local storage, export, and telemetry testing without native
sensor validation.

From settings:

1. Open a development build.
2. Open Settings.
3. Turn on Drive Simulator.

Or at launch:

```bash
EXPO_PUBLIC_V3L0CITY_SIMULATED_DRIVE=1 npm run ios
```

```bash
EXPO_PUBLIC_V3L0CITY_SIMULATED_DRIVE=1 npm run android
```

### iOS Native Location Simulation

Terminal 1:

```bash
npm run ios
```

Terminal 2:

```bash
npm run ios:simulate-drive
```

The script targets the first booted simulator unless `IOS_SIMULATOR_UDID` is
set.

Useful overrides:

```bash
V3L0CITY_SIM_DURATION_SECONDS=120 npm run ios:simulate-drive
V3L0CITY_SIM_INTERVAL_SECONDS=0.25 npm run ios:simulate-drive
IOS_SIMULATOR_UDID=<udid> npm run ios:simulate-drive
```

Expected behavior:

- The route starts stopped for roughly 1.5 seconds.
- Speed ramps up after the initial stop.
- iOS may not provide native speed for injected fixes.
- Distance/time fallback should still move the dial.

### Android Native Location Simulation

Terminal 1:

```bash
npm run android
```

Terminal 2:

```bash
npm run android:simulate-drive
```

The script targets the first running Android emulator unless `ANDROID_SERIAL` is
set.

Useful overrides:

```bash
V3L0CITY_SIM_DURATION_SECONDS=120 npm run android:simulate-drive
V3L0CITY_SIM_INTERVAL_SECONDS=0.25 npm run android:simulate-drive
ANDROID_SERIAL=emulator-5554 npm run android:simulate-drive
```

### Android Native Diagnosis

```bash
npm run android:diagnose-speed
```

This helper:

- grants foreground location permission
- enables the Android native speed-engine log tag
- injects a route
- prints native location samples and computed speed states

Use this when the Android UI appears stuck at zero.

For compass diagnosis, watch the debug overlay while running a simulated route.
Moving samples should show `headingSource=course`; stopped or slow samples
should show `headingSource=device` when rotation-vector data is available, or
`none` when the simulator has no usable compass fallback.

## Environment Variables

### Mobile Telemetry

```bash
EXPO_PUBLIC_V3L0CITY_API_URL=http://<lan-ip>:8787
EXPO_PUBLIC_V3L0CITY_WS_URL=ws://<lan-ip>:8787
```

Telemetry is disabled unless both are valid.

### Supabase Cloud and Social

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Cloud sync, account, friends, nearby discovery, and leaderboards are disabled
unless both are valid. The local app continues to work without them.

### Drive Simulation

```bash
EXPO_PUBLIC_V3L0CITY_SIMULATED_DRIVE=1
V3L0CITY_SIM_DURATION_SECONDS=75
V3L0CITY_SIM_INTERVAL_SECONDS=0.5
V3L0CITY_SIM_START_LAT=37.7749
V3L0CITY_SIM_START_LON=-122.4194
V3L0CITY_SIM_HEADING_DEGREES=42
```

Android-only:

```bash
V3L0CITY_SIM_ALTITUDE_METERS=12
V3L0CITY_SIM_SATELLITES=10
ANDROID_SERIAL=emulator-5554
```

iOS-only:

```bash
IOS_SIMULATOR_UDID=<udid>
V3L0CITY_IOS_BUNDLE_ID=com.v3l0city.app
```

### Backend

```bash
PORT=8787
HOST=0.0.0.0
V3L0CITY_SERVER_DB=server/data/v3l0city.sqlite
V3L0CITY_PUBLIC_WS_URL=ws://<public-host>:8787
```

## Common Issues

### Expo Go warnings or native module missing

Use a development build:

```bash
npm run ios
npm run android
```

Expo Go does not include `V3l0citySpeedEngine`.

### iOS `kCLErrorDomain error 0`

This is Core Location's transient "location unknown" state. The native module
ignores this error because it often appears before the first GPS fix.

### iOS CoreMotion plist warning

Simulator logs may show a CoreMotion preferences file warning. This is simulator
noise and does not mean V3l0city failed.

### Android `gradlew EACCES`

Make Gradle wrapper executable:

```bash
chmod +x android/gradlew
```

### Android Java runtime missing

Install Java 17:

```bash
brew install openjdk@17
```

`scripts/run-android.sh` tries to discover Homebrew OpenJDK automatically.

### Android emulator missing

Create an AVD in Android Studio. Then rerun:

```bash
npm run android
```

The run script can start a configured emulator if no device is connected.

### Android 16 KB page-size compatibility warning

Recent Android images can warn about native library alignment. It may not block
debug testing, but production releases should be checked against the current
Android NDK and React Native/Expo native dependency support.

### Telemetry disabled

Check both mobile env vars:

```bash
EXPO_PUBLIC_V3L0CITY_API_URL
EXPO_PUBLIC_V3L0CITY_WS_URL
```

Both must be valid URLs. Placeholder values such as `<lan-ip>` are ignored by
the config loader.

### Cloud sync disabled

Check both Supabase mobile env vars:

```bash
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Use a publishable key only. Never expose a Supabase secret or service-role key
in the app bundle.

### Precise location required

The native engine intentionally rejects approximate/coarse location.

- iOS: enable Settings > Privacy & Security > Location Services > V3l0city >
  Precise Location.
- Android: grant precise location in app permissions. If an emulator still
  reports coarse-only permission, revoke and grant location again with `adb` or
  reinstall the debug app.

### Speed stays at zero in simulator

Check:

- App is foregrounded.
- Location permission is granted.
- Drive Simulator is off when testing native route injection.
- Route script is running in another terminal.
- Wait past the route's initial stopped period.
- Use Android diagnosis logs if Android is stuck.

## Release and Production Notes

Production work should include:

- Real-device road testing.
- iOS and Android permission copy review.
- HTTPS/WSS backend deployment.
- Token and database hardening.
- Privacy review for telemetry data.
- Battery behavior testing.
- App Store and Play Store background/location policy review if background
  tracking is ever added.
