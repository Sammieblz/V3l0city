# Mobile Frontend

The mobile app is a single-screen Expo Router application with a dashboard,
settings sheet, history view, export actions, and developer diagnostics. The
frontend owns presentation, trip session state, preference changes, local trip
capture, and telemetry handoff.

## Entry and Providers

`app/index.tsx` is the only app route.

Responsibilities:

- Set the native system background color to the app background.
- Initialize SQLite through `initDatabase()`.
- Show loading or a recoverable storage failure until storage and preferences are ready.
- Mount `SafeAreaProvider`.
- Resolve the persisted System/Light/Dark preference against the platform color
  scheme, then mount the matching React Native Paper theme provider.
- Configure the Expo status bar and system background to match the resolved
  appearance.
- Render `Speedometer`.

The app keeps shared code in `src/` so Expo Router does not treat helpers,
hooks, API clients, or database modules as route files.

## Main Screen

`src/components/speedometer.tsx` is the main application surface.

It owns:

- First-install onboarding visibility.
- Unit selection.
- Mount position.
- Auto-start.
- Auto-save.
- Orientation mode.
- Current trip active/paused state.
- Current trip start time and elapsed time.
- Confirmed recording state from the shared controller.
- Trip history visibility.
- Settings modal visibility.
- Drawer menu visibility.
- Debug overlay visibility.
- Development drive simulator toggle.
- Toast/snackbar messages.

This component is intentionally stateful because it coordinates UI controls,
sensor hook state, trip persistence, telemetry, and app lifecycle events.

## Live Speed Hook

`src/hooks/useVelocitySensors.ts` exposes:

```ts
{
  state: VelocitySensorsState;
  reset: () => void;
}
```

`VelocitySensorsState` includes:

- `speedMps`
- `averageSpeedMps`
- `maxSpeedMps`
- `distanceMeters`
- `headingDegrees`
- `headingSource`
- `headingAccuracyDegrees`
- `headingQuality`
- `headingReasons`
- `permission`
- `status`
- `quality`
- `source`
- `errorMessage`
- `units`
- `stale`
- `timestampMs`
- `qualityScore`
- `qualityReasons`
- `gpsAccuracyMeters`
- `fixAgeMs`
- `nativeSpeedUsed`
- `motionAvailable`
- `gpsAvailable`
- `headingAvailable`
- `isMoving`
- `isStopped`

The hook abstracts three possible data sources:

1. Development drive simulator.
2. Native `V3l0citySpeedEngine`.
3. JS fallback sensors.

The UI does not need to know which source is active.

Compass semantics:

- While moving, the dashboard compass represents vehicle direction from GPS
  course when a valid course is available.
- While stopped or moving slowly, the compass falls back to the device compass.
- Mount position affects device compass fallback only. It does not rotate GPS
  course.
- `--` is shown when neither GPS course nor device heading is reliable.
- `precise_location_required` is distinct from `permission_denied`; the user
  has granted some location access, but it is not precise enough for the native
  speed/compass path.

## Dashboard Components

Important components:

- `SpeedDial.tsx`: large speed gauge and current speed display.
- `AverageSpeedDisplay.tsx`: average speed stat block.
- `HorizontalCompass.tsx`: horizontal heading strip.
- `MiniCompass.tsx`: compact circular compass.
- `OnboardingScreen.tsx`: one-time local install choice between sign-up,
  sign-in, and offline use.
- `PrivacyPolicyScreen.tsx`: in-app permissions and data policy.
- `TripHistory.tsx`: saved trip list and clear-all action.
- `DebugOverlay.tsx`: development-only sensor diagnostics overlay.
- `CustomStatusBar.tsx`: status bar helper.
- `ResetButton.tsx`: legacy/small reset button component.

The main screen renders portrait and landscape dashboards separately. Portrait
uses a vertical scroll surface. Landscape places the speed dial beside a denser
stats and compass panel.

