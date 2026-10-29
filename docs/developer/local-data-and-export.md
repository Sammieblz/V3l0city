# Local data and export

Expo SQLite (`velocity.db`) owns personal recordings and preferences. Recording,
history and export require no account or V3l0city backend. Connected replicas are
separate display data; they cannot authorize an action.

## Startup and migrations

`app/index.tsx` opens storage before mounting the dashboard. Loading has readable
status text. Initialization or preference-read failures show retry, not empty
history or default settings. Future schemas ask the user to update. There is no
automatic reset or database deletion.

For storage-full failures, free device storage and retry. For unsupported schema
versions, install a compatible newer app. For corruption or ambiguous migration
history, retain the original database and legacy sources for recovery; do not
edit version markers to force an upgrade. Repair must use a separately preserved
copy and verified import/migration, not an automatic destructive reset.

`sqliteMigrations.ts` owns ordered migrations, `PRAGMA user_version` and
`local_schema_migrations`. Version 1 normalizes historical personal tables and
adds columns before indexes; version 2 adds lifecycle checkpoints/gaps; version 3
adds explicit ownership, legacy import receipts and scoped connected storage.

All pending upgrades run in one transaction. Historical `schema_migrations`
markers remain. Failed candidate connections are closed and never published as
initialized. Unsupported versions, conflicting history, failed migrations and
foreign-key violations preserve the file and report failure.

Trip/sample IDs, positive unique sequences, upload acknowledgements, tombstones
and cloud metadata survive. Only wholly unuploaded, zero-sequence legacy groups
can be numbered by their existing elapsed-time/row-ID order. Ambiguous collisions
stop migration; rows are never silently deleted or renumbered.

## Personal recording lifecycle

| Table | Purpose |
| --- | --- |
| `preferences` | Device units, mount, auto-start, orientation and appearance |
| `trips` | Draft/completed summaries and legacy sync metadata |
| `trip_speed_samples` | Readings, unique by trip and sequence |
| `recording_states` | Confirmed phase, checkpoint and last confirmed sample |
| `recording_gaps` | Explicit restart/background/pause/permission/sensor/sampling/storage gaps |
| `sync_outbox` | Existing optional cloud work |
| `recording_ownership` | Explicit provider/account association and adoption consent |

`recordingRepository.ts` implements transactional lifecycle operations, re-exported
by `tripRepository.ts`: `createDraftTrip`, `appendTripSpeedSample`,
`checkpointRecording`, `setRecordingPaused`, `openRecordingGap`,
`closeRecordingGap`, `recoverRecordings` and `saveTrip`.

Parent rows are never replaced to retry start/save: replacement would cascade
sample deletion. Samples and summaries checkpoint together. Completion and its
single legacy outbox operation commit together. Completion retry returns the
canonical persisted result. Recovery returns every unfinished recording paused,
preserves confirmed totals/units/mount, derives missing legacy summaries from
samples and records unknown intervals. The user chooses Resume or Save & end.
Clearing History targets completed records and preserves unfinished drafts.

The durable personal state machine is independent of shared-trip membership:

| Current state and event | Confirmed outcome |
| --- | --- |
| Ready, no unfinished draft; Start | Insert one draft in `recording` state |
| Recording; valid sample | Append sample and checkpoint summary together |
| Recording; Pause | Persist `paused` and open the appropriate continuity gap |
| Paused; explicit Resume | Close the gap and persist `recording`; establish a fresh counter anchor |
| Recording or paused; Save | Persist `completed`, close the gap and enqueue completion once |
| Restart | Recover every unfinished draft paused; preserve confirmed totals and mark uncertainty |
| Write failure | Keep the last committed phase/data, hold subsequent writes and retry the original operation |
| Completion replay | Return canonical saved state without another outbox operation |

An interrupted transaction rolls back. Runtime loading/busy/error flags are
controller state, not new durable recording phases. Joining/leaving a connected
trip never implicitly authorizes mutation of this state machine.

`src/recording/controller.ts` serializes phone, car and automatic actions. Local
commits precede telemetry, notifications and native presentation effects; these
effects cannot block completion. Failed samples retain their original sequence
and time for retry. Strict reads report failure instead of returning empty data.

Restored distance uses positive native-counter deltas from an explicit anchor;
it is never blindly added to a possibly surviving native total. Samples require
finite readings and valid ordered sensor times. Gaps never become invented rows.

