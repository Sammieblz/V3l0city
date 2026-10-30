# Testing and Operations

This guide covers local commands, validation expectations, simulator workflows,
environment variables, and common troubleshooting paths.

## Install

```bash
npm ci
```

Use the Node version in the root `.node-version` (24.19.0 for this foundation).
The root and independent `web/` project have separate lockfiles: run `npm ci` in
each directory. Keep generated dependency directories and real `.env` files out
of commits. Windows shells can use `npm.cmd`/`npx.cmd` when PowerShell blocks
the `.ps1` wrappers. Native builds still require the platform's Xcode/CocoaPods
or Android SDK/JDK toolchain.

Local-storage regression fixtures use `better-sqlite3` against temporary files:
old/current upgrades, killed-process rollback, real `SQLITE_FULL`, controller
recovery, import receipts and account-scoped cache cleanup. They do not open an
installed app's database or any hosted provider. See the
[Local recording implementation record](./local-recording-implementation-record.md)
for remaining device gates.

`npm run test:glance-projections` compiles and executes the framework-free Swift
and Kotlin helpers actually used by native glance managers. It requires `swiftc`,
`kotlinc` and `java` on PATH (or exact `GLANCE_SWIFTC`, `GLANCE_KOTLINC`,
`GLANCE_JAVA` executable paths). Missing compilers fail; there is no skip mode.
The mandatory native CI job runs these alongside the C++ suite. This is separate
from compiling the full iOS/Android app and testing widgets on physical devices.

PR CI also exports both Android and iOS JavaScript/Hermes bundles with Metro.
Local equivalent: `npx expo export --platform android --platform ios --max-workers 2`.
Bundle success proves packaging, not native SDK or device behavior.

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

The independent public Next.js site is run and validated from `web/`:

```bash
cd web
npm ci
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build:ci
npx playwright install chromium
npm run test:e2e
```

`build:ci` creates a production Next.js artifact using synthetic public/legal
values, disables reuse of repository-root provider configuration and leaves
hosted authentication/CAPTCHA disabled. Always run it immediately before E2E;
`test:e2e` requires `.next/BUILD_ID` and starts `next start` at
`http://127.0.0.1:3100`. It fails if another server owns that port, rather than
testing a previously running development server. The ordinary `build` and
`start` commands retain the existing web deployment configuration.

CI installs browser/system dependencies with
`npx playwright install --with-deps chromium`. Both desktop and mobile-emulation
projects run public navigation, theme, metadata, demo and unavailable-auth
journeys. Cross-origin browser requests are blocked in these fixtures. HTML,
JUnit, trace and screenshot artifacts under `web/playwright-report/` and
`web/test-results/` contain only synthetic public journeys; do not add real
accounts/tokens to these tests. This is browser emulation, not physical-phone
or owned-backend integration evidence.

The native speed engine is not available in Expo Go. Use development builds for
iOS and Android speed-engine testing.

## Backend

The [v2 foundation guide](backend-foundations.md) describes validated deployment
configuration and the current telemetry-only health endpoints. Product `/v2`
contracts are declared separately and are not mounted yet.

Development server:

```bash
npm run server:dev
```

Single-run server:

```bash
npm run server:build
npm run server:start
```

Run the compiled server suite with `npm run server:test`, shared contracts with
`npm run shared:test`, and generated contract drift with `npm run contracts:check`.
PostgreSQL integration requires an isolated `TEST_DATABASE_URL`; see
[PostgreSQL operations](postgresql.md). No database URL means those integration
tests are skipped, not accepted as passing. On Windows use `.cmd` wrappers when
PowerShell execution policy blocks `.ps1`.

For required checks, use `npm run server:test:ci` with an explicit disposable
`TEST_DATABASE_URL`, for example a separately provisioned PostgreSQL database
named `v3l0city_ci_test`. The CI command rejects a missing URL; the database
suite validates its isolated test target. Never aim it at a retained account or
production database. See the PostgreSQL guide for required fixture privileges.

Default backend values:

- `PORT=8787`
- `HOST=0.0.0.0`
- `V3L0CITY_SERVER_DB=server/data/v3l0city.sqlite`

## Validation Matrix

Run these before handing off meaningful changes:

```bash
npm run typecheck
npm run test:ci
npm run lint
npm run test:speed-engine:cpp
npm run server:test:ci
npm run shared:test
npm run contracts:check
npm run docs:check
```

Set the isolated PostgreSQL URL before the server command. Unit success with
database tests skipped does not satisfy this matrix. C++ regressions are a
mandatory independent gate; a coverage percentage or UI snapshot cannot waive
them. Do not run concurrent build/contract commands against the same `dist/`
directory. Separate CI jobs use separate checkouts; sequential steps may share
their own outputs.

