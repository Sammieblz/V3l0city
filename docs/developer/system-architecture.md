# System Architecture

V3l0city is a foreground-only speedometer, trip recorder, and optional telemetry
client. The system is designed around one rule: local speed and local trip
recording must keep working even when the backend is missing, offline, slow, or
misconfigured.

Supabase-powered account, sync, friends, nearby discovery, and leaderboard
features are optional. They are layered on top of SQLite and must never become a
precondition for speed, history, insights, or exports.

## Product Responsibilities

The app is responsible for:

- Showing live speed and heading.
- Showing signal quality, speed source, heading source, and heading quality.
- Recording trips with distance, average speed, max speed, and a 2 Hz speed
  sample timeline.
- Saving trip history locally.
- Exporting trip data.
- Optionally streaming telemetry for active trips.
- Optionally syncing saved trips to the user's cloud account.
- Showing aggregate social comparisons when the user signs in and opts in.

The backend is responsible for:

- Anonymous device registration.
- Remote trip creation.
- Live WebSocket sample intake.
- Idempotent HTTP batch retries.
- Trip completion summaries.
- Development/debug trip summaries.

The Supabase cloud/social backend is responsible for:

- Email auth.
- User profiles and signed-in devices.
- Cloud trip restore and local-wins sync.
- Friend requests and accepted relationships.
- Coarse opt-in nearby discovery.
- Aggregate leaderboard entries.

The backend is not responsible for live speed calculation. The speedometer must
not wait on the network.

## Runtime Boundaries

```text
React Native UI
  |
  | uses VelocitySensorsState
  v
src/hooks/useVelocitySensors.ts
  |
  | native default, JS fallback in unsupported runtimes
  v
V3l0citySpeedEngine Expo Module
  |
  | Swift/Kotlin normalize platform samples
  v
Shared C++ SpeedEngine
  |
  | emits speed, stats, heading, source, quality, diagnostics
  v
React Native UI and trip recorder
  |
  | 2 Hz trip samples, local-first
  v
SQLite local database
  |
  | latest DriveSurfaceSnapshot, optional
  v
iOS WidgetKit / Live Activity and Android widget / active-trip notification
  |
  | optional sidecars
  v
Telemetry WebSocket and HTTP API
  |
  | optional account/social layer
  v
Supabase Auth, Postgres, RLS, Edge Functions
```

## Tech Stack

### Mobile

- Expo SDK 54.
- React Native 0.81.
- React 19.
- Expo Router for app entry.
- React Native Paper for application UI primitives.
- React Native SVG for speed dial and compass visuals.
- Expo SQLite for local persistence.
- Expo FileSystem and Sharing for exports.
- Expo Screen Orientation for portrait, landscape, and auto modes.
- Expo Notifications for themed trip-saved notifications and optional push
  token registration on iOS/Android development or production builds.
- Native WidgetKit, ActivityKit, and Android AppWidgetProvider surfaces for
  glanceable active-trip snapshots.
- Supabase JS for optional signed-in cloud sync and social features.
- Expo SecureStore for Supabase auth session persistence.
- AsyncStorage for non-secret install flags such as first-install onboarding.

The live compass is a vehicle-direction compass. The native engine prefers GPS
course while moving, uses device heading when stopped/slow, and marks the
heading source and quality for UI, storage, export, and telemetry.

### Native Module

- Expo Modules API.
- Swift on iOS.
- Kotlin on Android.
- Objective-C++ and JNI bridges.
- Shared C++ core.
- CMake for Android native build.
- CocoaPods podspec for iOS integration.

### Backend

- Node TypeScript.
- Fastify.
- `@fastify/websocket`.
- `better-sqlite3`.
- Zod.
- `tsx`.

### Cloud and Social

- Supabase Auth for optional email sign-in.
- Supabase Postgres with RLS for cloud trips, profiles, friends, and
  leaderboards.
- Supabase Edge Functions for authenticated sync and social operations.
- Provider-neutral TypeScript interfaces in the mobile app so Supabase can be
  replaced later.

## Repository Layout

