# V3l0city

Digital speedometer built with Expo and React Native.

## Docs

- [Developer guide](docs/developer-guide.md): technical documentation entry point and reading order.
- [Developer docs](docs/developer/README.md): subsystem docs for architecture, mobile frontend, native speed engine, local data, telemetry/backend, cloud/social, testing, and code ownership.
- [User guide](docs/user-guide.md): customer-facing guide for using V3l0city on iOS and Android, including onboarding, trips, settings, history, export, permissions, privacy, and troubleshooting.
- [Native speed engine](docs/speed-engine.md): platform sensor flow, C++ speed rules, quality diagnostics, and native validation.
- [Telemetry API](docs/telemetry-api.md): Fastify server setup, HTTP contracts, WebSocket contracts, mobile env vars, and retry behavior.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Run a development build

   ```bash
   npm run ios
   # or
   npm run android
   ```

3. Start Metro directly only when a development build is already installed

   ```bash
   npm run start
   ```

Expo Go is not the target runtime for this project because the native
`V3l0citySpeedEngine` Expo Module must be compiled into the app. Use iOS and
Android development builds for real speed-engine testing.

Expo Router screens live in `app/`. Shared application code lives in `src/` so Expo Router does not treat helpers, hooks, storage, and API clients as routes.

## iOS development build

This project now includes a generated native iOS project under `ios/`.

Prerequisites:

- macOS with Xcode installed.
- CocoaPods installed (`pod --version` should print a version).
- Node dependencies installed with `npm install`.

Build for the iOS simulator:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -workspace ios/V3l0city.xcworkspace \
  -scheme V3l0city \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  build
```

Run through Expo:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run ios
```

Open the iOS project in Xcode with `ios/V3l0city.xcworkspace`.
Use the workspace, not the `.xcodeproj`, because CocoaPods dependencies are linked there.

When native config in `app.json` changes, sync it into `ios/` with:

```bash
npx expo prebuild --platform ios
cd ios && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer pod install
```

## Android development build

This project uses the package id `com.v3l0city.app`.

Build a debug APK:

```bash
cd android
JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home" \
  NODE_ENV=development \
  sh ./gradlew :app:assembleDebug
```

Run through Expo:

```bash
npm run android
```

The project script sets `ANDROID_HOME` to the default macOS SDK location
(`~/Library/Android/sdk`) and `JAVA_HOME` to Homebrew OpenJDK 17 when needed,
then adds `adb`, `emulator`, and `java` to `PATH`. If no Android device is
connected, Expo will try to start an available AVD such as `Pixel_10_Pro`.

## Testing Without Physical Motion

For simulator/emulator testing, use one of the built-in drive paths:

- App-level simulation: in a development build, open **Settings** and turn on
  **Drive Simulator**. This bypasses native sensors and drives the dashboard,
  trip recording, local storage, and telemetry path with a repeatable synthetic
  city/highway profile. You can also start with it enabled:

  ```bash
  EXPO_PUBLIC_V3L0CITY_SIMULATED_DRIVE=1 npm run android
  ```

  For iOS, use the same env var with `npm run ios`.

- Android native-location simulation: run the app on an Android emulator, grant
  location permission, start a trip, then run this in another terminal:

  ```bash
  npm run android:simulate-drive
  ```

  This sends `adb emu geo fix` samples, including velocity, into the emulator so
  the Android native location collector and C++ speed engine see movement. Tune
  the route with `V3L0CITY_SIM_DURATION_SECONDS`,
  `V3L0CITY_SIM_INTERVAL_SECONDS`, `V3L0CITY_SIM_START_LAT`,
  `V3L0CITY_SIM_START_LON`, and `V3L0CITY_SIM_HEADING_DEGREES`.

  To verify the native Android path end to end, rebuild the app once, keep it
  foregrounded, and run:

  ```bash
  npm run android:diagnose-speed
  ```

  The diagnostic grants foreground location permission on the emulator, enables
  `V3l0citySpeedEngine` debug logs, injects a short GPS route, then prints the
  native location samples and computed C++ speed states from logcat.

- iOS native-location simulation: run the app on a booted iOS simulator, grant
  location permission, keep V3l0city foregrounded, then run this in another
  terminal:

  ```bash
  npm run ios:simulate-drive
  ```

  This streams `xcrun simctl location set <lat>,<lon>` fixes using the same
  city/highway route profile as Android. Core Location may not provide native
  speed for these injected fixes, so the C++ engine uses distance/time fallback
  for the dial and trip stats. Tune the route with the same `V3L0CITY_SIM_*`
  variables listed above.

## Architecture

