# ADR 0001: portable modular backend

Status: accepted foundation direction; provider integrations are pending.
Source: PDF Version 1.0 pp5–8,17–18,28–30 and the user's v2.0.0 scope/backend
instructions. Release tracker: #8; implementation: #27/#35/#39.

## Context

The native app already computes movement and records locally. Its Fastify server
is a device telemetry sidecar; optional account/social operations use Supabase.
The full included release needs owned authorization and portable development and
deployment. Cloud hosting has not been selected.

## Decision

Use a modular Fastify/TypeScript application with compiled Node production
entrypoint. Keep transport/runtime configuration separate from domain authority
and provider adapters. Begin in one application/repository; separate gateway or
worker deployment only when workload and failure isolation justify it.

Ordinary PostgreSQL owns durable identity, roles, membership, chat, revisions,
tombstones and entitlements. Use versioned transactional SQL with checksums and
locking; keep migration credentials separate from least-privilege runtime roles.
No Supabase auth schemas or vendor identity functions are a schema prerequisite.
The existing telemetry SQLite store remains explicitly legacy during migration.

Redis owns bounded ephemeral presence and cross-instance fanout. Loss/expiry must
not invent membership; GEO/member indexes need cleanup/filtering in addition to
key TTL. Do not persist every live GPS point as product Postgres history.

Self-hosted LiveKit is the media baseline. It does not replace owned membership
or removal policy. Cached-token reconnect behavior needs an enforced revocation
design and device evidence before launch; short expiry alone is insufficient.
Voice failure should not stop personal recording or durable chat.

Use maintained identity/password/session libraries. Library/auth-method selection
is still open before #51/#58; do not implement home-grown cryptography or assume
Supabase password hashes are portable. Keep email delivery, push, compatible
object storage, maps and billing behind typed adapters and environment URLs.
Mapbox, RevenueCat and APNs/FCM are source integration baselines, with capability
verification in their tickets. No VPS/cloud vendor, price or budget is selected.

## Consequences and evidence

Local HUD/record/history/export cannot wait for an account or any connected
service. Component boundaries improve migration, but replacing providers still
requires real data/auth/device testing. Containers and a remote reference host
must use the same compiled artifacts and versioned SQL; those delivery tests are
subsequent tickets, not implied by a local compile.

Current executable modules: telemetry, lifecycle/config, shared declarations,
Postgres migration infrastructure and injected mobile provider seams. Product
routes, Redis, media and owned identity are not enabled by this ADR.
