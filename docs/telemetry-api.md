# V3l0city Telemetry API

V3l0city telemetry is a sidecar to the local speedometer. The native speed engine, local trip recording, trip history, and export path do not depend on the network. When telemetry is configured, the app streams active trip samples over WebSocket and uses HTTP batch upload for retries and trip completion.

## Local Setup

Install dependencies from the repo root:

```bash
npm install
```

Start the backend:

```bash
npm run server:dev
```

For compiled execution use `npm run server:build` followed by
`npm run server:start`. See [backend foundations](developer/backend-foundations.md)
for validated environment configuration, health and shutdown behavior.

The server defaults are:

- `PORT=8787`
- `HOST=0.0.0.0`
- `V3L0CITY_SERVER_DB=server/data/v3l0city.sqlite`

Optional server env:

- `V3L0CITY_PUBLIC_WS_URL`: public WebSocket base URL returned from `POST /v1/trips`. Use this behind a proxy or when the request host is not the URL mobile clients should use.

For a phone or simulator on the same LAN, launch the app with:

```bash
EXPO_PUBLIC_V3L0CITY_API_URL=http://<lan-ip>:8787 \
EXPO_PUBLIC_V3L0CITY_WS_URL=ws://<lan-ip>:8787 \
npm run ios
```

Telemetry is disabled unless both `EXPO_PUBLIC_V3L0CITY_API_URL` and `EXPO_PUBLIC_V3L0CITY_WS_URL` are present. Production deployments must use HTTPS/WSS.

## Data Model

The SQLite backend creates these tables:

- `devices`: anonymous install identity, platform metadata, optional push tokens,
  and hashed server-issued token.
- `trips`: remote trip metadata keyed by the client trip id.
- `trip_samples`: speed samples and compass diagnostics keyed by
  `UNIQUE(trip_id, sequence)`.
- `upload_batches`: idempotency records for HTTP and WebSocket sample batches.
- `live_sessions`: short-lived WebSocket session tokens.

Server SQLite data lives under `server/data/`, which is intentionally gitignored.

## Auth

Device registration returns a bearer token. All trip and HTTP sample endpoints require:

```http
Authorization: Bearer <deviceToken>
```

The server stores only a SHA-256 hash of device and live-session tokens.

## HTTP Contract

### Register Device

`POST /v1/devices/register`

Request:

```json
{
  "installId": "stable-anonymous-install-id",
  "platform": "ios",
  "appVersion": "1.0.0",
  "buildNumber": "1",
  "expoPushToken": "ExponentPushToken[...]",
  "nativePushToken": "apns-or-fcm-token",
  "pushPlatform": "ios"
}
```

Push token fields are optional and may be `null` when notification permission,
APNs/FCM credentials, or an EAS project ID are not available.

Response:

```json
{
  "deviceId": "uuid",
  "deviceToken": "opaque-token"
}
```

Registering the same `installId` rotates the bearer token, updates platform/app
metadata, and revokes all previously issued live grants for that device. Open
live sockets close with code `1008`; old bearer tokens receive `401`.

This legacy anonymous registration endpoint treats the installation ID as its
registration credential. It does not establish user-account identity or prove
possession of an existing bearer token when rotating one.

### Start Trip

`POST /v1/trips`

Request:

```json
{
  "clientTripId": "1779200000000",
  "startedAt": "2026-05-19T14:00:00.000Z",
  "units": "MPH",
  "mountLabel": "Dashboard"
}
```

Response:

```json
{
  "tripId": "1779200000000",
  "liveSessionId": "uuid",
  "sessionToken": "opaque-token",
  "wsUrl": "ws://192.168.1.25:8787/v1/trips/1779200000000/live?sessionToken=opaque-token"
}
```

The current backend uses the client trip id as the server trip id. An active
trip retry by its original device preserves the trip's initial metadata and
issues a fresh live grant. Existing unrevoked grants remain valid until expiry
or completion. Creation and ownership checks run in one SQLite write transaction.

If another device already owns that ID, the response is `409` with
`code: "trip_id_conflict"`; no grant is issued and no metadata changes. Retry
with a new unique client trip ID. If the original device has completed that
trip, creation returns `409` with `code: "trip_completed"`.

### Upload Sample Batch

`POST /v1/trips/:tripId/samples/batch`

Request:

```json
{
  "batchId": "1779200000000-http-1-60",
  "samples": [
    {
      "sequence": 1,
      "recordedAt": "2026-05-19T14:00:00.500Z",
      "elapsedMs": 500,
      "speedMps": 8.4,
      "distanceMeters": 4.2,
      "headingDegrees": 94.5,
      "headingSource": "course",
      "headingAccuracyDegrees": 3.5,
      "headingQuality": "good",
      "headingReasons": ["course-used"],
      "source": "gps",
      "quality": "good",
      "qualityScore": 0.95,
      "qualityReasons": ["native-speed-used"],
      "gpsAccuracyMeters": 5,
      "fixAgeMs": 120,
      "nativeSpeedUsed": true,
      "isMoving": true,
      "isStopped": false,
      "stale": false
    }
  ]
}
```

Response:

```json
{
  "batchId": "1779200000000-http-1-60",
  "inserted": 1,
  "lastSequence": 1,
  "duplicate": false
}
```

Rules:

- `samples` may contain up to 120 entries.
- `sequence` is positive and unique per trip.
- `headingSource`, `headingAccuracyDegrees`, `headingQuality`, and
  `headingReasons` are optional for backward compatibility. Missing older
  payloads default to `none`, `null`, `poor`, and `[]`.
