# Owned PostgreSQL foundation

The `server/migrations/` baseline is ordinary PostgreSQL, independent of Supabase
`auth.users`, `auth.uid()`, hosted functions or extensions. Keep device SQLite and
the legacy server telemetry SQLite path unchanged. The PostgreSQL tables are a
schema foundation, **not working product APIs, row authorization or completed
Supabase feature/data parity**. Runtime `/v2` product endpoints remain disabled.

The user has confirmed existing Supabase accounts and cloud data must survive
the transition. This baseline does not read or alter that provider. Import and
identity transition require the separately documented mapping, consent/block/
tombstone reconciliation, checksum rehearsal and controlled cutover. Password
hashes or sessions are not presumed transferable. Final provider retirement
follows verified owned-backend parity and preservation evidence.

## Build and explicit migration

From the repository root:

```text
npm run server:build
```

Set `DATABASE_URL` through the operator's environment/secret tooling, then run:

```text
node dist/server/src/db/migrate-cli.js
```

No startup path silently creates a PostgreSQL connection or runs these
migrations. `DATABASE_URL` accepts `postgres://` or `postgresql://`. The compiled
runner finds `dist/server/migrations`, which the server build copies from source.
`MIGRATIONS_DIRECTORY` overrides that path for an explicit packaging/test setup.
Database TLS/trust and credentials remain environment/operator decisions; never
disable production certificate verification to imitate a local fixture.

The CLI emits version results without connection URLs, raw SQL failure details,
credentials or inserted payloads. Missing configuration and failures return a
nonzero exit. More detailed diagnostics belong in restricted operator tooling.

## Migration guarantees

Names are sequential `0001_description.sql`, `0002_description.sql`, etc. Files
are bounded UTF-8 SQL. SHA-256 checksums canonicalize BOM/CRLF to UTF-8 LF so a
Windows checkout does not falsely alter committed content. Applied versions,
names and checksums are immutable; change schema in a new migration. Missing,
renamed, out-of-sequence or edited history fails before applying pending work.

The dedicated client holds a session advisory lock throughout history check and
application, so competing migrators serialize. Each file and its history insert
commit in one transaction. An SQL error rolls back both; a terminated connection
also rolls back and PostgreSQL releases its session lock. The runner owns
transaction boundaries. Nontransactional database/maintenance operations and
concurrent index creation are rejected; plan separate reviewed operations when
they are eventually needed. Disconnect the dedicated client after use; never
call the runner on a pool that sends successive queries to different sessions.

Upgrade/rollback policy is expand/migrate/contract for supported clients. There
is no generic destructive down-migration command. Back up and rehearse recovery
before production changes; choose provider/recovery objectives separately.

## Roles and permission boundary

Use separate migration and application login roles. The migration role owns the
application schema/history and needs appropriate schema creation/DDL access.
Provision secrets outside source. The application role must be NOINHERIT,
NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS and have no role memberships.
NOINHERIT alone still permits SET ROLE; the helper therefore requires a standalone
application role. Its server-side access is not an end-user grant.
Call this helper with a dedicated connected client outside any existing
transaction. It owns one transaction across validation and all privilege
mutations; errors roll back the complete grant/revoke batch, and a terminated
connection is rolled back by PostgreSQL. No temporary overgrant is committed.

After role provisioning, optional `DATABASE_APP_ROLE` makes the explicit CLI
apply `grantApplicationRole`. That helper validates identifiers/role privileges,
then rejects owned foundation objects, pre-existing CREATE/TRUNCATE and other DDL
privileges, grant options and migration-history access before granting anything.
Provision a fresh dedicated application role; it does not sanitize an existing
administrative role. It grants schema usage and necessary DML/sequence usage, denies migration-history
access, gives no CREATE/TRUNCATE/ownership/grant option and limits audit/trip
event deletion/update. Subscription audit events permit only their processed
timestamp to change. Repeat grants after new reviewed migrations; broad default
privileges are deliberately not installed. PUBLIC gets no access to this schema.

The database has composite ownership foreign keys for session/device,
membership/selected vehicle, backup/media and participant-authored messages.
These prevent cross-owner references; they do **not** answer whether a joined
member is still active, blocked, permitted to edit a route or eligible for Plus.
Those require reusable guards and domain authorization in the owned service,
including ongoing socket/media revocation. No row-level-policy parity is claimed.
Deferred owner/host membership foreign keys require the referenced membership to
exist; API transactions must also enforce its role, active state and all terminal
lifecycle transition rules. Row-shape constraints alone do not grant authority.

## Durable models and revisions

Cloud backups retain the original personal `local_trip_id` as bounded text,
including the app's existing timestamp-string IDs. Owned backup IDs and shared
trip IDs are separate UUID identities. The owner/local ID uniqueness constraint
does not rewrite, adopt or delete a native SQLite recording.

The baseline includes users, devices/credentials/sessions/email tokens,
vehicles, buddy requests/edges/blocks, crews/memberships, trips/memberships,
invitations, meetups/RSVPs, ordered waypoints, durable chat/events/summaries,
media objects/backups, subscription events/state, push, reports/audit,
owner-scoped idempotency receipts and per-user sync cursor entries.

No table records the realtime one-Hz member position stream. Personal/native
samples stay on the device unless a separately consented eligible backup policy
is implemented. JSON metadata columns are structural placeholders, not permission
to put raw location, tokens, voice or arbitrary diagnostics into cloud storage.

Durable mutable entities carry positive revision, timestamps and tombstones.
Every update must explicitly increase revision; a trigger rejects stale/decreased
revision and sets `updated_at`. Application writers use expected revision in the
WHERE clause and handle conflict, rather than overwriting another device's edit.
The trigger is not generic conflict resolution. Retention/tombstone lifetimes
remain explicit decisions; deleted visibility must not resurrect after restore.

Create a trip and its host membership in one transaction; the deferred composite
host-membership FK checks at commit. Crew and owner membership follow the same
pattern. Role/state correctness and host transfer still require domain guards.
Active/ended/scheduled trip timestamps have consistency checks. Waypoint order is
deferrable for transactional reordering; a waypoint tombstone clears ordinal.
Normalized buddy requests prevent concurrent reverse-direction pending edges.
UUIDs are supplied by application code; no UUID/GEO extension is required.

## Reproducible validation

`npm run server:test` executes unit tests; real database tests run only when an
explicit `TEST_DATABASE_URL` is supplied. The database **must be an isolated
fixture whose name ends `_test`**. The suite drops/recreates only `v3l0city` in
that checked database and creates/deletes test-only roles. Never set a production
or shared development database here. Administrator capabilities are required to
create fixture roles and terminate an intentionally interrupted fixture session.

Real PostgreSQL validation covers empty bootstrap/reapply/checksum drift;
owner-scoped FK and participant failures; relationships, lifecycle/coordinates/
revision constraints; app/outsider privileges; actual EXPLAIN on 10,000 synthetic
messages; concurrent migrators; failed SQL rollback/history; and a terminated
transaction followed by lock/recovery proof. Checks do not fake a PostgreSQL
pass when no database is available: the integration suite is reported skipped.

The current task ran these fixtures against an isolated PostgreSQL 17.11 instance
without extra extensions. Query-plan/latency output is fixture evidence, not a
production performance guarantee. Existing Supabase data was neither fetched
nor changed. Backup/restore, real import, approved identity UX, complete feature
authorization and production/cloud topology remain later gates.
