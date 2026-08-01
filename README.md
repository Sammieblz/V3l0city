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

## Public Web Project

The public Next.js site and browser simulator live independently in
[`web/`](web/README.md). It is not the Expo Web command (`npm run web`). Start
it from its own project directory:

```bash
cd web
npm run dev
```

The public site follows the visitor's browser light/dark preference by default.
Its landing-page appearance control can override that choice for every Next.js
route using browser-local storage. Reading the browser preference and storing
that choice do not request a browser permission.

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

## Android production release

The native Android app is separate from the Next.js site in `web/`. Its Play
Store identity is `com.v3l0city.app`, its current release version is `1.0.0`,
and production builds are Android App Bundles (`.aab`), not web deployments.

1. Configure the `production` EAS environment with only the mobile public
   values that the app needs, including `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` when cloud features are enabled.
   Also configure every `EXPO_PUBLIC_LEGAL_*` value from `.env.example` with
   the same legal entity, contacts, effective date, and document version used
   by the matching `NEXT_PUBLIC_LEGAL_*` values in Vercel. The production
   native config refuses to build when a required legal value is missing.
   Do not put a Supabase service-role key, Play signing key, or other private
   credential in Expo public variables or Git.
2. Sign in to the EAS account that owns the Android package and let EAS manage
   the upload key, or configure the existing upload key in EAS credentials.
3. Create the store bundle:

   ```bash
   npx eas-cli build --platform android --profile production
   ```

   The profile uses the EAS `production` environment, produces an `.aab` for
   the Play Store, and automatically increments the Android version code. Keep
   the human-readable `expo.version` and `android/app/build.gradle`
   `versionName` aligned whenever you make a user-visible release.
4. Install the generated bundle through an internal Play testing track before
   production submission. The Play Console receives the `.aab`; source code is
   retained in this Git repository and is not uploaded to Google Play.

Use a native tag such as `android-v1.0.0` for the release. Do not reuse the web
tag `web-v0.1.0`; the two shells have independent release pipelines.

## Testing Without Physical Motion

For simulator/emulator testing, use one of the built-in drive paths:

- App-level simulation: in a development build, open **Settings** and turn on
  **Drive Simulator**. This bypasses native sensors and drives the dashboard,
  trip recording, local storage, telemetry path, widgets, and Live Activity with
  a repeatable synthetic city/highway profile. You can also start with it
  enabled:

  ```bash
  EXPO_PUBLIC_V3L0CITY_SIMULATED_DRIVE=1 npm run android
  ```

  For iOS, use the same env var with `npm run ios`. This is the easiest way to
  test widget visuals without physically moving a device. It does not validate
  the real native GPS/motion collectors.

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
  - User-started active trips also start a native live drive session for widgets, Live Activity, and the Android active-trip notification. Those surfaces publish at about 1 Hz and stop when the trip is saved.
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

- The native engine is foreground-first until a trip starts. During a user-started active trip, native live sessions may keep collectors running for widgets, Live Activity, and the Android active-trip notification.
- Android asks for precise location only after the user selects **Start Trip**
  and accepts the in-app explanation. V3l0city does not declare or request
  Android background location; the visible active-trip foreground notification
  communicates the limited period in which Android may keep collecting.
- Widgets do not passively start GPS. Start a trip in the app first; save/stop the trip to end live surface tracking.
- CarPlay/Android Auto are excluded from the v1.0.0 production binaries. The
  supported car/glance surfaces for v1 are iOS Live Activity/widgets and Android
  widgets/active-trip notifications.
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