- Entry: `index.js` → `expo-router/entry` → `app/index.tsx`.
- Root screen: `app/index.tsx` initializes local storage, mounts the app providers, and renders the main `Speedometer` screen.
- Core speed logic is native-first:
  - `modules/v3l0city-speed-engine` is a local Expo Module linked through a `file:` dependency and Expo autolinking.
  - Swift owns iOS foreground `CLLocationManager` + `CoreMotion` collection. Kotlin owns Android foreground `FusedLocationProviderClient` + `SensorManager` collection.
  - Both platforms normalize samples into the shared C++ core in `modules/v3l0city-speed-engine/common/cpp`, which computes speed, trip stats, vehicle direction, heading diagnostics, quality, movement flags, and stale state.
  - Native modules emit `speedUpdate` events at up to 10 Hz so the dial stays responsive without forcing unnecessary React renders.
- React Native integration lives in `src/hooks/useVelocitySensors.ts`:
  - Uses `V3l0citySpeedEngine` by default in iOS/Android development builds.
  - Keeps a JS fallback using `expo-location`, `expo-sensors`, `src/hooks/useKalmanSpeedFilter.ts`, and helpers in `src/utils/` for tests and unsupported runtimes such as Expo Go.
  - Exposes the same derived state shape to the UI: speed, distance, average/max speed, heading, heading source/quality, permission/status, signal quality, and sensor availability.
- UI components in `src/components/`:
  - `speedometer.tsx`: dashboard UI, units and mount selection, trip controls, history toggle, and settings panel.
  - `Compass.tsx`, `AverageSpeedDisplay.tsx`, `ResetButton.tsx`, `TripHistory.tsx`, `DebugOverlay.tsx`.
- Domain and storage:
  - Trip model: `src/domain/trip.ts`.
  - SQLite setup and legacy AsyncStorage migration: `src/database/database.ts`.
  - Trip persistence: `src/database/tripRepository.ts`, including the 2 Hz per-trip `trip_speed_samples` stream captured while recording.
  - User preferences: `src/database/preferencesRepository.ts`.
  - Data export: `src/database/exportService.ts`, including trip speed timelines in JSON/CSV exports.
- API and telemetry:
  - `server/src/` contains the Fastify + WebSocket + SQLite telemetry backend.
  - `src/api/` contains anonymous device registration, HTTP batch upload, WebSocket live streaming, and retry/fallback orchestration.
  - Set `EXPO_PUBLIC_V3L0CITY_API_URL` and `EXPO_PUBLIC_V3L0CITY_WS_URL` to enable mobile telemetry. If either is missing, telemetry is disabled and local trip recording still works.
- Cloud and social:
  - `src/cloud/` contains provider-neutral auth, sync, and social interfaces plus the Supabase adapter.
  - `supabase/` contains migrations and authenticated Edge Functions for optional accounts, cloud sync, friends, nearby discovery, and aggregate leaderboards.
  - Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to enable cloud features. If either is missing, the app remains local/offline first.

## Sensors and limitations

- The native engine is foreground-only. It stops native collectors when the app backgrounds.
- Expo Go is not a target for the native engine; use an iOS or Android development build so the local Expo Module is compiled into the app.
- The C++ core prefers valid native GPS speed, falls back to distance/time, rejects poor or outlier GPS, predicts between GPS fixes with IMU input, and decays to `0` after stale GPS.
- The compass prefers GPS course while moving, falls back to device heading when stopped/slow, and requires precise foreground location. Coarse/approximate location shows a precise-location-required state.
- Speed quality is diagnostic, not magical: samples include `qualityScore`, quality reasons, GPS accuracy, fix age, and native-speed usage so real-device behavior can be audited.
- Backend streaming is a sidecar. Network failures never stop local speed calculation, trip recording, or local trip saving.

## Telemetry server

Run the local backend with:

```bash
npm run server:dev
```

The server listens on `0.0.0.0:8787` by default and stores SQLite data in
`server/data/v3l0city.sqlite`. Override these values with:

```bash
PORT=8787
HOST=0.0.0.0
V3L0CITY_SERVER_DB=server/data/v3l0city.sqlite
V3L0CITY_PUBLIC_WS_URL=ws://192.168.1.25:8787
```

For a device on the same network, use LAN URLs, for example:

```bash
EXPO_PUBLIC_V3L0CITY_API_URL=http://192.168.1.25:8787 \
EXPO_PUBLIC_V3L0CITY_WS_URL=ws://192.168.1.25:8787 \
npm run ios
```

If either mobile env var is missing, telemetry stays disabled. Local speed
calculation, trip recording, export, and trip history still work. Production
deployments must use HTTPS/WSS.

Optional Supabase cloud/social features use:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co \
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
npm run ios
```

Use a publishable key only. Never put a Supabase secret or service-role key in
the app bundle.

## Testing

- Unit tests live under `__tests__/` and are run with:

  ```bash
  npm test
  ```

- C++ speed-engine tests can be run with:

  ```bash
  npm run test:speed-engine:cpp
  ```

- Server tests can be run with:

  ```bash
  npm run server:test
  ```

- Tests cover speed math, motion math, the Kalman adapter, native hook integration, telemetry client/socket behavior, export formatting, C++ core diagnostics, and server API/WebSocket flows.

Full native validation commands are listed in the speed-engine doc.
