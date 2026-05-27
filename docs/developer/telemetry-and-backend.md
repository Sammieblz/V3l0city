# Telemetry and Backend

Telemetry is optional. It lets V3l0city stream active trip samples to a backend
for diagnostics and analysis, but the backend is never part of local speed
calculation.

For exact request and response schemas, see
[../telemetry-api.md](../telemetry-api.md).

## Telemetry Design Rules

- Local speed calculation does not depend on the network.
- Local trip save does not depend on the network.
- Samples are captured locally first.
- WebSocket is the live path.
- HTTP batch upload is the durability and retry path.
- Duplicate batches and duplicate sample sequences must be safe.
- Identity is anonymous device identity, not user accounts.

## Mobile Telemetry Files

```text
src/api/config.ts
src/api/deviceIdentity.ts
src/api/httpClient.ts
src/api/telemetryClient.ts
src/api/telemetrySocket.ts
src/api/tripTelemetryService.ts
```

## Mobile Configuration

Telemetry is enabled only when both URLs are valid:

```bash
EXPO_PUBLIC_V3L0CITY_API_URL=http://<host>:8787
EXPO_PUBLIC_V3L0CITY_WS_URL=ws://<host>:8787
```

`src/api/config.ts` validates:

- HTTP base URL protocol: `http:` or `https:`
- WebSocket base URL protocol: `ws:` or `wss:`
- placeholder values containing `<` or `>` are rejected

If either value is invalid or missing, telemetry is disabled.

## Anonymous Device Identity

Primary file:

```text
src/api/deviceIdentity.ts
```

Local keys:

- `v3l0city.telemetry.installId`
- `v3l0city.telemetry.deviceId`
- `v3l0city.telemetry.deviceToken`
- `v3l0city.notifications.expoPushToken`
- `v3l0city.notifications.nativePushToken`

Flow:

1. Load `installId` from AsyncStorage.
2. If missing, create 16 random bytes with `expo-crypto`.
3. Return platform, app version, build number, and any stored push tokens.
4. After server registration, persist `deviceId`, `deviceToken`, and the push
   tokens that were synced.

This identity is anonymous. It is stable per install unless app data is cleared.
Push tokens are optional and only appear after the user enables notifications.

## HTTP Client

Primary file:

```text
src/api/httpClient.ts
```

Features:

- JSON request and response handling.
- Bearer token header support.
- Default 8 second timeout.
- Recoverability tagging through `ApiError`.
- Linear retry delay through `requestWithRetry`.

Recoverable HTTP failures:

- `5xx`
- `408`
- `429`
- network/timeout failures with status `0`

Nonrecoverable API failures, such as validation errors, are not retried.

## Telemetry Client

Primary file:

```text
src/api/telemetryClient.ts
```

Methods:

- `registerDevice(input)`
- `startTrip(token, trip)`
- `uploadSampleBatch(token, tripId, batchId, samples)`
- `completeTrip(token, trip, finalSequence)`

`toWireSample()` maps local `TripSpeedSample` into the server wire shape.

## WebSocket Client

Primary file:

```text
src/api/telemetrySocket.ts
```

Responsibilities:

- Open WebSocket connection.
- Send `hello` with protocol version and last known sequence.
- Send `sample_batch` messages.
- Send `trip_complete`.
- Parse `ack` and `error` server messages.
- Surface connection close and error events to the service.

Connection timeout:

- 5 seconds.

## Trip Telemetry Service

Primary file:

```text
src/api/tripTelemetryService.ts
```

This is the orchestration layer used by `speedometer.tsx`.

### Start Trip

`startTrip(trip)`:

1. Reads telemetry config.
2. Exits immediately if disabled.
3. Creates `TelemetryClient`.
4. Ensures registered device identity.
5. Calls `POST /v1/trips`.
6. Builds the live WebSocket URL.
7. Opens `TelemetrySocket`.

### Record Sample

`recordSample(sample)`:

1. Confirms there is an active telemetry trip.
2. Confirms sample trip id matches active trip id.
3. Pushes sample into `pendingSamples`.
4. Flushes a live WebSocket batch when at least five samples are pending and
   the socket is open.

Live batch size:

```ts
const LIVE_BATCH_SIZE = 5;
```

At 2 Hz sampling, this sends about one live batch every 2.5 seconds.

### Acknowledgements

On server `ack`:

1. Update `lastAckedSequence`.
2. Remove acknowledged samples from memory.
3. Mark samples uploaded in local SQLite for non-hello acknowledgements.

### Completion

`completeTrip(trip)`:

1. Marks any already acknowledged samples as uploaded.
2. Reads pending local samples from SQLite.
3. Uploads pending samples over HTTP in batches of 60.
4. Sends `trip_complete` over WebSocket if open.
5. Calls HTTP complete endpoint.
6. Closes socket and clears active telemetry state.

HTTP batch size:

```text
60 samples
```

At 2 Hz, each HTTP batch represents about 30 seconds of recorded samples.

### Failure Behavior

