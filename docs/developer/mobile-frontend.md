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
- Render nothing until storage is ready.
- Mount `SafeAreaProvider`.
- Mount the React Native Paper theme provider.
- Configure the Expo status bar.
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
- Current in-memory trip samples.
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

1. Exits early if a trip is already active.
2. Creates a trip id from `Date.now()`.
3. Calls `reset()` on the speed hook.
4. Clears in-memory sample refs.
5. Initializes sequence numbering at 1.
6. Marks the trip active and not paused.
7. Starts telemetry if configured.

### Manual Save

`stopAndSaveTrip()`:

1. Builds a `Trip` aggregate from current state.
2. Uses `saveTrip(trip, samples)` to persist aggregate and samples.
3. Calls `tripTelemetryService.completeTrip(trip)` as an optional side effect.
4. Reloads saved trips from SQLite.
5. Clears active trip refs.
6. Schedules an optional local notification.

Local save is the source of truth. Telemetry completion is deliberately
fire-and-forget.

### Reset

`handleReset()` resets the live speed hook and elapsed timer when no trip is
active. It does not delete saved trip history.

## Trip Sample Capture

The speedometer captures trip samples while:

- `isTripActive` is true.
- `isTripPaused` is false.
- `currentTripStart` exists.

Capture interval:

```ts
const TRIP_SPEED_SAMPLE_INTERVAL_MS = 500;
```

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

The sample is pushed into `currentTripSamples.current` and handed to
`tripTelemetryService.recordSample(sample)`.

Important: samples are persisted to SQLite when the trip is saved. During the
trip they are held in memory and streamed to telemetry if configured.

## Settings

Settings are shown in a bottom sheet modal from `speedometer.tsx`.

### Units

Values:

- `km/h`
- `MPH`

Display conversion is handled by `src/utils/speedMath.ts`.

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
- Movement resumes a paused trip.

The moving/stopped flags come from the speed hook and ultimately from native
or JS speed state.

### Autosave on Exit

When enabled, an AppState transition from active to background/inactive saves
the trip. This is not background tracking. It is a preservation behavior for
foreground-only recording.

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
state through the same hook output shape.

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

They consume the provider-neutral cloud API from `src/cloud`. If Supabase env
vars are missing or the user is signed out, these screens show offline/auth
states. The dashboard, history, insights, and export flows continue to use local
SQLite only.

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
