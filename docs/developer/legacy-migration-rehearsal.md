# Legacy preservation and migration rehearsal

Existing Supabase accounts and cloud data **must be preserved** (user decision
October 6, 2026). Personal local history also remains intact. This requirement
rules out a fresh-cloud reset or destructive provider cleanup before recovery
and parity evidence. No source account, database or object was fetched or altered
by the current implementation.

`server/src/migration/legacy-rehearsal.ts` is an executable synthetic staging
archive rehearsal. It does not authenticate to Supabase, export real data, write
PostgreSQL or import working product accounts. Its tests preserve blocked links,
deleted trips, legal acceptance, opt-out preferences and sample payloads across
a confirmed one-to-one identity mapping, reject credential/session exports,
verify counts/checksums, detect conflicting/corrupted reruns and leave previous
state untouched on failure.

Archive row IDs must be namespaced by source table (for example
`cloud_trips:<id>`). Owner and related account references are mapped separately;
original payload values are retained for a later table-specific adapter.
Reordering rows/mapping does not change reconciliation hashes. A successful
source/mapping receipt makes a matching rerun idempotent. This is preparation,
not completed production migration: all nested domain IDs, relationships,
storage references and target authorization still need explicit schema mapping.

## Required source inventory

Before actual migration, authorized operators must inventory:

- Auth identity IDs, emails and verified status; selected re-verification and
  recovery UX. Do not treat a source verified timestamp as owned login proof.
- Profiles, `user_devices`, `cloud_trips`, `cloud_trip_samples`, `sync_batches`,
  friendships and all blocked/deleted states.
- `legal_acceptances`, `user_reports`, leaderboard aggregates and profile
  visibility policies, including data for surfaces retired from v2.
- Every actual storage bucket/object, private/public policy, ownership,
  content hash/bytes and references. Committed SQL alone does not prove what is
  deployed or whether source objects are absent.
- Existing tombstones, consent/opt-outs, disabled/deleted accounts and retention
  obligations. Record source completeness and stop if required data is missing.

Take an encrypted immutable source export and independent recovery copy, then
produce a sanitized rehearsal fixture. Provider passwords, refresh sessions,
verification tokens, keys and push-device credentials must not become target
password/session credentials; approved identity recovery and device token
re-registration remain separate. Preserve user data without granting access to
an unverified imported identity.

## Controlled rollout and recovery gate

1. Resolve auth/re-verification, consent and retention decisions in
   [the register](release-decisions.md); preserve old IDs through a durable mapping.
2. Validate exports and object manifests; reconcile source counts and content
   hashes before transform. Reject duplicate/dangling/cross-owner references.
3. Implement table-specific owned imports behind feature parity. Keep immutable
   source snapshots and idempotent receipts; rerun a sanitized fixture against
   ordinary PostgreSQL and verify blocks, consent and tombstones as behavior.
4. Rehearse cutover with the source write policy and recovery window explicit.
   A freeze/drain or reviewed dual-write strategy must account for changes made
   during migration; an old snapshot alone is insufficient.
5. Verify account access/recovery, local adoption, cloud restore/export/deletion,
   social privacy and object access under the owned backend. Then reconcile final
   deltas/checksums and test rollback without resurrecting deleted visibility.
6. Retire Supabase only after #82's feature prerequisites pass. Keep recoverable
   source archives according to the approved retention/deletion policy.

No production migration or deployment is part of this foundation change. The
later migration/cutover tickets require authorized source access and observed
recovery evidence; synthetic preservation tests do not close those gates.