- Start failure: log warning and continue local trip.
- WebSocket close: retry up to 3 times when the URL is available.
- WebSocket send failure: schedule reconnect.
- Completion failure: mark pending local samples with upload error where
  possible and log warning.
- All telemetry errors are non-blocking for local app behavior.

## Backend Files

```text
server/src/app.ts
server/src/contracts.ts
server/src/store.ts
server/src/index.ts
server/src/app.test.ts
```

## Backend Runtime

Run:

```bash
npm run server:dev
```

Defaults:

- `PORT=8787`
- `HOST=0.0.0.0`
- `V3L0CITY_SERVER_DB=server/data/v3l0city.sqlite`

Optional:

- `V3L0CITY_PUBLIC_WS_URL`

Server data under `server/data/` should remain gitignored.

## Fastify App

Primary file:

```text
server/src/app.ts
```

Responsibilities:

- Build Fastify instance.
- Register WebSocket plugin.
- Register HTTP routes.
- Register WebSocket route.
- Parse bearer tokens.
- Authenticate protected HTTP endpoints.
- Convert Zod validation errors into API error payloads.
- Close the SQLite store when Fastify closes.

HTTP routes:

- `POST /v1/devices/register`
- `POST /v1/trips`
- `POST /v1/trips/:tripId/samples/batch`
- `POST /v1/trips/:tripId/complete`
- `GET /v1/trips/:tripId`

WebSocket route:

- `GET /v1/trips/:tripId/live?sessionToken=<token>`

## Contracts

Primary file:

```text
server/src/contracts.ts
```

Defines Zod schemas for:

- device registration
- trip start
- telemetry sample
- sample batch
- trip completion
- WebSocket messages

The sample schema validates:

- sequence is positive integer
- timestamps are ISO datetime strings
- speed values are nonnegative and capped
- quality/source enums are known
- heading source is `none`, `course`, or `device`
- heading quality is `good`, `medium`, or `poor`
- heading reason labels are bounded
- quality score is 0 to 1
- quality reasons are bounded

## Store

Primary file:

```text
server/src/store.ts
```

Responsibilities:

- Create SQLite directory when needed.
- Open `better-sqlite3`.
- Enable foreign keys.
- Create tables.
- Register devices.
- Hash tokens with SHA-256.
- Authenticate device tokens.
- Create trips and live sessions.
- Validate trip access.
- Validate live session tokens.
- Insert sample batches.
- Complete trips.
- Return trip summaries.

## Server Tables

### `devices`

Stores anonymous install identity, optional push tokens, and token hash.

Important columns:

- `id`
- `install_id`
- `token_hash`
- `platform`
- `app_version`
- `build_number`
- `expo_push_token`
- `native_push_token`
- `push_platform`
- `created_at`
- `updated_at`

Registering the same install id rotates the token and updates metadata plus
push tokens.

### `trips`

Stores server-side trip metadata and final aggregates.

Important columns:

- `id`
- `device_id`
- `client_trip_id`
- `started_at`
- `ended_at`
- `units`
- `mount_label`
- `total_distance_meters`
- `max_speed_mps`
- `average_speed_mps`
- `final_sequence`

The current backend uses the client trip id as the server trip id.

### `trip_samples`

Stores sample timeline rows.

Compass diagnostic columns:

- `heading_source`
- `heading_accuracy_degrees`
- `heading_quality`
- `heading_reasons`

Important rule:

```sql
UNIQUE(trip_id, sequence)
```

Duplicate sequences are ignored during insertion.

### `upload_batches`

Stores idempotency records for both WebSocket and HTTP batch ids.

Primary key:

```sql
(trip_id, batch_id)
```

Duplicate batch ids return the existing last sequence behavior and insert no
new samples.

### `live_sessions`

Stores hashed WebSocket session tokens.

Tokens expire after 12 hours.

## WebSocket Flow

Connection:

1. Client uses `sessionToken` from `POST /v1/trips`.
2. Server validates session token hash and expiry.
3. Invalid sessions receive an error and close.

Messages:

- `hello`: server replies with `ack` and `lastKnownSequence`.
- `sample_batch`: server validates and inserts samples, then replies `ack`.
- `trip_complete`: server completes the trip and replies `ack`.
- `ping`: server replies `pong`.

Invalid messages produce recoverable `error` messages.

## Security Model

Current v1 model:

- Anonymous device identity.
- Server-issued bearer token.
- SHA-256 token hashes in SQLite.
- Per-device trip access for HTTP endpoints.
- Short-lived live session token for WebSocket.

Not implemented:

- user accounts
- OAuth
- multi-device identity linking
- server-side encryption at rest beyond SQLite file storage
- production auth hardening

Production deployments should run behind HTTPS/WSS and normal infrastructure
security controls.

## Testing

Mobile telemetry tests:

```bash
npx jest --runInBand __tests__/telemetryApi.test.ts
```

Server tests:

```bash
npm run server:test
```

The server tests cover:

- device registration
- trip creation
- live session token validation
- HTTP batch validation
- duplicate batch/sample handling
- trip completion
- WebSocket sample ack flow