```text
app/
  index.tsx

src/
  api/
  components/
  constants/
  database/
  domain/
  hooks/
  theme/
  utils/

modules/v3l0city-speed-engine/
  android/
  ios/
  common/cpp/
  index.js
  index.d.ts
  package.json

server/src/
  app.ts
  contracts.ts
  index.ts
  store.ts
  app.test.ts

scripts/
  run-ios.sh
  run-android.sh
  simulate-ios-drive.sh
  simulate-android-drive.sh
  diagnose-android-speed.sh

docs/
  developer/
  speed-engine.md
  telemetry-api.md
  user-guide.md
```

## Boot Flow

1. `index.js` imports `expo-router/entry`.
2. Expo Router resolves `app/index.tsx`.
3. `app/index.tsx` sets the system UI background color.
4. `initDatabase()` opens `velocity.db`, creates tables, runs migrations, and
   performs best-effort legacy AsyncStorage migration.
5. The app waits for the database to be ready before rendering the dashboard.
6. Providers are mounted:
   - `SafeAreaProvider`
   - React Native Paper `Provider`
   - Expo `StatusBar`
7. `Speedometer` renders the main app.

The database gate avoids a class of bugs where the UI shows default settings or
empty history before storage has loaded.

## Primary Data Flows

### Live Speed Flow

```text
Platform sensors
  -> native collector
  -> C++ engine
  -> speedUpdate event
  -> useVelocitySensors
  -> Speedometer render
```

Live updates are emitted at up to 10 Hz. The UI renders from the hook state.

### Trip Recording Flow

```text
Speedometer active trip state
  -> reads VelocitySensorsState
  -> captures one sample every 500 ms
  -> keeps samples in memory during active trip
  -> saveTrip writes trip and samples to SQLite
```

Trip samples are tied to active, unpaused trips. The dashboard can still show
live speed without a trip being active.

### Telemetry Flow

```text
Trip sample captured locally
  -> tripTelemetryService.recordSample
  -> WebSocket batch of five samples when connected
  -> server ack marks local samples uploaded
  -> HTTP batch retry on trip completion for anything pending
```

Telemetry consumes local trip samples. Network failures do not block the local
write path.

### Cloud Sync Flow

```text
SQLite trip/save/delete
  -> sync metadata and sync_outbox
  -> optional Supabase sync service
  -> Edge Function validates user JWT
  -> Postgres rows protected by RLS
  -> restore inserts cloud trips only when missing locally
```

Local rows win. Cloud sync errors are surfaced as non-blocking status and never
delete local data.

### Export Flow

```text
User selects JSON or CSV
  -> read trips from SQLite
  -> read trip_speed_samples for each trip
  -> build export payload/string
  -> write file to app document storage
  -> open platform share sheet
```

## Foreground-Only Constraint

The native speed engine stops collectors when the app enters the background.
Background route tracking is not implemented. `autoSave` saves an active trip on
background transition, but it does not continue recording in the background.

Any future background tracking work should be treated as a major architecture
change. It would require explicit platform permissions, foreground service
handling on Android, background location modes on iOS, battery policy decisions,
and new user-facing privacy copy.

## Accuracy Philosophy

V3l0city does not claim mathematically perfect speed. It aims for observable,
bounded, diagnosable speed quality:

- Prefer native GPS speed when valid.
- Fall back to distance/time when native speed is missing.
- Reject poor accuracy and extreme outliers.
- Predict between GPS fixes with IMU data.
- Decay stale speed to zero.
- Expose quality score, heading quality, and reason labels.

This lets developers and testers understand why a reading is trusted or
degraded.

## Failure Boundaries

Expected failure handling:

- No location permission: show permission state, do not crash.
- Approximate/coarse location: show precise-location-required state.
- No native module: fall back to JS sensors when possible.
- No telemetry env vars: local app continues with telemetry disabled.
- WebSocket disconnected: keep local trip recording, retry or flush over HTTP.
- Server down: local trip save still succeeds.
- Supabase missing or signed out: account/social screens show offline/auth
  states, local app continues.
- Sync conflict: current-device local row wins.
- Export failure: show a toast, do not corrupt local data.

## Development Build Requirement

Expo Go does not include the local native module. Use development builds for
native speed-engine testing:

```bash
npm run ios
npm run android
```

`npm run start` is useful only after a development build is already installed.
