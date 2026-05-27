# Code Ownership Map

Use this map to decide where a change belongs and what tests should accompany
it. This is not ownership by person. It is ownership by subsystem.

## Quick Map

| Change area | Primary files | Validation |
| --- | --- | --- |
| App boot | `app/index.tsx` | `npx tsc --noEmit`, Jest smoke tests |
| Dashboard UI | `src/components/speedometer.tsx`, child components | Jest UI tests, simulator visual check |
| Speed hook state | `src/hooks/useVelocitySensors.ts` | `__tests__/useVelocitySensors.native.test.tsx` |
| JS speed fallback | `src/hooks/useKalmanSpeedFilter.ts`, `src/utils/*Math.ts`, `src/utils/sensorGuards.ts` | math/hook Jest tests |
| Native speed algorithm | `modules/v3l0city-speed-engine/common/cpp/*` | C++ tests, native builds |
| iOS sensor collection | `modules/v3l0city-speed-engine/ios/*` | iOS build, iOS simulator route |
| Android sensor collection | `modules/v3l0city-speed-engine/android/*` | Android build, Android route/diagnosis |
| Preferences | `src/database/preferencesRepository.ts`, `speedometer.tsx` | TypeScript, manual settings check |
| Trip persistence | `src/database/database.ts`, `src/database/tripRepository.ts` | Jest, export tests |
| Export | `src/database/exportService.ts`, `src/database/exportFormat.ts` | export tests |
| Mobile telemetry | `src/api/*` | telemetry Jest tests |
| Server API | `server/src/app.ts`, `server/src/contracts.ts`, `server/src/store.ts` | `npm run server:test` |
| Docs | `README.md`, `docs/**` | link/typo scan |

## By Feature

### Add or Change a Speed Rule

Start in:

```text
modules/v3l0city-speed-engine/common/cpp/SpeedEngine.h
modules/v3l0city-speed-engine/common/cpp/SpeedEngine.cpp
```

Then update:

- `modules/v3l0city-speed-engine/common/cpp/tests/SpeedEngineTests.cpp`
- `docs/speed-engine.md`
- `docs/developer/native-speed-engine.md` if behavior changes materially

Validation:

```bash
npm run test:speed-engine:cpp
npx tsc --noEmit
npx expo run:ios --no-bundler
cd android && sh ./gradlew :app:assembleDebug
```

### Add a New Native Diagnostic Field

Update all layers:

1. C++ `SpeedState`.
2. iOS `SpeedEngineWrapper.mm` dictionary conversion.
3. Android JNI map conversion.
4. `modules/v3l0city-speed-engine/index.d.ts`.
5. `src/hooks/useVelocitySensors.ts`.
6. `src/domain/trip.ts` if persisted.
7. `src/database/database.ts` migration if persisted.
8. `src/database/tripRepository.ts` row mapping if persisted.
9. `src/api/telemetryClient.ts` and server contracts if telemetered.
10. Tests and docs.

This type of change crosses the whole stack. Treat it carefully.

### Change Trip Recording Behavior

Start in:

```text
src/components/speedometer.tsx
```

Likely related files:

- `src/domain/trip.ts`
- `src/database/tripRepository.ts`
- `src/api/tripTelemetryService.ts`
- `docs/developer/mobile-frontend.md`
- `docs/user-guide.md`

Check:

- manual Start Trip and Stop & Save
- auto-start
- pause/resume
- auto-save on background
- history display
- export
- telemetry completion

### Change Local Storage Schema

Start in:

```text
src/database/database.ts
```

Then update:

- repositories
- domain types
- export format
- tests
- docs

Rules:

- Add migrations for existing installs.
- Preserve old data when possible.
- Do not throw on best-effort legacy migration failures.
- Keep export data portable.

### Change Telemetry Payload Shape

Update both client and server:

```text
src/api/telemetryClient.ts
src/api/telemetrySocket.ts
src/api/tripTelemetryService.ts
server/src/contracts.ts
server/src/store.ts
server/src/app.ts
```

Also update:

- local storage if the field is persisted
- `docs/telemetry-api.md`
- `docs/developer/telemetry-and-backend.md`
- mobile telemetry tests
- server tests

Rules:

- Keep HTTP batch idempotent.
- Keep duplicate sample sequence handling safe.
- Keep network failure non-blocking.

### Change Backend Auth or Identity

Start in:

```text
server/src/store.ts
server/src/app.ts
src/api/deviceIdentity.ts
```

Be careful with:

- stored device token hashes
- token rotation
- existing local registered identity
- WebSocket live session validation

Add tests for both valid and invalid auth.

### Change Settings

Start in:

```text
src/components/speedometer.tsx
src/database/preferencesRepository.ts
src/database/database.ts
```

If persisted, update:

- `Preferences` type
- SQLite table default
- migration
- settings UI
- user guide

### Change Export

Start in:

```text
src/database/exportFormat.ts
```

Then update:

- `src/database/exportService.ts` if side effects change
- `__tests__/exportService.test.ts`
- user guide if behavior changes

Keep format generation mostly pure.

## Review Checklists

### Speed Engine PR Checklist

- C++ tests cover the new behavior.
- Native wrappers expose any changed state correctly.
- JS hook state shape remains compatible with UI.
- Stale speed still decays to zero.
- Outliers are rejected or explained.
- No network dependency was introduced.

### Mobile UI PR Checklist

- Works in portrait and landscape.
- Text does not overflow on simulator sizes.
- Permission denied state is understandable.
- Settings persist after reload.
- Trip save and history still work.
- Debug-only controls remain gated by `__DEV__`.

### Storage PR Checklist

- Existing installs migrate cleanly.
- New fields have defaults.
- Clear/delete removes dependent rows.
- Export includes useful new fields.
- Tests cover changed formatting or repository behavior.

### Telemetry PR Checklist

- Missing env vars disable telemetry cleanly.
- WebSocket disconnect does not stop local recording.
- HTTP retries are idempotent.
- Duplicate batches do not duplicate samples.
- Auth failures are explicit.
- Server tests cover schema and storage behavior.

### Docs PR Checklist

- README links remain valid.
- Developer docs and user guide agree on behavior.
- Commands are current.
- iOS/Android differences are explicit.
- Warnings do not overpromise GPS accuracy.

