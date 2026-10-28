# Observability and quality implementation record

October 28, 2026. Base: `dev` merge `386241cd890efb3baaccbd0b66a6d689cf69d74f`
(PR #109, merged October 13). Branch: `feat/v2-observability-quality-gates`.

## Chronological scope and ticket completion

This pass starts the next outstanding queue entries: #30 OPS03, #32 QA01 and
#33 DOC01. It also establishes baseline #48 pull-request checks early, as the
chronological guide permits. Those release-wide tickets remain active while
features, container services, provider integration and physical qualification
are still being built. Their completed foundation checkboxes are tracked
separately from their full acceptance.

The earlier foundation tickets now record the actual merge and completed
checklist items. #29's last code/test gaps were a real concurrent ownership
collision and automated security CI; both are addressed in this pass. Its
completion requires successful security CI and the reviewed change being merged.
No other broad architecture/migration issue is closed merely because #109 merged.

## Delivered behavior

- Each HTTP request receives a server-generated correlation ID. Logs and metrics
  use approved route templates and fixed outcomes, excluding query values, trip
  identifiers, credentials, payloads, raw exceptions and socket close reasons.
- Bounded in-process HTTP/WS statistics and actual SQLite readiness are available.
  Export is absent by default; enabling it requires an explicit bearer secret.
  It reports telemetry, not unimplemented PostgreSQL/Redis/LiveKit product health.
- Observation failures cannot become awaited network dependencies. Backpressure,
  rejected/hung log writers and asynchronous broken stdout pipes have regression
  evidence. SQLite failure during active or idle socket authorization closes
  access while liveness remains available and readiness becomes unavailable.
- Two independent native SQLite worker connections race the same trip ID. Exactly
  one actor owns the trip; the loser receives no grant and cannot change metadata.
- Deterministic mobile/tooling commands, a portable mandatory C++ compiler runner,
  real PostgreSQL enforcement and local documentation-link checks are available.
  Missing compilers and skipped/incomplete database evidence fail CI.
- PR CI separates mobile, server/security/contracts/PostgreSQL, C++ and web jobs.
  Actions, Node and the PostgreSQL image are pinned. The aggregate `CI gate`
  requires every workspace job. No deployment secrets or publishing jobs are used.
- Browser tests start the actual production Next.js artifact with synthetic
  configuration and blocked external traffic. Desktop/mobile emulation remains
  distinct from physical iOS/Android testing.

## Validation evidence

Windows, Node 24.19.0, npm 11.17.0. A separate clean checkout installed 1,263
locked root packages with `npm ci`; web installed 398 locked packages. The current
working app/native algorithms and SQLite schema are unchanged.

| Check | Evidence |
| --- | --- |
| Mobile coverage | 28 suites, 115 tests and 2 snapshots passed. Statement coverage 69.84%, branch coverage 60.38%; these are observed baselines, not agreed release thresholds. |
| Tooling | 16 tests passed, including actual missing-compiler rejection and real Node skip/todo fixtures that cannot satisfy CI evidence. |
| Native C++ | Unchanged regression source compiled and executed with verified Zig 0.15.2 on Windows. A cold-cache 120-second attempt timed out; the bounded 300-second compiler deadline passed. |
| Web | Lint, TypeScript, 13 unit tests, synthetic production build and 12 production browser cases passed. |
| Workflow syntax | Verified actionlint 1.7.12 accepted the workflow; shellcheck/pyflakes were unavailable locally. |
| Server/PostgreSQL | 51 tests passed, zero skips, including 8 actual PostgreSQL integration cases and the concurrent SQLite collision. |
| Shared contracts | 9 tests and deterministic generated-document drift passed. |
| Types/lint/docs | Root TypeScript and lint passed. Local documentation targets: 32 files, zero broken links. |
| Compiled artifact | Actual process health/register/start/save/readback and redaction smoke passed on Windows; POSIX graceful SIGTERM is checked by hosted CI. |

Coverage is evidence about the tested paths, not a release sign-off. Connected
authority and adoption reducers show 94.28% and 95.83% line coverage; the broader
trip repository is 30.76%. Its ACK regressions do not qualify all lifecycle,
recovery or migration paths. #36/#37 remain the next Local persistence priorities.
Hosted workflow results must be read from an actual run before claiming CI passed.

The first hosted run,
[40786477638](https://github.com/Sammieblz/V3l0city/actions/runs/40786477638),
passed server/security/real PostgreSQL, Linux C++, compiled-server graceful
SIGTERM, and web production/browser checks. Its mobile job caught an existing
timezone-dependent history snapshot: the same epoch displayed on December 31 in
New York and January 1 in UTC. The snapshot now explicitly controls its default
locale/timezone while delegating to real Date formatting; product behavior and
snapshot files remain unchanged. Independent UTC and Pacific/Auckland runs pass.
The following PR run must confirm the complete gate on the corrected head.

Independent isolated-process replays first reproduced both the broken-pipe crash
and uncaught SQLite socket-validation crash, then confirmed their fixes. A saved
trip survives the broken log pipe; message and idle sockets close with code 1008;
readiness returns 503 and liveness 200. No real account/provider data was read or
changed. Documentation, generated contracts and fixture evidence describe current
behavior rather than promising unimplemented features.

## Remaining gates

The connected API remains unmounted. Device/background/storage-pressure checks,
complete Local lifecycle/recovery #36, SQLite expansion #37, Compose #45, full
authorization/provider monitoring, fault-triggered alerts, consented client crash
reporting, cost dashboards, agreed SLOs, security/dependency policy, stage/prod
delivery and real data migration remain with their original tickets.

GitHub returned 403 when the connected integration attempted to inspect branch
protection. A passing workflow is not proof that GitHub requires it before merge.
Repository administration must require the actual `CI gate` check on `dev` and
other protected release branches; that policy remains open in #48 until verified.

Existing Supabase accounts/cloud data must be preserved. Local remains the mobile
default, legacy auth/social requires explicit provider configuration, and personal
cloud backup/restore denies access until persisted ownership/adoption consent is
wired. Local history/export remain available. No merge, deployment or provider
retirement is performed by this implementation pass.

References: [chronological guide](../planning/v2.0.0/chronological-ticket-guide.md),
[original foundations](foundation-implementation-record.md),
[observability](observability.md), [testing and operations](testing-and-operations.md).