## Trip Controls

### Manual Start

`startTrip()`:

1. Waits for preferences, history and recording recovery to hydrate.
2. Uses the shared recording controller's immediate operation guard.
3. Creates a UUID and commits a draft before marking it active.
4. Anchors native-counter deltas without assuming an asynchronous reset completed.
5. Dispatches optional telemetry/native presentation after the local commit.

### Manual Save

`stopAndSaveTrip()`:

1. Serializes behind pending sample writes.
2. Finalizes the confirmed aggregate and one outbox operation transactionally.
3. Clears active state, or reveals the next recovered draft.
4. Refreshes History and dispatches optional telemetry/notification/widget work.

Local save is the source of truth. Telemetry completion is deliberately
fire-and-forget.

### Reset

`handleReset()` resets the live speed hook and elapsed timer when no trip is
active. It does not delete saved trip history.

## Trip Sample Capture

`src/recording/controller.ts` captures trip samples while:

- The confirmed session is recording and storage has no pending failure.
- The app is foregrounded and a fresh, valid ordered sensor event is available.

The minimum interval between accepted sensor timestamps is 500 ms.

Each captured `TripSpeedSample` stores:

- trip id
- sequence
- recorded timestamp
- elapsed milliseconds
- speed
- distance
- heading
- heading source
- heading accuracy
- heading quality
- heading reasons
- source
- quality
- quality score
- quality reasons
- GPS accuracy
- fix age
- native speed usage
- moving/stopped flags
- stale flag

Each sample and its aggregate checkpoint commit to SQLite before optional
telemetry receives it. A failed append keeps its original sequence/time for
retry. No in-memory sample array replaces durable rows at finalization.

## Settings

Settings are shown in a bottom sheet modal from `speedometer.tsx`.

### Units

Values:

- `km/h`
- `MPH`

Display conversion is handled by `src/utils/speedMath.ts`.

### Appearance

Values:

- `system` (default)
- `light`
- `dark`

`system` follows the iOS or Android color scheme. Reading that value requires
no runtime permission. The preference is stored locally in SQLite and applies
whether the user is offline, signed out, or signed in; it is not sent through
cloud profile or trip sync.

### Mount Position

Values:

- top, offset `0`
- right, offset `90`
- bottom, offset `180`
- left, offset `-90`

The selected offset is passed to `useVelocitySensors` as
`mountOffsetDegrees`. The native engine applies it to heading display.

### Autostart Trip

When enabled:

- Sustained `state.isMoving` starts a trip.
- Sustained `state.isStopped` pauses a trip.
- Movement resumes only an automatically paused trip. Recovered/manual pauses
  require an explicit Resume.

The moving/stopped flags come from the speed hook and ultimately from native
or JS speed state.

### Trip Recovery And Background Surfaces

`usePersonalRecording` connects the shared controller to AppState and the HUD.
Backgrounding checkpoints and marks a sampling gap while native tracking/glance
surfaces continue. Foreground sampling accepts fresh events. `recoverRecordings`
restores all unfinished drafts paused; the user explicitly resumes or saves.
Widget snapshots do not provide a durable native sample journal. OS suspension
or termination may leave gaps after the confirmed checkpoint. Physical-device
evidence is required before claiming native background/process-death continuity.

See [Local data and export](./local-data-and-export.md) for transaction, migration
and storage-error behavior.

### Orientation

Values:

- `portrait`
- `landscape`
- `auto`

`applyOrientation()` uses `expo-screen-orientation` to lock or unlock the
platform orientation. In auto mode, an orientation listener updates layout state.

### Debug Overlay

Development-only. It shows status, permission, quality, source, speed, average,
max, distance, heading, heading diagnostics, quality score, and quality
reasons.

### Drive Simulator

