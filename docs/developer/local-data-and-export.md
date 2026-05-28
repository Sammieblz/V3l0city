# Local Data and Export

V3l0city stores user preferences, saved trips, and detailed trip speed samples
locally with Expo SQLite. Local data is the durable source of truth for the
mobile app.

Cloud sync metadata is local too. Cloud state is optional and must not become
the source of truth for the current device.

## Database Initialization

Primary file:

```text
src/database/database.ts
```

Database name:

```text
velocity.db
```

Startup flow:

1. `app/index.tsx` calls `initDatabase()`.
2. `getDatabase()` opens `velocity.db` with `SQLite.openDatabaseSync`.
3. `createTables()` creates all current tables if missing.
4. `runMigrations()` adds newer columns if an older database already exists.
5. `migrateFromAsyncStorage()` attempts a one-time migration from legacy keys.

The app waits for this process before rendering `Speedometer`.

## Tables

### `schema_migrations`

Tracks applied migration markers.

Columns:

- `id`
- `applied_at`

Current explicit marker:

```text
2026-05-19-trip-speed-sample-telemetry
2026-05-26-trip-heading-diagnostics
2026-05-27-offline-cloud-sync
```

### `preferences`

Single-row table keyed by `id = 1`.

Columns:

- `units`
- `mount_index`
- `auto_start`
- `auto_save`
- `orientation_mode`

Repository:

```text
src/database/preferencesRepository.ts
```

Type:

```ts
type Preferences = {
  units: Units;
  mountIndex: number;
  autoStart: boolean;
  autoSave: boolean;
  orientationMode: 'portrait' | 'landscape' | 'auto';
};
```

### `trips`

One row per saved trip.

Columns:

- `id`
- `started_at`
- `ended_at`
- `total_distance_meters`
- `max_speed_mps`
- `average_speed_mps`
- `units`
- `mount_label`
- `record_status`
- `local_updated_at`
- `deleted_at`
- `cloud_synced_at`
- `cloud_sync_error`
- `sync_status`

Domain type:

```text
src/domain/trip.ts
```

Repository:

```text
src/database/tripRepository.ts
```

### `trip_speed_samples`

Detailed per-trip timeline captured while recording.

Columns:

- `id`
- `trip_id`
- `sequence`
- `recorded_at`
- `elapsed_ms`
- `speed_mps`
- `distance_meters`
- `heading_degrees`
- `heading_source`
- `heading_accuracy_degrees`
- `heading_quality`
- `heading_reasons`
- `source`
- `quality`
- `quality_score`
- `quality_reasons`
- `gps_accuracy_meters`
- `fix_age_ms`
- `native_speed_used`
- `is_moving`
- `is_stopped`
- `stale`
- `uploaded_at`
- `upload_error`

Indexes:

- `(trip_id, elapsed_ms)`
- `(uploaded_at, trip_id, sequence)`
- unique `(trip_id, sequence)`

The table has a foreign key to `trips(id)` with cascade delete. Clearing trips
also clears their samples.

### `sync_outbox`

Durable queue for optional cloud operations.

Columns:

- `id`
- `operation_type`
- `entity_type`
- `entity_id`
- `payload_json`
- `status`
- `attempt_count`
- `last_error`
- `created_at`
- `updated_at`

## Repository Functions

`src/database/tripRepository.ts` exposes:

- `getTrips()`
- `getTripById(id)`
- `getTripSpeedSamples(tripId)`
- `createDraftTrip(trip)`
- `appendTripSpeedSample(sample)`
- `recoverActiveTrip()`
- `saveTrip(trip, samples)`
- `updateTrip(trip)`
- `deleteTrip(id)`
- `softDeleteTrip(id)`
- `clearTrips()`
- `getUnsyncedTrips()`
- `enqueueSyncOperation(...)`
- `markSyncOperationDone(id)`
- `getPendingTripSpeedSamples(tripId)`
- `markTripSpeedSamplesUploaded(tripId, throughSequence, uploadedAt)`
- `markTripSpeedSamplesUploadError(tripId, fromSequence, message)`

Important behavior:

- `saveTrip()` writes the trip aggregate first.
- If samples are provided, it deletes existing samples for that trip id and
  inserts the provided sample list.
- `createDraftTrip()` is called before the dashboard marks a trip active.
- `appendTripSpeedSample()` writes each active sample immediately.
- `recoverActiveTrip()` returns the newest unfinished draft trip after crash or
  restart.
- Pending samples are samples with `uploaded_at IS NULL`.
- Upload error state does not block local trip history.

## Trip Sample Lifecycle

Active trip sample flow:

```text
VelocitySensorsState
  -> speedometer.tsx 500 ms sampling effect
  -> append sample to SQLite
  -> in-memory currentTripSamples ref for final aggregate save
  -> tripTelemetryService.recordSample
  -> saveTrip(trip, samples)
  -> trip_speed_samples
```

Sampling rules:

- Samples are captured only during an active trip.
- Samples are skipped while paused.
- The interval is 500 ms.
- Sequence starts at 1 for each trip.
- Timestamp is never earlier than trip start.

The app stores samples durably during the active trip. The in-memory sample list
is a mirror, not the only copy.

## Legacy AsyncStorage Migration

Older versions used AsyncStorage keys:

- `velocity.preferences`
- `velocity.trips`

`migrateFromAsyncStorage()` attempts to read these keys and insert valid data
into SQLite. If migration succeeds, the legacy keys are removed.

Failures are ignored. This is intentional because a bad legacy payload should
not prevent the app from opening.

## Non-Secret AsyncStorage State

New durable trip data belongs in SQLite. AsyncStorage is reserved for small,
non-secret install-level flags and legacy migration support.

Current app-owned keys include:

- `v3l0city:onboarding:local:v1`: first-install onboarding completion.

Supabase sessions are not stored here; they use Expo SecureStore through the
cloud auth adapter.

## Export Architecture

Primary files:

```text
src/database/exportService.ts
src/database/exportFormat.ts
```

`exportService.ts` handles platform side effects:

- Read trips.
- Read samples.
- Read preferences for JSON export.
- Create a file with `expo-file-system`.
- Open the share sheet with `expo-sharing`.

`exportFormat.ts` handles pure formatting:

- Build JSON payload.
- Build CSV rows.
- Escape CSV values.

Keeping formatting pure makes export tests easy and avoids filesystem work in
unit tests.

## JSON Export

JSON export includes:

- export metadata
- preferences
- trips
- each trip's `speedSamples`

Use JSON when preserving the full diagnostic shape matters.

## CSV Export

CSV export includes:

- trip summary rows
- per-sample rows

Use CSV when users need spreadsheet analysis.

## Local-First Rules

Any feature touching storage should follow these rules:

- Local trip save must succeed without telemetry.
- Telemetry upload errors must not delete local samples.
- Cloud sync errors must not delete local samples.
- Export should read from SQLite only, not from server state.
- Deleting a trip should create a local tombstone before eventual cloud purge.
- Schema changes need migrations for existing installs.
- New persisted fields should be included in export if they help debugging or
  user data portability.

## Testing

Relevant tests:

```text
__tests__/exportService.test.ts
__tests__/TripHistory.test.tsx
```

Run:

```bash
npx jest --runInBand __tests__/exportService.test.ts __tests__/TripHistory.test.tsx
```

Run the full JS suite after schema or export changes:

```bash
npx jest --runInBand
```