The [PR checklist](../../.github/pull_request_template.md) records the exact
commit, fixtures, commands, results and outstanding gates. Branch-required
checks must match checks that actually execute; an existing Vercel deployment
status alone is not mobile/server/C++/database test evidence. This foundation
does not complete release-wide #32, #33 or #48 acceptance.

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
npm run typecheck
```

Validates TypeScript across app and server code.

### Jest

```bash
npm run test:ci
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
- persisted appearance-preference behavior

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
npm run server:test:ci
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

Use this for UI, local storage, export, telemetry, widgets, and Live Activity
testing without native sensor validation.

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

During an active simulated trip, native iOS and Android modules continue the
same city/highway profile for drive surfaces. This means the home-screen widget,
Live Activity, and Android active-trip notification can be inspected after the
app is minimized. It still does not exercise real GPS or motion collectors.

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

## Historical v1.0.0 Release Readiness

The checklist below describes the retained v1 release and legacy provider
paths. It is historical compatibility guidance, not the setup requirement or
acceptance claim for the owned v2 backend. The v2 provider transition and data
preservation gates are documented in [domain and migration foundations](owned-domain-and-migration.md).

V3l0city v1.0.0 excludes CarPlay and Android Auto from production binaries.
Widgets, iOS Live Activity, Android widgets, and the Android active-trip
notification are the supported car/glance surfaces for this release.

Before submitting store builds, verify:

- Built iOS `Info.plist` does not contain
  `CPTemplateApplicationSceneSessionRoleApplication`.
- Release entitlements do not contain `com.apple.developer.carplay-maps`.
- Merged Android manifest does not contain
  `com.google.android.gms.car.application`, `androidx.car.app.CarAppService`,
  `NAVIGATION_TEMPLATES`, `MAP_TEMPLATES`, or `ACCESS_SURFACE`.
- `react-native-carplay` remains disabled in `react-native.config.js`.

Store checklist:

- App Store Connect privacy labels disclose account/profile data, optional
  cloud sync, coarse nearby discovery, trip aggregates, location use, push
  tokens, and diagnostics/telemetry if enabled.
- Google Play Data Safety matches the same data inventory.
- Google Play foreground service declaration explains user-started active-trip
  speed tracking and the active-trip notification.
- Google Play background location declaration explains that background location
  is used only during user-started active trips for live widgets/notifications
  and stops when the trip is saved.
- Supabase migrations and Edge Functions are deployed before testing account,
  backup, friends, nearby, and leaderboards.
- Production EAS environment values are configured outside git.

Manual release QA:

- Offline first install, local trip save, draft recovery, JSON export/import.
- iOS widgets and Live Activity during an active trip.
- Android widget and active-trip foreground notification.
- Supabase sign-up/sign-in, backup, restore, friends, nearby, leaderboards.
- Permission flows for denied, approximate, foreground-only, and background
  location states.

## Environment Variables

### Mobile Telemetry

```bash
EXPO_PUBLIC_V3L0CITY_API_URL=http://<lan-ip>:8787
EXPO_PUBLIC_V3L0CITY_WS_URL=ws://<lan-ip>:8787
```

Telemetry is disabled unless both are valid.

### Retained Legacy Mobile Auth and Social

```bash
EXPO_PUBLIC_V3L0CITY_CLOUD_PROVIDER=legacy-supabase
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Local is the default even when the two old public values exist. The explicit
provider selection and valid public configuration enable only the retained
legacy adapter. Personal backup/restore denies access pending persisted
recording ownership and adoption consent; onboarding/sign-in must not upload
unclaimed local history. Existing provider accounts/data must be preserved.
The independent Next.js site's legacy adapter is separate and still awaits the
v2 migration/parity work; public smoke tests do not verify that hosted adapter.

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

Check the deliberate legacy provider selection and its public configuration:

```bash
EXPO_PUBLIC_V3L0CITY_CLOUD_PROVIDER=legacy-supabase
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Use a publishable key only. Never expose a Supabase secret or service-role key
in the app bundle.

Personal backup/restore remains unavailable until persisted ownership/adoption
is wired, even with a valid legacy login. Keep local history/export available;
do not work around that gate by uploading every recording to the active user.

### Precise location required

The native engine intentionally rejects approximate/coarse location.

- iOS: enable Settings > Privacy & Security > Location Services > V3l0city >
  Precise Location.
- Android: grant precise location in app permissions. If an emulator still
  reports coarse-only permission, revoke and grant location again with `adb` or
  reinstall the debug app.

### Speed stays at zero in simulator

Check:

- If Drive Simulator is on, rebuild the development app after native changes and
  start a trip before checking widgets.
- For app-level Drive Simulator widget testing, the app may be minimized after
  the trip starts.
- For native route-injection testing, keep the app foregrounded until the native
  collectors have started, then use widgets only after an active trip exists.
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