Development-only. It bypasses native sensors and feeds deterministic drive
state through the same hook output shape. During active simulated trips, the
drive-surface snapshot is marked with `simulationActive` so native iOS and
Android code can keep widgets, Live Activity, and the Android active-trip
notification moving after the React screen is backgrounded.

## Preferences

Preferences are read on first render from:

```text
src/database/preferencesRepository.ts
```

They are saved whenever the relevant state changes:

- units
- mount index
- auto start
- auto save
- orientation mode
- appearance mode

The preferences repository writes to the single-row `preferences` SQLite table.

## History and Export

The drawer menu opens:

- History.
- Insights.
- Leaderboards.
- Find Friends.
- Account / Sync.
- Privacy.
- Settings.
- Export as JSON.
- Export as CSV.

`TripHistory` receives trips from `getTrips()`. It shows trip date, duration,
distance, average speed, max speed, and start/end time.

Export handlers call:

- `exportAsJson()`
- `exportAsCsv()`

Both functions read local SQLite data and then open the platform share sheet.

## Account, Sync, and Social Screens

Cloud/social screens are internal dashboard screens, not Expo Router routes.
They are opened from the drawer and render inside `speedometer.tsx`.

Primary components:

- `AccountSyncScreen`
- `FindFriendsScreen`
- `LeaderboardsScreen`

They consume the provider-neutral cloud API from `src/cloud`. Local is the
default. Legacy cloud access requires explicit provider configuration and a
session; otherwise these screens show offline/auth states. The dashboard,
history, insights and exports use local SQLite.

`AccountSyncScreen` handles separate auth screens, first-time signed-up
onboarding, account preference edits, coarse nearby permission, sync now,
restore, and sign-out. Sign-up collects name, username, email, and password
before email confirmation. Signed-in onboarding is driven by
`profiles.onboarding_completed_at`; after that value exists, the screen becomes
normal profile/sync settings.

First-install onboarding is separate. `src/onboarding/onboardingStorage.ts`
stores a local AsyncStorage flag, so anonymous/offline users see onboarding
once per install without creating an account. Resetting app data or
reinstalling the app resets this local onboarding state.

`FindFriendsScreen` handles username search, coarse nearby discovery, and
suggestions. `LeaderboardsScreen` shows aggregate-only ranking data.
`PrivacyPolicyScreen` is reachable from onboarding, Account / Sync, and the
drawer.

## Notifications

`src/components/AppToast.tsx` owns themed in-app toast styling. It wraps React
Native Paper `Snackbar` with the cockpit surface colors, variant accents, and
icons used by the rest of the dashboard.

`src/utils/notifications.ts` lazily imports `expo-notifications`. This avoids
crashing Android Expo Go, where remote notification support changed in recent
SDKs. Notifications are optional:

- If permission is denied, trip saving still succeeds.
- If the module is unavailable, the app silently skips notification scheduling.
- Android uses the `v3l0city_trips` notification channel.
- Settings can request push permission and acquire native APNs/FCM plus Expo
  push tokens when the build has notification credentials and an EAS project ID.

Push tokens are stored with the anonymous install identity. When telemetry is
enabled, device registration includes the latest stored push tokens so a backend
can associate pushes with the install.

## Error and Status UI

The dashboard has special states for:

- `permission_denied`: show location permission message.
- `sensor_unavailable`: show unavailable sensor message.
- any `errorMessage`: show the error.

Footer status maps state into user-readable labels:

- Permission required.
- Sensors unavailable.
- Recording.
- Ready.
- Initializing.

Signal footer displays quality and source.

## Development Notes

- Keep user-facing controls in `speedometer.tsx` unless the UI becomes too large
  to reason about.
- Keep speed-source details inside `useVelocitySensors`.
- Keep visual-only logic inside child components.
- Avoid making telemetry part of render-critical UI state. It is a sidecar.
- Avoid making cloud sync part of render-critical UI state. It is optional and
  local data wins.
- Do not add files under `app/` unless they are actual Expo Router routes.