- Duplicate `batchId` returns `duplicate: true` and inserts nothing.
- Duplicate sample sequences are ignored with `INSERT OR IGNORE`.
- `speedMps` and aggregate speed fields are capped by schema at `120 m/s`.
- A completed trip rejects new batch IDs with `409` (`trip_completed`). A
  previously accepted batch ID still returns its stored duplicate acknowledgement.

### Complete Trip

`POST /v1/trips/:tripId/complete`

Request:

```json
{
  "endedAt": "2026-05-19T14:12:30.000Z",
  "totalDistanceMeters": 3210.5,
  "maxSpeedMps": 21.4,
  "averageSpeedMps": 4.28,
  "finalSequence": 1500
}
```

Response:

```json
{
  "tripId": "1779200000000",
  "completed": true
}
```

Completion durably stores the aggregates and revokes all live grants in one
transaction. Open sockets close with code `1008`, and old live tokens cannot
reconnect. An identical completion retry succeeds; changing completion fields
after completion returns `409` (`trip_completed`). Upload pending samples before
completing the trip.

### Debug Trip Summary

`GET /v1/trips/:tripId`

Returns trip metadata and `sampleCount` for the authenticated device. This endpoint is for development and telemetry verification.

## WebSocket Contract

Endpoint:

```text
/v1/trips/:tripId/live?sessionToken=<token>
```

The session token comes from `POST /v1/trips` and expires after 12 hours by default.
The server checks authorization on connection and before every incoming message.
Idle connections also close at expiry; a stored expiry equal to the current time
is already expired. Revocation, device-token rotation, or completion invalidate
existing connections and prevent reconnecting with that token. Local revocation
closes sockets immediately after the database transaction commits; the legacy
SQLite server also polls authorization at most one second apart to detect
changes through another store connection. Unauthorized sessions receive a
generic `unauthorized` error and close with code `1008`.

`hello.tripId` must match the trip in the connection URL. A WebSocket
`trip_complete` sends its completion acknowledgement before closing the socket.
Administrative server code can revoke a single live session or all sessions for
a trip through the store; there is no public revocation endpoint in this adapter.

Client messages:

```json
{ "type": "hello", "protocolVersion": 1, "tripId": "1779200000000", "lastKnownSequence": 0 }
```

```json
{ "type": "sample_batch", "batchId": "1779200000000-ws-1-5", "samples": [] }
```

```json
{ "type": "trip_complete", "payload": { "endedAt": "2026-05-19T14:12:30.000Z", "totalDistanceMeters": 3210.5, "maxSpeedMps": 21.4, "averageSpeedMps": 4.28, "finalSequence": 1500 } }
```

```json
{ "type": "ping" }
```

Server messages:

```json
{ "type": "ack", "batchId": "1779200000000-ws-1-5", "lastSequence": 5 }
```

```json
{ "type": "error", "code": "invalid_message", "message": "Invalid WebSocket message.", "recoverable": true }
```

```json
{ "type": "pong" }
```

The mobile app sends live WebSocket batches of five 2 Hz samples. Acknowledged sequences are marked uploaded locally. If WebSocket is unavailable, samples remain local and are uploaded later over HTTP.

Application request logs retain the method and URL path, omit query strings and
request headers, and redact bearer/cookie headers. Errors do not echo raw payloads
or credentials. The legacy live URL still carries a grant in its query string;
configure proxy/access logging to omit queries too. Do not publish a live URL.

## Mobile Flow

1. Trip starts locally and gets a client trip id.
2. If telemetry env vars are present, the app loads or creates an anonymous install id.
3. The app registers the device if no device token is stored.
4. The app creates a remote trip and opens a live WebSocket.
5. While recording and not paused, the UI samples the native speed state at 2 Hz, writes the sample to SQLite first, then hands it to telemetry.
6. WebSocket acknowledgements mark local samples as uploaded.
7. On disconnect, the service attempts a small number of reconnects.
8. On trip save, remaining pending samples upload over HTTP in batches of 60, then the complete endpoint is called.

Network errors are logged as sensor warnings and written to local sample upload state when possible. They do not block speed display, local trip saving, trip history, or export.

## Quality Fields

Each sample carries the native speed engine diagnostics used to audit accuracy:

- `qualityScore`: numeric confidence from `0` to `1`.
- `qualityReasons`: reason labels such as `stale`, `poor-accuracy`, `outlier-rejected`, `imu-predicted`, `no-gps`, and `native-speed-used`.
- `gpsAccuracyMeters`: platform-reported horizontal accuracy when available.
- `fixAgeMs`: age of the current GPS fix.
- `nativeSpeedUsed`: true when the platform GPS speed was accepted as the speed source.
- `headingSource`: `course`, `device`, or `none`.
- `headingAccuracyDegrees`: GPS bearing or device compass accuracy when
  available.
- `headingQuality`: `good`, `medium`, or `poor`.
- `headingReasons`: labels such as `course-used`,
  `device-heading-used`, `low-speed-course-ignored`,
  `poor-heading-accuracy`, `no-heading`, and
  `precise-location-required`.

These fields are diagnostic. They do not make phone GPS perfect; they make degraded conditions visible and testable.

## Validation

Run the backend tests:

```bash
npm run server:test
```

Run app and native validation from the repo root:

```bash
npx tsc --noEmit
npx jest --runInBand
npm run lint
npm run test:speed-engine:cpp
```

Build both native targets after dependency, module, or autolinking changes:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -workspace ios/V3l0city.xcworkspace \
  -scheme V3l0city \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  build
```

```bash
cd android
JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home" \
  NODE_ENV=development \
  sh ./gradlew :app:assembleDebug
```