## Background durability boundary

Existing native sensors, widgets and Live Activities remain. JS attempts a
checkpoint and sampling-gap marker on the AppState transition; OS suspension can
preempt it. Fresh readings resume
foreground sampling. Proven native aggregate movement can be retained, but a
widget snapshot is not a SQLite sample journal.
Native glance-session projection has its own counter anchor and confirmed peak;
it excludes cumulative values from an earlier session, preserves distance on
counter resets, and freezes aggregation while paused. Framework-free Swift/Kotlin
projection tests run in CI; the OS listener/lifecycle integration needs devices.

Neither platform currently has a native durable per-sample journal. Suspension
or termination can leave a gap after the last committed checkpoint. Do not claim
continuous kill-safe recording. Physical iOS/Android permission, lock-screen,
background and process-death checks remain gates in
[#36](https://github.com/Sammieblz/V3l0city/issues/36).

## Connected storage

`connectedCache.ts` scopes caches by provider **and** account. Persisted
generations reject responses issued before logout, account switching or
invalidation. Revision/tombstone barriers prevent stale snapshots reappearing.
Expiry bounds live and entitlement snapshots. Typed payloads contain display
data, never bearer credentials, location publishing grants or room tokens.

`connected_cache_scopes`, `connected_cache_entities`, `connected_cache_references`,
`connected_cache_barriers`, `connected_cache_sync_state` and `connected_outbox`
are separate from personal history. Cleanup preserves personal samples,
ownership and the legacy outbox. Map SDK resource storage is outside this DB.
Default internal retention bounds are 2,000 entities, 4,000 revision barriers,
500 connected mutations and 32 account scopes per database. These are storage
resource bounds, not product pricing or group-size policies. Expiry cleanup and
indexed pagination have representative query-plan fixtures.

The connected outbox is persistence infrastructure, not a dispatcher or permission
decision. Later synchronization, block and membership flows must call invalidation
seams and revalidate authority with the server. Cached entitlements never grant
access. This work does not enable cloud backup or adopt existing accounts/data.

## Legacy AsyncStorage import

`legacyLocalImport.ts` validates `velocity.preferences` and `velocity.trips` completely
and commits receipts with imported rows. Source keys are removed only after a
matching successful receipt. Failed cleanup can be retried without duplication.
Invalid or conflicting payloads remain available for recovery; parsing JSON alone
never permits deletion. New trip data belongs in SQLite. Credentials remain in
the secure-store boundary, never receipts or display caches.

SQLite is not encrypted by an application-level cipher in this implementation.
Its storage boundary is the OS application sandbox and platform device protection.
Sensitive credentials stay in SecureStore. Export files are ordinary user data
files, so this work does not claim encrypted backups. A different at-rest storage
policy requires an explicit migration and device qualification.

## Export and import

`exportService.ts` handles File/Sharing/DocumentPicker side effects;
`exportFormat.ts` handles formatting. `getLocalExportSnapshot()` reads completed,
undeleted summaries, samples and gaps in one transaction. JSON also reads
preferences. Any read failure stops file creation and sharing.
Each export gets a unique filename. Failed writes remove only their new partial
artifact and cannot overwrite a previous successful export.

JSON contains `preferences` and `trips`, including `speedSamples` and optional
`recordingGaps`. Older files without gaps remain supported. Invalid gap data is
rejected instead of silently erased. CSV retains summary/sample sections and
adds a separate gap section when needed.
Insights show points without connecting lines for interrupted recordings and
exclude known gap intervals from heatmap duration. Draft-file import is rejected;
finish and save a recording before exporting/importing it.

Import is merge-only. Existing IDs (including drafts and tombstones) retain all
local data; imports cannot reopen, overwrite or append to them. New trips,
samples, gaps and legacy sync operations import transactionally. Preferences are
restored separately afterward; their failure does not undo imported trips.
Retrying safely skips those existing IDs.

## Verification

Real SQLite fixtures cover historical/current upgrades, rollback, reopen,
storage-full failure, recording retries and cache isolation. React/controller
checks cover loading, recovery, serial actions and failed reads/exports. Run
`npm run test:ci`, `npm run typecheck` and `npm run docs:check`. These checks do
not replace physical-device qualification.
