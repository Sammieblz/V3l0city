# Local recording and SQLite implementation record

October 28, 2026. Base: `dev` merge
`b69491d78198a82442bb8e878016a0464b5b9c6b` (PR #110).
Branch: `feat/v2-local-recording-recovery`.

## Chronological progress

[#29 SEC01](https://github.com/Sammieblz/V3l0city/issues/29) is completed and
closed after PR #110 merged. Its security regressions and mandatory hosted CI
passed on the reviewed PR head before merge. The OPS epic checklist is updated. Broad observability,
QA, documentation and delivery tickets remain active for their remaining scope.

The next implementation batch follows
[#36](https://github.com/Sammieblz/V3l0city/issues/36) and
[#37](https://github.com/Sammieblz/V3l0city/issues/37). Their software work is
reviewable independently of the remaining native/device and connected-feature
qualification. They remain open until all acceptance evidence exists; reaching
a ticket in the queue does not make it complete.

## Changes and defects addressed

- Start/save retries no longer replace trip parents and cascade-delete samples.
  Samples, checkpoints, summaries and finalization/outbox commits are atomic.
- Recovery restores all drafts paused, keeps confirmed totals/units/mount, and
  exposes continuity gaps. Resume and Save & end are explicit. History clearing
  preserves unfinished recordings. MPH history distance now displays miles.
- A shared serialized controller handles manual, automatic and car actions.
  Network/native presentation failures cannot hold a completed recording active.
  Finite ordered sensor readings keep their original times and sequences.
- Startup, history/insights and exports distinguish storage failure from no data.
  Startup retries never reset data; invalid legacy sources get a nonblocking
  notice. JSON/CSV preserve gaps separately from actual readings.
- Ordered transactional migrations support representative old and current DBs.
  Failed initialization never publishes a partial connection. Ambiguous sample
  sequence collisions preserve the file and fail for recovery.
- Legacy AsyncStorage import validates complete payloads and commits digest
  receipts before removing sources. Later explicit preference edits cannot be
  overwritten by a retained legacy payload.
- Provider/account cache scopes, generation barriers, expiry, revision/tombstone
  barriers, bounded replicas and a separate connected outbox establish safe
  persistence seams. Cached data never authorizes an action.
- Native glance projections anchor confirmed totals to their own current counter
  and retain peaks from actual session readings. They cannot reuse a prior trip's
  cumulative distance/peak. Counter reset and pause behavior use the same tested
  framework-free helpers that production Swift/Kotlin managers call.

Existing personal data, upload acknowledgements, legacy outbox work and account
associations remain. No live provider migration, account adoption, cloud backup
enablement, deployment or native sensor-algorithm change occurs in this batch.

## Validation and remaining evidence

Windows, Node 24.19.0 and npm 11.17.0: the integrated mobile suite passes 235 tests
across 39 suites, with 2 snapshots and zero skips. Observed statement coverage is
79.10%, branch coverage 68.05%; these are measurements, not release thresholds.
TypeScript and root lint pass. Tooling has 19 passing tests, and documentation
checks find no broken local links in 33 files. The file-backed SQLite fixtures execute real constraints, transactions,
rollback, close/reopen and storage-full failures; they do not mock SQL success.
Controller/React checks cover serial actions, recovery and readable failure/retry
states. Export tests prevent sharing incomplete data on read failure.

Native projection execution and full workspace CI results must be read from the
actual hosted run before claiming success. Windows here has no Swift/Kotlin/Java
toolchain or mobile SDK. Mandatory CI compiles and executes both helpers on its
Ubuntu 24.04 native job; missing compilers are failures. JavaScript/Hermes bundle
exports do not certify the native app, widgets, Live Activities or permissions.

The following device checks are still required. Record app commit/build, OS,
hardware, permissions, network state and actual result for each run:

| Device check | Required observation |
| --- | --- |
| iOS and Android, airplane mode | Start, pause/resume, save, History and JSON/CSV work without a V3l0city service |
| Restart during recording/finalization | Confirmed totals survive, a paused recovery is actionable and completion occurs once |
| Revoke/deny/approximate location and GPS loss | No invented samples, truthful state, explicit recovery when precise location returns |
| Background/lock/OS suspension/process termination | Observe actual surviving native aggregates and durable gaps; no claim of continuous native sample journaling |
| Storage pressure and interrupted upgrade | Existing history/source files survive; visible retry succeeds once storage is usable |
| Large text, VoiceOver/TalkBack, short landscape | Recovery/error controls remain readable, reachable and correctly announced |

Block and membership-loss product flows are later work; they must call the
invalidation seams and revalidate server authority. Cached snapshots, entitlements
and local ownership never replace grants. Physical background durability remains
unproven: neither platform currently has a native SQLite per-sample journal.
Manual facade authentication changes invalidate caches immediately. External SDK
auth changes reconcile when the next session is observed; push-event integration
remains with the connected-auth/transport work.

## Supporting documentation

- [Local data and export](./local-data-and-export.md)
- [Mobile frontend](./mobile-frontend.md)
- [User guide](../user-guide.md)
- [Chronological ticket guide](../planning/v2.0.0/chronological-ticket-guide.md)
