# v2 foundation implementation record

Date: October 6, 2026. Base: `dev` commit
`5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd`. Implementation branch:
`feat/v2-architecture-foundations`. No changes were merged into `dev`, deployed,
or applied to an existing account/provider database during this work.

## Chronological work and ticket state

This change follows the chronological foundation queue. Later final acceptance
stays attached to the original tickets; preparatory schemas/reducers do not close
feature or physical evidence gates.

| Order/ticket | Implemented and verified | Remaining acceptance |
| --- | --- | --- |
| 1: #27 ARCH01 | Compiled portable runtime, validated config, resource cleanup, health, redacted diagnostics, service ADRs and retain/port/retire inventory | Native/device Local qualification and operational deployment evidence belong to later feature/QA/delivery work. |
| 2: #28 PLAN01 | Confirmed/proposed/open decision register with roles, evidence and phase gates. User confirmed preservation of existing cloud accounts/data. | OS/device floors, identity/email, caps/prices, retention, host/media, measured budgets and RPO/RTO remain explicit decisions. |
| 3: #29 SEC01 | Cross-owner trip collision rejected before mutation/grant; same-owner retries retain metadata; completion/revocation/rotation/expiry close sockets and deny reconnect. | Review/merge of this change; legacy install-ID registration and durable ACK/outbox reliability remain documented separate work. |
| 4: #31 PROD-CORE01 | Distinct personal/shared/membership/live types, authority ADR, consent/epoch/revision safety reducer, explicit adoption planning and native coordinate-contract audit | Wire authenticated transport/shared UI and persisted ownership; actual two-device and native/background/device journeys. |
| 5: #35 PROD-CONTRACT01 | Strict versioned product REST/WS declarations, opaque local recording IDs, bounded/error/epoch schemas, deterministic generated OpenAPI/JSON Schema | Product endpoints and domain authorization are unmounted; runtime/client/reconnect pagination parity follows feature implementation. |
| 6: #39 DB01 | Ordinary PostgreSQL schema, owner-scoped constraints/indexes/revisions/tombstones, transactional checksum migrator and atomic least-privilege role provisioning | Device upgrade qualification, feature-specific authorization, supported deployment compatibility and production backup/restore evidence. |
| 7: #44 MIG01 | Lazy injected mobile providers, Local default, credential-bound account-switch-safe sync, actual SQLite snapshot/outbox ACK, synthetic identity/preservation archive rehearsal | Persisted consent/owner adapter, minimum web adapter, owned feature parity, authorized source inventory and full table/object import/reconciliation. |
| Later: #82 PROD-MIG01 | Inventory, preservation requirement and controlled-cutover gates documented | Remains blocked on owned auth/social/trip/chat/sync/billing and retained-data parity. Supabase artifacts/dependencies remain during migration. |

## Reproducible evidence

Windows/PowerShell, Node 24.19.0, locked root dependencies. Use `.cmd` wrappers
where PowerShell execution policy prevents `.ps1`. This checkout was clean at
the recorded base; application/native UI and device schema were retained.

| Check | Result |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit` | Passed. |
| `node node_modules/jest/bin/jest.js --runInBand` | 28 suites, 115 tests, 2 snapshots passed. Includes 9 real SQLite ACK regressions through an Expo database API bridge. |
| `npm run server:test` with isolated `TEST_DATABASE_URL` | 40 tests passed, zero skipped. Includes 8 actual PostgreSQL integration tests, legacy preservation, runtime and telemetry/security cases. |
| `npm run shared:test` | 9 tests passed, zero skipped. |
| `npm run contracts:check` | Fresh compiled build and deterministic artifact drift check passed. |
| `npm run lint` | Passed with `EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1`; no warnings/errors reported. |
| Native C++ regression source | Compiled with Zig 0.15.2 `c++ -std=c++20 -Wall -Wextra -Werror` against unchanged engine/tests; executable reported `SpeedEngine C++ tests passed`. Compiler came from the verified official release index. |
| Compiled production entrypoint | Actual Node process booted, readiness succeeded, API1 registration worked and credentials were absent from logs. Windows process termination is not Unix graceful-signal evidence; direct lifecycle/deadline/failure tests cover cleanup logic. |
| Compiled PostgreSQL CLI | Fresh isolated bootstrap applied version 1; second run applied none and recognized version 1 unchanged. |
| Diff/documentation review | Whitespace checks passed; developer guides updated and local links checked. |

Actual PostgreSQL 17.11 ran on loopback in a workspace fixture. Database tests
checked constraints, standalone role/ownership/grant-option denial, atomic ACL
rollback, concurrent migration, changed checksums, SQL failure, terminated-session
rollback/lock release, and indexed pagination on 10,000 synthetic messages. The
fixture plan/latency is not a production SLO. No additional extensions were
required. Tests use fresh checked `_test` databases and never a shared or
production database. Docker was unavailable, so this evidence is PostgreSQL
process evidence rather than Compose/container evidence.

Independent review reproduced the original cross-owner metadata/grant bug and
found additional cache/consent replay, account-transition/outbound-token,
overlapping-upload, stale ACK, readiness, stale-build and role-transaction risks.
The corresponding patched sequences and SQL regressions passed. One concurrent
account-screen test run timed out under resource contention; isolated smoke and
the final full 115-test run both passed without changing that test or its timeout.

## Deliberate interim behavior and release limits

Local mode imports/constructs no cloud SDK provider. Legacy auth/social requires
`EXPO_PUBLIC_V3L0CITY_CLOUD_PROVIDER=legacy-supabase` plus its public configuration.
The global personal backup/restore ownership port denies access until persisted
account adoption is wired; signing in does not silently claim old recordings.
Local history and export remain available. Synthetic mapping/reconciliation is
preparation for preserving the user's existing data, not a live data migration.

The `/v1` telemetry API remains a legacy sidecar with documented registration
limits. Its ACK watermark is not yet a contiguous durable cursor (#54). All
generated `/v2` product operations are marked declared/unmounted. No shared map,
voice, auth, Plus, hosted service or final provider retirement is claimed here.

Native iOS/Android builds, physical devices, real two-client connected E2E,
Compose/remote host, stage/prod pipelines, store/media provider tests, actual
account/cloud-data migration and production recovery were not executed. These
remain in the chronological delivery/feature/QA tickets. Architecture epic #9
stays open until its full acceptance and #82's later parity gate are met.

References: [backend foundations](backend-foundations.md),
[decisions](release-decisions.md), [PostgreSQL](postgresql.md),
[contracts](contracts.md), [domain seams](owned-domain-and-migration.md),
[legacy preservation rehearsal](legacy-migration-rehearsal.md).
