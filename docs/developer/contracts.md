# Shared product contracts

`shared/contracts/` owns strict Zod schemas and TypeScript types for the proposed
product `/v2` API and realtime protocol 2. These are foundation declarations, not
mounted Fastify features. The existing `/v1` telemetry routes/protocol remain
separate. Every generated `/v2` operation says `declared-not-mounted`; generated
documents must not be used to advertise working accounts, trips, maps or radio.

Generate with `npm run contracts:generate`; verify checked-in documents with
`npm run contracts:check`; execute `npm run shared:test`. The generator uses no
timestamps, provider credentials or network and writes deterministic JSON to
`docs/api/v2-openapi.json` and `docs/api/v2-realtime.schema.json`. Source schemas
and generated changes belong in the same PR. JSON Schema describes structural
validation; domain consistency, permission checks, revision conflicts and
webhook authentication still need runtime implementation and adversarial tests.

## Boundaries

- UUID identifiers for owned entities and durable idempotency keys; opaque bounded
  cursor pagination. Existing personal recording IDs remain opaque strings of
  1–128 characters, including timestamp IDs. Backup `localTripId` preserves that
  original value; its separate backup/media IDs remain UUIDs. No ID rewriting or
  local recording adoption occurs just because a backup is requested.
- Shared trip: scheduled/lobby/active/ended/cancelled. Membership:
  invited/joined/left/removed. Roles: host/member; crew: owner/admin/member.
- Strict request objects reject injected role, owner and author fields. Actor
  identity comes from authenticated server state, never the client payload.
- Generic sync permits profile, vehicle, chat and waypoint mutations. Membership,
  invitations, roles and billing require authoritative domain endpoints. Pull
  changes carry records or tombstones, not mutation acknowledgements alone.
- Location uses bounded finite coordinates, sequence and authenticated connection
  epoch. A frame cannot reset a watermark by supplying a new epoch. Sequence gaps
  are allowed for ephemeral location; they must not acknowledge missing durable
  samples. Client time windows require an explicitly selected policy.
- `LOCATION_SHARING_CHANGE` carries no coordinates. Paused sharing cannot send a
  location frame. Member/device identity is assigned server-side.
- Incoming client realtime JSON is bounded to 8,192 UTF-8 bytes before parsing;
  binary/non-string frames fail closed. Server snapshot payload/transport limits
  need separate runtime measurement and policy. HTTP size/rate
  controls, authentication and revocation remain server responsibilities.
- Reactions include creation/expiry; runtime must reject expired/replayed signals.
  GPS, old reactions and audio are not a durable reconnect replay queue.
- RevenueCat vendor event fields may expand; its envelope is the sole loose
  external schema. Verify configured authorization and optional HMAC against
  exact raw bytes before processing, then deduplicate/order by provider event.
- Personal backup declarations require explicit consent and an owned private
  media object. Runtime must enforce owner access, media readiness/purpose, Plus
  eligibility, consent ledger, retention and deletion. These declarations do not
  enable uploads, restore or migration of existing provider data.
- `/health/live` and `/health/ready` describe the telemetry operational runtime:
  API versions `[1]`, `productApiEnabled:false`. Health is not product enablement.

Authentication UX, caps/prices, retention, time/freshness budgets, self-hosted
LiveKit cached-token revocation, offline map capabilities and experimental radio
launch remain decisions. Structural numeric bounds are resource-validation
limits, not sold tier limits or claimed GPS precision. Domain adapters must map
existing local recordings without making a connected cache an authority.
