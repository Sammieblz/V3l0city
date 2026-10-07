# v2 backend foundations

Implementation starts from `dev` at `5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd`.
The [chronological ticket guide](https://github.com/Sammieblz/V3l0city/blob/docs/v2.0.0-planning/docs/planning/v2.0.0/chronological-ticket-guide.md)
defines dependency order. [Architecture epic #9](https://github.com/Sammieblz/V3l0city/issues/9)
also contains the final cutover #82, which requires later feature parity. An epic
checklist is not proof of acceptance or a reason to remove working legacy code.

## Executable runtime

```sh
npm ci
npm run server:build
npm run server:start
npm run server:test
npm run shared:test
npm run contracts:check
```

Use `npm.cmd` on Windows PowerShell if script execution policy blocks `npm.ps1`.
Node 24.19.0 is the tested backend toolchain for this change. Native build support
is a separate decision. `server:build` compiles Node/CommonJS JavaScript into
`dist/` and copies SQL migrations; production uses `node`, without `tsx` or Expo.
Development retains `npm run server:dev`. Tests compile separately into
`dist-test/` and execute with Node's test runner. Both directories are generated.

Export the variables shown in [`server/.env.example`](../../server/.env.example).
The server does not load `.env` automatically. Development defaults are
`0.0.0.0:8787`, persistent SQLite at `server/data/v3l0city.sqlite`, and a 10-second
shutdown deadline. Bind `127.0.0.1` for machine-only development; use a deliberate
LAN binding for physical devices. These are runtime defaults, not release SLOs.

`V3L0CITY_ENV` accepts development/test/staging/production. `NODE_ENV=production`
selects production if the explicit setting is absent. Ports and deadlines must
be complete bounded integers. Staging/production require a configured `wss`
origin without credentials, path, query or fragment, and reject an in-memory
database. TLS termination and durable volumes remain operator responsibilities.
`V3L0CITY_PUBLIC_WS_URL` supplies the origin used in live grants independently of
cloud host. Development may derive it from the incoming Host header; do not use
that fallback in a deployment.

The entrypoint validates config before creating resources. Failed listen closes
the store; repeated SIGINT/SIGTERM share one shutdown operation. A stuck close
reaches the configured deadline. Windows process termination is not evidence of
Unix signal handling; the close/deadline logic is tested directly on Windows.
Container signal delivery is a later operational check.

| Endpoint | Meaning |
| --- | --- |
| `/health/live` | Telemetry process is serving requests. |
| `/health/ready` | This telemetry runtime is accepting requests. Reports API `[1]` and `productApiEnabled:false`. |
| `/v1/*` | Hardened existing device telemetry API; SQLite server store. |
| `/v2/*` | Shared contract declarations; product routes are not mounted yet. |

Readiness does not claim PostgreSQL/Redis/media/auth availability or product
readiness. Those checks must be added with the services they actually supervise.
Readiness probes the actual telemetry SQLite connection and returns 503 if it
is unavailable. Liveness remains independent of database readiness.
Default logs contain path-only request URLs, omit auth/cookies/query/body, and
use structured field names for startup errors. Reverse proxies and crash tools
need their own query/header/body redaction; application settings cannot protect
an independently configured proxy.

## Module and authority boundaries

| Module | Current responsibility | Next integration |
| --- | --- | --- |
| `server/src/app.ts`, `store.ts` | Existing device telemetry, access and live grants | Keep distinct from authenticated shared product trips. |
| `server/src/config.ts`, `runtime.ts` | Validated boot, health and resource lifecycle | Add readiness for implemented dependencies. |
| `shared/contracts/` | Versioned strict product schemas and generated docs | Implement each declared route with actual authorization. |
| `server/src/db/`, `server/migrations/` | Ordinary PostgreSQL migration infrastructure | Durable domain repositories and feature endpoints. |
| `src/domain/connectedTrip.ts` | Personal recording versus connected session safety state | Wire authenticated transport and UI in the trip tickets. |
| `src/domain/recordingOwnership.ts` | Explicit ownership/adoption planning | Persist account ownership and consent before backup is enabled. |
| `src/cloud/providers.ts`, `cloudService.ts` | Lazy injected provider boundary and account-scoped sync guards | Owned auth/social/sync adapter after endpoint parity. |

Personal samples remain device-owned in SQLite. The server owns membership,
roles, block decisions and entitlements; a cache cannot grant these permissions.
Redis will hold ephemeral location/presence, not durable membership. LiveKit will
transport audio with server-controlled admission. Storage, email, push and billing
will use explicit adapters; no cloud-provider SDK belongs in domain contracts.
ADRs below distinguish this target from implemented services.

## Capability inventory

| Existing capability | Disposition | Replacement/evidence gate |
| --- | --- | --- |
| C++ movement engine, Swift/Kotlin collectors, hooks | Retain | Preserve sensor/math regressions; one collector. Coordinates are not yet projected into JS/persisted samples. |
| Personal SQLite trips/samples/drafts/preferences/export | Retain | Preserve local IDs/data; add consent/ownership as a separate migration. No device schema changes in this foundation. |
| Widgets, Live Activity, Android active-trip notification | Retain | Native lifecycle/device checks when these layers change. |
| Fastify device telemetry + server SQLite | Retain during port | Ownership/revocation fixed here; ACK/outbox reliability remains #54. This sidecar is not the shared-trip backend. |
| Mobile Supabase auth/social/sync providers | Port behind injection | Local is default; `legacy-supabase` is explicit. Owned adapter waits for auth/social/sync parity. |
| Legacy personal cloud backup/restore | Temporarily fail closed | Unscoped local rows need persisted account adoption; facade reports unavailable rather than auto-uploading. |
| Supabase web clients/proxy | Port later | Minimum web adapter and real auth parity remain #44; unchanged here. |
| `sync-trips` | Port | Owned idempotent push/pull, tombstones, owner/consent checks (#60). |
| `search-friends`, `friend-request`, `friend-requests`, `friend-respond`, `friend-suggestions`, `profile-summary` | Port/review semantics | Road Buddy/profile/block parity (#66 and auth tickets); legacy friend suggestions must not imply permanent tracking consent. |
| `nearby-users` | Retire public discovery after review | v2 sharing is deliberate shared-trip membership; no public stranger map. Keep legacy artifacts until cutover. |
| `leaderboards` | Retire competitive surface after review | No racing incentives in the v2 plan; source aggregate data still needs export/deletion decisions. |
| `delete-account`, `report-profile` | Port | Owned deletion/export/report and retention/security gates (#65/#94). |
| Supabase SQL/RLS/auth/storage assumptions | Port and archive after parity | Ordinary PostgreSQL owned identity; never replay `auth.users`/`auth.uid()` SQL or copy unsupported password hashes. |
| Public Next.js site/browser simulator | Retain independently | Browser-local truth and explicit native capability limits. |
| CarPlay/Android Auto POC | Keep deferred | Not v2 production scope; widgets remain separate. |
| Mapbox/Redis/LiveKit/RevenueCat/S3/push product adapters | New implementation | No existing verified runtime; feasibility, auth and device evidence required by their tickets. |

Five historical Supabase migrations cover social, profile bootstrap, indexes,
web legal/safety and profile visibility. Their security policies are migration
requirements to inventory, not portable authorization already implemented.
No live provider data or production credentials are touched by this foundation.

## Decisions and current limits

- [ADR 0001: portable modular backend](adr/0001-portable-backend.md)
- [ADR 0002: authority and migration](adr/0002-domain-authority.md)
- [Decision register](release-decisions.md)
- [Shared contracts](contracts.md)
- [Domain and migration seams](owned-domain-and-migration.md)
- [Legacy preservation rehearsal](legacy-migration-rehearsal.md)
- [PostgreSQL operations](postgresql.md)

The final Supabase cutover remains #82, after owned feature/data parity. CI/CD,
Compose, production images, Redis/media, E2E and physical devices are subsequent
ordered work. This foundation does not claim they have been built or tested.
