# V3l0city v2.0.0 Chronological Ticket Guide

Sequence baseline: October 5, 2026. Repository: `Sammieblz/V3l0city`.

Work through the 80 v2.0.0 implementation tickets in the order below. The 12 checkpoints prioritize Local continuity, a working shared trip and a truthful realtime map before voice and monetization. Each recorded prerequisite appears before its dependent ticket. The release tracker and epics organize this work; the separate future backlog stays outside it.

Release tracker: [#8](https://github.com/Sammieblz/V3l0city/issues/8). Documentation review: [draft PR #108](https://github.com/Sammieblz/V3l0city/pull/108).

## How to use this order

- For one developer, follow the numbered order as the default queue. For a team, assign independent tickets in parallel once their own prerequisites are ready. A checkpoint is not a mandatory barrier that makes every unrelated ticket wait.
- This is a recommended start and handoff sequence, not a dated schedule or a claim that tickets are completed. Establish verified foundational outputs first; keep broad testing, documentation and operations work open until its full acceptance is met.
- Prepare tests and UI scaffolds early with local fixtures. Do not claim completed authenticated or native behavior before the required service, permission and device evidence exists. Recorded ticket dependencies remain authoritative; this guide does not silently change them.
- Each ticket links to its complete tasks, source references, acceptance and validation. Do not close it because its row was reached. Record implementation/build evidence, update its parent epic and keep relevant docs current.

The 80 executable work tickets are #27-106. Tracker #8, epics #9-26 and future backlog #107 are containers, not additional implementation steps. No calendar durations, release dates, hosting vendor or final free/paid caps are assumed.

## Start with these three tickets

- [#27 ARCH01](https://github.com/Sammieblz/V3l0city/issues/27): establish the owned-backend service boundaries.
- [#28 PLAN01](https://github.com/Sammieblz/V3l0city/issues/28): record decisions, owners, evidence and acceptance budgets.
- [#29 SEC01](https://github.com/Sammieblz/V3l0city/issues/29): reproduce and fix cross-owner trip collisions and ongoing-session revocation.

They can start in parallel. Run existing v1 checks and prepare the physical-device matrix from the outset.

## Checkpoint overview

| Checkpoint | Focus | Tickets |
| --- | --- | ---: |
| 1 | Establish architecture and release decisions | 3 |
| 2 | Preserve Local mode and prove native foundations | 13 |
| 3 | Build the developer platform and delivery foundations | 9 |
| 4 | Implement identity privacy and durable synchronization | 10 |
| 5 | Complete routes shared trips and invite journeys | 9 |
| 6 | Prove realtime convoy movement | 6 |
| 7 | Deliver crew communication and prove voice revocation | 6 |
| 8 | Complete social crews meetups and push | 5 |
| 9 | Harden offline behavior and evaluate proximity | 6 |
| 10 | Implement Plus and consented backup | 5 |
| 11 | Qualify devices security capacity and production controls | 5 |
| 12 | Retire legacy paths accept the candidate and activate production | 3 |

## Chronological ticket order

### Checkpoint 1 Establish architecture and release decisions

Set the owned-backend boundaries, record unresolved release policies, and reproduce/fix the existing ownership and ongoing-session risks before reusing telemetry.

| Order | Ticket | Work | Prerequisites |
| ---: | --- | --- | --- |
| 01 | [#27](https://github.com/Sammieblz/V3l0city/issues/27) `ARCH01` | Establish portable owned-backend modules and runtime boundaries | No blocking prerequisite |
| 02 | [#28](https://github.com/Sammieblz/V3l0city/issues/28) `PLAN01` | Record release decisions, supported devices and measurable acceptance budgets **Ongoing work** | No blocking prerequisite |
| 03 | [#29](https://github.com/Sammieblz/V3l0city/issues/29) `SEC01` | Prevent cross-device trip collisions and revoke ongoing telemetry sessions | No blocking prerequisite |

**Checkpoint evidence:** Architecture responsibilities and decision owners are recorded; the cross-owner regression and session-revocation tests have evidence. PLAN01 stays active while pilot measurements finalize budgets.

**Parallel work and early starts:** These three tickets can begin together. Run existing v1 tests and inspect physical-device access at the outset.

### Checkpoint 2 Preserve Local mode and prove native foundations

Separate personal recordings from shared sessions, formalize contracts/schema, preserve account-free recording and recovery, and prove actual native Mapbox capabilities. Establish the existing brand and scoped design guidance.

| Order | Ticket | Work | Prerequisites |
| ---: | --- | --- | --- |
| 04 | [#31](https://github.com/Sammieblz/V3l0city/issues/31) `PROD-CORE01` | Separate personal recordings from connected trip domains and ownership | [#27](https://github.com/Sammieblz/V3l0city/issues/27) |
| 05 | [#35](https://github.com/Sammieblz/V3l0city/issues/35) `PROD-CONTRACT01` | Version REST and WebSocket contracts with validation and generated docs | [#31](https://github.com/Sammieblz/V3l0city/issues/31), [#27](https://github.com/Sammieblz/V3l0city/issues/27) |
| 06 | [#30](https://github.com/Sammieblz/V3l0city/issues/30) `OPS03` | Add redacted observability, service health and actionable incident alerts **Ongoing work** | [#27](https://github.com/Sammieblz/V3l0city/issues/27) |
| 07 | [#32](https://github.com/Sammieblz/V3l0city/issues/32) `QA01` | Expand unit, component, property and mandatory C++ regressions **Ongoing work** | [#27](https://github.com/Sammieblz/V3l0city/issues/27) |
| 08 | [#33](https://github.com/Sammieblz/V3l0city/issues/33) `DOC01` | Keep developer, user and operations documentation aligned with v2 delivery **Ongoing work** | [#27](https://github.com/Sammieblz/V3l0city/issues/27) |
| 09 | [#36](https://github.com/Sammieblz/V3l0city/issues/36) `PROD-CORE02` | Complete account-free drive, durable personal recording and restart recovery | [#31](https://github.com/Sammieblz/V3l0city/issues/31) |
| 10 | [#37](https://github.com/Sammieblz/V3l0city/issues/37) `PROD-CORE04` | Expand SQLite schema, connected caches and safe local migrations | [#31](https://github.com/Sammieblz/V3l0city/issues/31) |
| 11 | [#38](https://github.com/Sammieblz/V3l0city/issues/38) `UI01` | Preserve and formalize V3l0city design tokens across native, maps, and web | [#27](https://github.com/Sammieblz/V3l0city/issues/27), [#31](https://github.com/Sammieblz/V3l0city/issues/31) |
| 12 | [#39](https://github.com/Sammieblz/V3l0city/issues/39) `DB01` | Introduce portable PostgreSQL schema, migrations and rollback compatibility | [#27](https://github.com/Sammieblz/V3l0city/issues/27), [#31](https://github.com/Sammieblz/V3l0city/issues/31), [#35](https://github.com/Sammieblz/V3l0city/issues/35) |
| 13 | [#34](https://github.com/Sammieblz/V3l0city/issues/34) `MAPSPIKE01` | Prove native Mapbox navigation, offline data and Expo integration feasibility | [#27](https://github.com/Sammieblz/V3l0city/issues/27), [#31](https://github.com/Sammieblz/V3l0city/issues/31), [#28](https://github.com/Sammieblz/V3l0city/issues/28) |
| 14 | [#40](https://github.com/Sammieblz/V3l0city/issues/40) `UI02` | Integrate supplied design skills with scoped Apple review and safe daisyUI adoption | [#38](https://github.com/Sammieblz/V3l0city/issues/38) |
| 15 | [#41](https://github.com/Sammieblz/V3l0city/issues/41) `PROD-CORE03` | Implement local vehicle identity, preferences and privacy defaults | [#31](https://github.com/Sammieblz/V3l0city/issues/31), [#37](https://github.com/Sammieblz/V3l0city/issues/37) |
| 16 | [#43](https://github.com/Sammieblz/V3l0city/issues/43) `UI05` | Preserve Drive HUD lifecycle, draft recovery, and native glance surfaces | [#38](https://github.com/Sammieblz/V3l0city/issues/38), [#31](https://github.com/Sammieblz/V3l0city/issues/31), [#36](https://github.com/Sammieblz/V3l0city/issues/36) |

**Checkpoint evidence:** Local start/save/restart/history/export remains usable without a backend. Domain authority, schema and versioned contracts are documented; native map/offline capability evidence supports later routing claims. Monitoring/tests/docs have working foundations.

**Parallel work and early starts:** Local persistence, map feasibility and brand work can run independently after domain seams exist. OPS03, QA01 and DOC01 begin here and expand with every feature; do not close their release-wide scope early.

### Checkpoint 3 Build the developer platform and delivery foundations

Prepare provider-neutral migration seams, owned Compose services, reusable authorization, real-store tests, local/LAN/remote profiles, backups, PR CI, signed variants and isolated staging.

| Order | Ticket | Work | Prerequisites |
| ---: | --- | --- | --- |
| 17 | [#44](https://github.com/Sammieblz/V3l0city/issues/44) `MIG01` | Decouple Supabase adapters and rehearse legacy identity/data migration | [#27](https://github.com/Sammieblz/V3l0city/issues/27), [#39](https://github.com/Sammieblz/V3l0city/issues/39) |
| 18 | [#45](https://github.com/Sammieblz/V3l0city/issues/45) `OPS01` | Containerize backend services and create reproducible Compose development profiles | [#27](https://github.com/Sammieblz/V3l0city/issues/27), [#39](https://github.com/Sammieblz/V3l0city/issues/39) |
| 19 | [#46](https://github.com/Sammieblz/V3l0city/issues/46) `SEC02` | Build reusable authorization, revocation and abuse-limit foundations | [#27](https://github.com/Sammieblz/V3l0city/issues/27), [#39](https://github.com/Sammieblz/V3l0city/issues/39) |
| 20 | [#48](https://github.com/Sammieblz/V3l0city/issues/48) `CICD01` | Add required pull-request CI across mobile, server, C++ and web **Ongoing work** | [#27](https://github.com/Sammieblz/V3l0city/issues/27), [#45](https://github.com/Sammieblz/V3l0city/issues/45) |
| 21 | [#49](https://github.com/Sammieblz/V3l0city/issues/49) `OPS02` | Make local, remote development, staging and production environments interchangeable | [#45](https://github.com/Sammieblz/V3l0city/issues/45), [#44](https://github.com/Sammieblz/V3l0city/issues/44) |
| 22 | [#50](https://github.com/Sammieblz/V3l0city/issues/50) `OPS04` | Automate off-host backups and prove clean-environment restore | [#39](https://github.com/Sammieblz/V3l0city/issues/39), [#45](https://github.com/Sammieblz/V3l0city/issues/45), [#30](https://github.com/Sammieblz/V3l0city/issues/30), [#28](https://github.com/Sammieblz/V3l0city/issues/28) |
| 23 | [#56](https://github.com/Sammieblz/V3l0city/issues/56) `CICD02` | Automate signed native builds and isolated staging/production variants | [#49](https://github.com/Sammieblz/V3l0city/issues/49), [#48](https://github.com/Sammieblz/V3l0city/issues/48) |
| 24 | [#57](https://github.com/Sammieblz/V3l0city/issues/57) `CICD03` | Deploy immutable staging artifacts with migrations and smoke tests | [#45](https://github.com/Sammieblz/V3l0city/issues/45), [#48](https://github.com/Sammieblz/V3l0city/issues/48), [#30](https://github.com/Sammieblz/V3l0city/issues/30) |
| 25 | [#53](https://github.com/Sammieblz/V3l0city/issues/53) `QA02` | Add real-store integration, authorization and protocol compatibility tests **Ongoing work** | [#39](https://github.com/Sammieblz/V3l0city/issues/39), [#46](https://github.com/Sammieblz/V3l0city/issues/46), [#45](https://github.com/Sammieblz/V3l0city/issues/45) |

**Checkpoint evidence:** A clean checkout boots healthy owned services and synthetic fixtures. Existing checks run in PR CI; local/remote environments are isolated; signed staging variants and a staging deploy/restore smoke are repeatable.

**Parallel work and early starts:** Container/authz/migration work can proceed together after schema foundations. Use fixture/stub journeys for the initial platform smoke, then extend to real connected journeys as product modules land.

### Checkpoint 4 Implement identity privacy and durable synchronization

Build verified owned identity, secure sessions and recovery, account isolation, privacy/retention rules, reliable acknowledgements and a durable outbox. Add feature navigation, driver/passenger restrictions and the basic buddy graph.

| Order | Ticket | Work | Prerequisites |
| ---: | --- | --- | --- |
| 26 | [#51](https://github.com/Sammieblz/V3l0city/issues/51) `PROD-AUTH01` | Build owned registration, verified email and portable delivery integration | [#31](https://github.com/Sammieblz/V3l0city/issues/31), [#35](https://github.com/Sammieblz/V3l0city/issues/35), [#39](https://github.com/Sammieblz/V3l0city/issues/39), [#44](https://github.com/Sammieblz/V3l0city/issues/44) |
| 27 | [#58](https://github.com/Sammieblz/V3l0city/issues/58) `PROD-AUTH02` | Implement secure refresh sessions, inventory and revocation across transports | [#51](https://github.com/Sammieblz/V3l0city/issues/51), [#35](https://github.com/Sammieblz/V3l0city/issues/35), [#37](https://github.com/Sammieblz/V3l0city/issues/37), [#29](https://github.com/Sammieblz/V3l0city/issues/29) |
| 28 | [#52](https://github.com/Sammieblz/V3l0city/issues/52) `PROD-PRIV01` | Define and implement sharing consent, retention and privacy state contracts | [#31](https://github.com/Sammieblz/V3l0city/issues/31), [#35](https://github.com/Sammieblz/V3l0city/issues/35), [#46](https://github.com/Sammieblz/V3l0city/issues/46) |
| 29 | [#54](https://github.com/Sammieblz/V3l0city/issues/54) `SYNC01` | Define sync authority and repair telemetry acknowledgements before rollout | [#27](https://github.com/Sammieblz/V3l0city/issues/27), [#39](https://github.com/Sammieblz/V3l0city/issues/39), [#44](https://github.com/Sammieblz/V3l0city/issues/44) |
| 30 | [#60](https://github.com/Sammieblz/V3l0city/issues/60) `PROD-SYNC01` | Build idempotent durable outbox push/pull and cursor synchronization | [#37](https://github.com/Sammieblz/V3l0city/issues/37), [#35](https://github.com/Sammieblz/V3l0city/issues/35), [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#54](https://github.com/Sammieblz/V3l0city/issues/54), [#39](https://github.com/Sammieblz/V3l0city/issues/39) |
| 31 | [#65](https://github.com/Sammieblz/V3l0city/issues/65) `PROD-AUTH03` | Add chosen-auth recovery, account deletion and user data export | [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#52](https://github.com/Sammieblz/V3l0city/issues/52), [#60](https://github.com/Sammieblz/V3l0city/issues/60) |
| 32 | [#61](https://github.com/Sammieblz/V3l0city/issues/61) `PROD-MEDIA01` | Add portable private avatar/crew-image storage and validated uploads | [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#52](https://github.com/Sammieblz/V3l0city/issues/52), [#35](https://github.com/Sammieblz/V3l0city/issues/35) |
| 33 | [#63](https://github.com/Sammieblz/V3l0city/issues/63) `UI03` | Establish native feature navigation and local/connected account gates | [#38](https://github.com/Sammieblz/V3l0city/issues/38), [#40](https://github.com/Sammieblz/V3l0city/issues/40), [#36](https://github.com/Sammieblz/V3l0city/issues/36), [#58](https://github.com/Sammieblz/V3l0city/issues/58) |
| 34 | [#64](https://github.com/Sammieblz/V3l0city/issues/64) `UI04` | Implement driver/passenger interaction modes and accessibility behavior | [#38](https://github.com/Sammieblz/V3l0city/issues/38), [#63](https://github.com/Sammieblz/V3l0city/issues/63), [#36](https://github.com/Sammieblz/V3l0city/issues/36) |
| 35 | [#66](https://github.com/Sammieblz/V3l0city/issues/66) `PROD-BUDDY01` | Implement Road Buddy request, acceptance, removal and identity views | [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#60](https://github.com/Sammieblz/V3l0city/issues/60), [#52](https://github.com/Sammieblz/V3l0city/issues/52) |

**Checkpoint evidence:** Two-account/two-device tests prove session revocation, safe local-record adoption, retry/idempotency and no private-history leakage. Recovery matches the chosen auth variant; inaccessible connected functions leave Local mode usable.

**Parallel work and early starts:** Prepare UI layouts and the mobile E2E harness earlier using local fixtures. Real authenticated mutations wait for the required auth/privacy/sync outputs. Adopt avatar/image storage according to the recorded optionality decision.

### Checkpoint 5 Complete routes shared trips and invite journeys

Implement the proven native map/routing contract, shared plans and ordered waypoints, lobby/invites/readiness, authoritative start/leave/end and summaries. Deliver secure native/web invite and account surfaces.

| Order | Ticket | Work | Prerequisites |
| ---: | --- | --- | --- |
| 36 | [#42](https://github.com/Sammieblz/V3l0city/issues/42) `PROD-MAP01` | Integrate cross-platform Mapbox map and V3l0city multiplayer visuals | [#31](https://github.com/Sammieblz/V3l0city/issues/31), [#36](https://github.com/Sammieblz/V3l0city/issues/36), [#34](https://github.com/Sammieblz/V3l0city/issues/34) |
| 37 | [#47](https://github.com/Sammieblz/V3l0city/issues/47) `PROD-MAP02` | Implement destination search, route preview and navigation capability contract | [#42](https://github.com/Sammieblz/V3l0city/issues/42), [#35](https://github.com/Sammieblz/V3l0city/issues/35) |
| 38 | [#68](https://github.com/Sammieblz/V3l0city/issues/68) `PROD-TRIP03` | Synchronize shared destinations, ordered waypoints and rally requests | [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#35](https://github.com/Sammieblz/V3l0city/issues/35), [#60](https://github.com/Sammieblz/V3l0city/issues/60), [#47](https://github.com/Sammieblz/V3l0city/issues/47) |
| 39 | [#69](https://github.com/Sammieblz/V3l0city/issues/69) `PROD-TRIP01` | Build shared trip creation, invite links/codes and ready lobby | [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#35](https://github.com/Sammieblz/V3l0city/issues/35), [#60](https://github.com/Sammieblz/V3l0city/issues/60), [#68](https://github.com/Sammieblz/V3l0city/issues/68) |
| 40 | [#74](https://github.com/Sammieblz/V3l0city/issues/74) `PROD-TRIP02` | Implement authoritative shared-trip lifecycle and automatic sharing termination | [#69](https://github.com/Sammieblz/V3l0city/issues/69), [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#52](https://github.com/Sammieblz/V3l0city/issues/52) |
| 41 | [#78](https://github.com/Sammieblz/V3l0city/issues/78) `PROD-TRIP04` | Finalize connected trip summaries with private local metrics | [#36](https://github.com/Sammieblz/V3l0city/issues/36), [#74](https://github.com/Sammieblz/V3l0city/issues/74), [#60](https://github.com/Sammieblz/V3l0city/issues/60), [#52](https://github.com/Sammieblz/V3l0city/issues/52) |
| 42 | [#80](https://github.com/Sammieblz/V3l0city/issues/80) `UI08` | Implement create/join lobby, invites, readiness, and shared-trip lifecycle screens | [#63](https://github.com/Sammieblz/V3l0city/issues/63), [#64](https://github.com/Sammieblz/V3l0city/issues/64), [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#74](https://github.com/Sammieblz/V3l0city/issues/74), [#69](https://github.com/Sammieblz/V3l0city/issues/69) |
| 43 | [#81](https://github.com/Sammieblz/V3l0city/issues/81) `UI12` | Create minimal web invite, account, support, and legal surfaces for v2 | [#38](https://github.com/Sammieblz/V3l0city/issues/38), [#40](https://github.com/Sammieblz/V3l0city/issues/40), [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#69](https://github.com/Sammieblz/V3l0city/issues/69), [#74](https://github.com/Sammieblz/V3l0city/issues/74) |
| 44 | [#88](https://github.com/Sammieblz/V3l0city/issues/88) `QA03` | Extend Playwright release coverage for the minimum supported web scope | [#44](https://github.com/Sammieblz/V3l0city/issues/44), [#48](https://github.com/Sammieblz/V3l0city/issues/48), [#81](https://github.com/Sammieblz/V3l0city/issues/81), [#58](https://github.com/Sammieblz/V3l0city/issues/58) |

**Checkpoint evidence:** A host and another iOS/Android member can join, ready, start, modify an authorized plan and finish. Ending/leaving stops sharing while a personal recording can continue. Invite expiry, races and explicit current-account join are covered.

**Parallel work and early starts:** Map/routing and lobby presentation can overlap after contracts are ready. Start route/offline screens under UI07 now; their complete download/offline acceptance closes at checkpoint 9.

### Checkpoint 6 Prove realtime convoy movement

Build the authenticated live gateway, Redis presence/GEO cleanup, marker state/interpolation, approximate convoy distance, adaptive native publishing and truthful multiplayer map presentation.

| Order | Ticket | Work | Prerequisites |
| ---: | --- | --- | --- |
| 45 | [#75](https://github.com/Sammieblz/V3l0city/issues/75) `PROD-LIVE01` | Build authenticated realtime gateway, bounded protocol and reconnect epochs | [#35](https://github.com/Sammieblz/V3l0city/issues/35), [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#69](https://github.com/Sammieblz/V3l0city/issues/69), [#52](https://github.com/Sammieblz/V3l0city/issues/52), [#74](https://github.com/Sammieblz/V3l0city/issues/74), [#46](https://github.com/Sammieblz/V3l0city/issues/46) |
| 46 | [#85](https://github.com/Sammieblz/V3l0city/issues/85) `PROD-LIVE02` | Implement Redis presence TTL, GEO cleanup and cross-instance snapshots | [#75](https://github.com/Sammieblz/V3l0city/issues/75) |
| 47 | [#90](https://github.com/Sammieblz/V3l0city/issues/90) `PROD-LIVE03` | Implement member marker state, interpolation and stale-roster model | [#42](https://github.com/Sammieblz/V3l0city/issues/42), [#85](https://github.com/Sammieblz/V3l0city/issues/85), [#37](https://github.com/Sammieblz/V3l0city/issues/37) |
| 48 | [#95](https://github.com/Sammieblz/V3l0city/issues/95) `PROD-LIVE04` | Compute approximate convoy ahead/behind and proximity distance safely | [#47](https://github.com/Sammieblz/V3l0city/issues/47), [#90](https://github.com/Sammieblz/V3l0city/issues/90), [#68](https://github.com/Sammieblz/V3l0city/issues/68) |
| 49 | [#91](https://github.com/Sammieblz/V3l0city/issues/91) `PROD-LIVE05` | Adapt location publishing to motion, background and connectivity state | [#36](https://github.com/Sammieblz/V3l0city/issues/36), [#85](https://github.com/Sammieblz/V3l0city/issues/85), [#58](https://github.com/Sammieblz/V3l0city/issues/58) |
| 50 | [#100](https://github.com/Sammieblz/V3l0city/issues/100) `UI06` | Implement the multiplayer map with truthful stale, quality, and privacy states | [#38](https://github.com/Sammieblz/V3l0city/issues/38), [#64](https://github.com/Sammieblz/V3l0city/issues/64), [#34](https://github.com/Sammieblz/V3l0city/issues/34), [#85](https://github.com/Sammieblz/V3l0city/issues/85), [#74](https://github.com/Sammieblz/V3l0city/issues/74), [#42](https://github.com/Sammieblz/V3l0city/issues/42), [#90](https://github.com/Sammieblz/V3l0city/issues/90), [#95](https://github.com/Sammieblz/V3l0city/issues/95) |

**Checkpoint evidence:** Five clients show authorized current/stale/disconnected states; end/removal/reconnect are enforced; current snapshots replace missed GPS replay. Capture native performance and location-quality evidence before prioritizing voice or billing.

**Parallel work and early starts:** Native publishing and marker presentation can develop alongside gateway/storage work once their own prerequisites are ready. Revisit driver/accessibility behavior throughout.

### Checkpoint 7 Deliver crew communication and prove voice revocation

Implement expiring preset reactions, durable chat and crew radio with least-privilege grants. Prove that saved self-hosted LiveKit tokens cannot restore unauthorized audio before shipping the radio.

| Order | Ticket | Work | Prerequisites |
| ---: | --- | --- | --- |
| 51 | [#84](https://github.com/Sammieblz/V3l0city/issues/84) `PROD-COM01` | Implement trip-safe preset reactions with expiry and motion interaction | [#75](https://github.com/Sammieblz/V3l0city/issues/75), [#52](https://github.com/Sammieblz/V3l0city/issues/52), [#60](https://github.com/Sammieblz/V3l0city/issues/60) |
| 52 | [#71](https://github.com/Sammieblz/V3l0city/issues/71) `PROD-COM02` | Build durable trip chat, system messages and offline delivery states | [#60](https://github.com/Sammieblz/V3l0city/issues/60), [#69](https://github.com/Sammieblz/V3l0city/issues/69), [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#52](https://github.com/Sammieblz/V3l0city/issues/52) |
| 53 | [#79](https://github.com/Sammieblz/V3l0city/issues/79) `PROD-VOICE01` | Implement LiveKit room policy and least-privilege token issuance | [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#69](https://github.com/Sammieblz/V3l0city/issues/69), [#52](https://github.com/Sammieblz/V3l0city/issues/52), [#35](https://github.com/Sammieblz/V3l0city/issues/35), [#74](https://github.com/Sammieblz/V3l0city/issues/74), [#46](https://github.com/Sammieblz/V3l0city/issues/46) |
| 54 | [#83](https://github.com/Sammieblz/V3l0city/issues/83) `PROD-VOICE04` | Prove self-hosted LiveKit immediate revocation against cached-token rejoin | [#79](https://github.com/Sammieblz/V3l0city/issues/79), [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#69](https://github.com/Sammieblz/V3l0city/issues/69) |
| 55 | [#92](https://github.com/Sammieblz/V3l0city/issues/92) `PROD-VOICE02` | Ship cross-platform crew radio, mute and Bluetooth audio recovery | [#79](https://github.com/Sammieblz/V3l0city/issues/79), [#83](https://github.com/Sammieblz/V3l0city/issues/83), [#74](https://github.com/Sammieblz/V3l0city/issues/74) |
| 56 | [#96](https://github.com/Sammieblz/V3l0city/issues/96) `UI09` | Implement preset reactions, radio, and trip chat presentation states | [#64](https://github.com/Sammieblz/V3l0city/issues/64), [#80](https://github.com/Sammieblz/V3l0city/issues/80), [#71](https://github.com/Sammieblz/V3l0city/issues/71), [#84](https://github.com/Sammieblz/V3l0city/issues/84), [#92](https://github.com/Sammieblz/V3l0city/issues/92) |

**Checkpoint evidence:** Radio/chat/reactions survive representative interruptions. Removed/ended/revoked users cannot rejoin with cached tokens under the agreed policy; PTT fails muted and help reactions clearly show delivery without implying emergency dispatch.

**Parallel work and early starts:** Chat and voice implementation are independent after their own prerequisites. Begin real iOS/Android/Bluetooth/helmet checks in QA06 here; full qualification is checkpoint 11.

### Checkpoint 8 Complete social crews meetups and push

Finish blocking/reporting/host removal across live and voice paths, crew roles/invites, timezone-aware meetup/RSVP/reminder/trip launch and administrative journeys.

| Order | Ticket | Work | Prerequisites |
| ---: | --- | --- | --- |
| 57 | [#89](https://github.com/Sammieblz/V3l0city/issues/89) `PROD-BUDDY02` | Enforce block, report and host removal through shared sessions | [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#52](https://github.com/Sammieblz/V3l0city/issues/52), [#74](https://github.com/Sammieblz/V3l0city/issues/74), [#83](https://github.com/Sammieblz/V3l0city/issues/83) |
| 58 | [#67](https://github.com/Sammieblz/V3l0city/issues/67) `PROD-CREW01` | Build persistent crews, invitations and role-based membership | [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#60](https://github.com/Sammieblz/V3l0city/issues/60), [#52](https://github.com/Sammieblz/V3l0city/issues/52) |
| 59 | [#73](https://github.com/Sammieblz/V3l0city/issues/73) `PROD-PUSH01` | Implement APNs/FCM device registration, invitations and scheduled reminders | [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#69](https://github.com/Sammieblz/V3l0city/issues/69), [#66](https://github.com/Sammieblz/V3l0city/issues/66), [#52](https://github.com/Sammieblz/V3l0city/issues/52) |
| 60 | [#76](https://github.com/Sammieblz/V3l0city/issues/76) `PROD-MEET01` | Implement timezone-aware meetups, RSVP, reminders and trip launch | [#67](https://github.com/Sammieblz/V3l0city/issues/67), [#69](https://github.com/Sammieblz/V3l0city/issues/69), [#73](https://github.com/Sammieblz/V3l0city/issues/73), [#60](https://github.com/Sammieblz/V3l0city/issues/60) |
| 61 | [#97](https://github.com/Sammieblz/V3l0city/issues/97) `UI10` | Build Road Buddies, vehicle, crew, meetup, and privacy administration journeys | [#63](https://github.com/Sammieblz/V3l0city/issues/63), [#64](https://github.com/Sammieblz/V3l0city/issues/64), [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#66](https://github.com/Sammieblz/V3l0city/issues/66), [#89](https://github.com/Sammieblz/V3l0city/issues/89), [#67](https://github.com/Sammieblz/V3l0city/issues/67), [#76](https://github.com/Sammieblz/V3l0city/issues/76), [#60](https://github.com/Sammieblz/V3l0city/issues/60), [#41](https://github.com/Sammieblz/V3l0city/issues/41), [#61](https://github.com/Sammieblz/V3l0city/issues/61), [#65](https://github.com/Sammieblz/V3l0city/issues/65) |

**Checkpoint evidence:** Roles, block/removal, time changes/cancelled reminders and duplicate launches have evidence. Crew membership never grants permanent location access; vehicle, recovery/deletion and optional image flows work through the same authority rules.

**Parallel work and early starts:** Crew administration and push delivery can run together after identity/buddy/trip foundations. Meetup implementation follows push and crew contracts.

### Checkpoint 9 Harden offline behavior and evaluate proximity

Implement the approved offline SDK capabilities and management UI, finish conflict/recovery behavior, qualify complete native E2E and fault journeys, and evaluate the optional trip-only proximity prototype.

| Order | Ticket | Work | Prerequisites |
| ---: | --- | --- | --- |
| 62 | [#55](https://github.com/Sammieblz/V3l0city/issues/55) `PROD-MAP03` | Implement approved offline region/corridor download and routing workflow | [#47](https://github.com/Sammieblz/V3l0city/issues/47), [#37](https://github.com/Sammieblz/V3l0city/issues/37) |
| 63 | [#77](https://github.com/Sammieblz/V3l0city/issues/77) `PROD-SYNC02` | Specify and implement conflict resolution, recovery ordering and cache invalidation | [#60](https://github.com/Sammieblz/V3l0city/issues/60), [#74](https://github.com/Sammieblz/V3l0city/issues/74), [#52](https://github.com/Sammieblz/V3l0city/issues/52) |
| 64 | [#70](https://github.com/Sammieblz/V3l0city/issues/70) `UI07` | Build route planning, shared waypoints, and offline-map preparation UX | [#38](https://github.com/Sammieblz/V3l0city/issues/38), [#64](https://github.com/Sammieblz/V3l0city/issues/64), [#34](https://github.com/Sammieblz/V3l0city/issues/34), [#47](https://github.com/Sammieblz/V3l0city/issues/47), [#68](https://github.com/Sammieblz/V3l0city/issues/68), [#60](https://github.com/Sammieblz/V3l0city/issues/60), [#55](https://github.com/Sammieblz/V3l0city/issues/55) |
| 65 | [#98](https://github.com/Sammieblz/V3l0city/issues/98) `QA04` | Establish mobile e2e harness and two-device shared-trip journeys **Ongoing work** | [#49](https://github.com/Sammieblz/V3l0city/issues/49), [#56](https://github.com/Sammieblz/V3l0city/issues/56), [#80](https://github.com/Sammieblz/V3l0city/issues/80), [#74](https://github.com/Sammieblz/V3l0city/issues/74), [#84](https://github.com/Sammieblz/V3l0city/issues/84), [#71](https://github.com/Sammieblz/V3l0city/issues/71), [#96](https://github.com/Sammieblz/V3l0city/issues/96) |
| 66 | [#102](https://github.com/Sammieblz/V3l0city/issues/102) `QA05` | Exercise offline, handover and independent service failure matrix | [#54](https://github.com/Sammieblz/V3l0city/issues/54), [#53](https://github.com/Sammieblz/V3l0city/issues/53), [#98](https://github.com/Sammieblz/V3l0city/issues/98), [#77](https://github.com/Sammieblz/V3l0city/issues/77), [#55](https://github.com/Sammieblz/V3l0city/issues/55), [#91](https://github.com/Sammieblz/V3l0city/issues/91) |
| 67 | [#101](https://github.com/Sammieblz/V3l0city/issues/101) `PROD-VOICE03` | Prototype experimental proximity radio and record a ship-or-disable decision | [#92](https://github.com/Sammieblz/V3l0city/issues/92), [#95](https://github.com/Sammieblz/V3l0city/issues/95), [#85](https://github.com/Sammieblz/V3l0city/issues/85) |

**Checkpoint evidence:** Interrupted downloads, missing coverage, dead zones, process death, account/role changes and independent service outages preserve Local data and honest connected state. Proximity has an explicit ship-or-disable disposition; disabled is acceptable when evidence is insufficient.

**Parallel work and early starts:** The native E2E scaffold starts much earlier; QA04 closes only after its full journey dependencies pass. Prototype proximity can run independently here and must consume later quality measurements before final enablement.

### Checkpoint 10 Implement Plus and consented backup

Add sandbox purchase/restore and authoritative entitlements, configurable limits/grace, consented personal-summary backup/restore, cosmetics/crew policies and Plus presentation after core shared-state proof.

| Order | Ticket | Work | Prerequisites |
| ---: | --- | --- | --- |
| 68 | [#62](https://github.com/Sammieblz/V3l0city/issues/62) `PROD-PLUS01` | Integrate RevenueCat purchases, restore and authoritative webhook entitlements | [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#35](https://github.com/Sammieblz/V3l0city/issues/35), [#37](https://github.com/Sammieblz/V3l0city/issues/37), [#39](https://github.com/Sammieblz/V3l0city/issues/39) |
| 69 | [#72](https://github.com/Sammieblz/V3l0city/issues/72) `PROD-PLUS02` | Enforce configurable free/Plus caps and graceful entitlement transitions | [#62](https://github.com/Sammieblz/V3l0city/issues/62), [#69](https://github.com/Sammieblz/V3l0city/issues/69), [#67](https://github.com/Sammieblz/V3l0city/issues/67) |
| 70 | [#86](https://github.com/Sammieblz/V3l0city/issues/86) `PROD-PLUS03` | Build consented personal-summary cloud backup and cross-device restore | [#62](https://github.com/Sammieblz/V3l0city/issues/62), [#77](https://github.com/Sammieblz/V3l0city/issues/77), [#78](https://github.com/Sammieblz/V3l0city/issues/78), [#61](https://github.com/Sammieblz/V3l0city/issues/61), [#52](https://github.com/Sammieblz/V3l0city/issues/52) |
| 71 | [#87](https://github.com/Sammieblz/V3l0city/issues/87) `PROD-PLUS04` | Implement premium cosmetic customization and enhanced crew/history policies | [#72](https://github.com/Sammieblz/V3l0city/issues/72), [#67](https://github.com/Sammieblz/V3l0city/issues/67), [#71](https://github.com/Sammieblz/V3l0city/issues/71), [#78](https://github.com/Sammieblz/V3l0city/issues/78), [#42](https://github.com/Sammieblz/V3l0city/issues/42), [#61](https://github.com/Sammieblz/V3l0city/issues/61) |
| 72 | [#93](https://github.com/Sammieblz/V3l0city/issues/93) `UI11` | Implement V3l0city+ entitlement, backup, restore, and limit UX | [#63](https://github.com/Sammieblz/V3l0city/issues/63), [#64](https://github.com/Sammieblz/V3l0city/issues/64), [#62](https://github.com/Sammieblz/V3l0city/issues/62), [#86](https://github.com/Sammieblz/V3l0city/issues/86), [#60](https://github.com/Sammieblz/V3l0city/issues/60), [#72](https://github.com/Sammieblz/V3l0city/issues/72), [#87](https://github.com/Sammieblz/V3l0city/issues/87) |

**Checkpoint evidence:** Both store sandboxes, webhook duplicates/order/security, expiry/refund/grace, over-cap policy and cross-device restore have evidence. Local data/export and active-trip essential controls survive entitlement changes.

**Parallel work and early starts:** Billing, cosmetics and restore interfaces can be prepared earlier, but premium implementation must not delay the core trip/map proof. Choose caps/prices explicitly rather than adopting PDF examples.

### Checkpoint 11 Qualify devices security capacity and production controls

Finish headset/audio security, load/frame/battery/thermal/cost measurements, controlled vehicle/device testing, full privacy/export/deletion security and staging promotion/rollback/kill-switch rehearsals.

| Order | Ticket | Work | Prerequisites |
| ---: | --- | --- | --- |
| 73 | [#99](https://github.com/Sammieblz/V3l0city/issues/99) `QA06` | Qualify LiveKit room security, headset routing and interruption recovery **Ongoing work** | [#46](https://github.com/Sammieblz/V3l0city/issues/46), [#49](https://github.com/Sammieblz/V3l0city/issues/49), [#56](https://github.com/Sammieblz/V3l0city/issues/56), [#92](https://github.com/Sammieblz/V3l0city/issues/92), [#83](https://github.com/Sammieblz/V3l0city/issues/83), [#96](https://github.com/Sammieblz/V3l0city/issues/96) |
| 74 | [#103](https://github.com/Sammieblz/V3l0city/issues/103) `QA07` | Benchmark scale, frame pacing, battery, thermal load and provider cost | [#30](https://github.com/Sammieblz/V3l0city/issues/30), [#53](https://github.com/Sammieblz/V3l0city/issues/53), [#99](https://github.com/Sammieblz/V3l0city/issues/99), [#95](https://github.com/Sammieblz/V3l0city/issues/95), [#72](https://github.com/Sammieblz/V3l0city/issues/72), [#28](https://github.com/Sammieblz/V3l0city/issues/28) |
| 75 | [#104](https://github.com/Sammieblz/V3l0city/issues/104) `QA08` | Execute physical-device, controlled convoy and driver-UX qualification **Ongoing work** | [#56](https://github.com/Sammieblz/V3l0city/issues/56), [#98](https://github.com/Sammieblz/V3l0city/issues/98), [#102](https://github.com/Sammieblz/V3l0city/issues/102), [#99](https://github.com/Sammieblz/V3l0city/issues/99), [#103](https://github.com/Sammieblz/V3l0city/issues/103) |
| 76 | [#94](https://github.com/Sammieblz/V3l0city/issues/94) `SEC03` | Complete threat model and prove consent, export and deletion across stores | [#46](https://github.com/Sammieblz/V3l0city/issues/46), [#50](https://github.com/Sammieblz/V3l0city/issues/50), [#65](https://github.com/Sammieblz/V3l0city/issues/65), [#52](https://github.com/Sammieblz/V3l0city/issues/52), [#61](https://github.com/Sammieblz/V3l0city/issues/61), [#89](https://github.com/Sammieblz/V3l0city/issues/89), [#83](https://github.com/Sammieblz/V3l0city/issues/83), [#74](https://github.com/Sammieblz/V3l0city/issues/74), [#67](https://github.com/Sammieblz/V3l0city/issues/67), [#62](https://github.com/Sammieblz/V3l0city/issues/62), [#86](https://github.com/Sammieblz/V3l0city/issues/86), [#71](https://github.com/Sammieblz/V3l0city/issues/71) |
| 77 | [#59](https://github.com/Sammieblz/V3l0city/issues/59) `CICD05` | Prepare and rehearse production promotion, rollback and feature switches in staging **Ongoing work** | [#56](https://github.com/Sammieblz/V3l0city/issues/56), [#57](https://github.com/Sammieblz/V3l0city/issues/57), [#30](https://github.com/Sammieblz/V3l0city/issues/30), [#50](https://github.com/Sammieblz/V3l0city/issues/50) |

**Checkpoint evidence:** The supported device matrix, two-car/five-vehicle/dead-zone routes, required headset and 1/3/6-hour measurements link evidence. Quantitative release budgets are evaluated; a restored environment, compatible rollback and feature switches are rehearsed.

**Parallel work and early starts:** Audio/security/release controls can run independently when their prerequisites are ready. QA07 follows voice qualification; QA08 follows E2E/fault/audio/performance evidence. Rehearse production controls in staging before candidate acceptance.

### Checkpoint 12 Retire legacy paths accept the candidate and activate production

Perform final provider retirement only after integrated parity evidence, assemble the complete release candidate, and then execute the separately authorized production rollout using accepted immutable artifacts.

| Order | Ticket | Work | Prerequisites |
| ---: | --- | --- | --- |
| 78 | [#82](https://github.com/Sammieblz/V3l0city/issues/82) `PROD-MIG01` | Retire Supabase paths after owned-backend feature and data parity | [#51](https://github.com/Sammieblz/V3l0city/issues/51), [#58](https://github.com/Sammieblz/V3l0city/issues/58), [#66](https://github.com/Sammieblz/V3l0city/issues/66), [#67](https://github.com/Sammieblz/V3l0city/issues/67), [#76](https://github.com/Sammieblz/V3l0city/issues/76), [#74](https://github.com/Sammieblz/V3l0city/issues/74), [#71](https://github.com/Sammieblz/V3l0city/issues/71), [#60](https://github.com/Sammieblz/V3l0city/issues/60), [#44](https://github.com/Sammieblz/V3l0city/issues/44), [#65](https://github.com/Sammieblz/V3l0city/issues/65), [#62](https://github.com/Sammieblz/V3l0city/issues/62) |
| 79 | [#105](https://github.com/Sammieblz/V3l0city/issues/105) `REL01` | Run v2.0.0 release-candidate acceptance and assemble evidence pack | All work #27-104 with required acceptance evidence; proximity may be explicitly disabled |
| 80 | [#106](https://github.com/Sammieblz/V3l0city/issues/106) `CICD04` | Activate production from the accepted staging-tested release candidate | [#56](https://github.com/Sammieblz/V3l0city/issues/56), [#57](https://github.com/Sammieblz/V3l0city/issues/57), [#30](https://github.com/Sammieblz/V3l0city/issues/30), [#50](https://github.com/Sammieblz/V3l0city/issues/50), [#105](https://github.com/Sammieblz/V3l0city/issues/105), [#59](https://github.com/Sammieblz/V3l0city/issues/59) |

**Checkpoint evidence:** Final cutover is recoverable and owned local/connected paths need no Supabase. REL01 consumes all included requirements and conditional experiment disposition. Production activation uses that candidate and the rehearsed controls, with post-deploy results recorded.

**Parallel work and early starts:** Keep migration inventory/rehearsal active from MIG01; final retirement occurs here. REL01 and CICD04 are sequential gates, not parallel tasks.

## Tickets that continue across checkpoints

These are primary entries in the numbered order, but their full release scope continues into later checkpoints. An early handoff is not final ticket closure.

| Ticket | Begin | Finish full acceptance | What continues |
| --- | --- | --- | --- |
| [#28](https://github.com/Sammieblz/V3l0city/issues/28) `PLAN01` | Checkpoint 1 | Before affected policy/budget gates and final candidate acceptance | Initialize decisions/owners now; incorporate native/provider proofs and pilot measurements before closing final release policies. |
| [#30](https://github.com/Sammieblz/V3l0city/issues/30) `OPS03` | Checkpoint 2 | Checkpoint 11 and candidate evidence | Add health/redacted logs first, then metrics/alerts for each new service; qualify incident behavior on the complete system. |
| [#32](https://github.com/Sammieblz/V3l0city/issues/32) `QA01` | Baseline checks immediately; ticket foundation in checkpoint 2 | Checkpoint 11 and candidate evidence | Existing Jest/C++ checks run from the outset. Add each feature's meaningful unit/component/property regressions in its implementation PR. |
| [#33](https://github.com/Sammieblz/V3l0city/issues/33) `DOC01` | Checkpoint 2 | Checkpoint 12 candidate review | Update contracts, developer/user/operator docs with every change; final runbooks and known limits must match the candidate. |
| [#53](https://github.com/Sammieblz/V3l0city/issues/53) `QA02` | Checkpoint 3 | Checkpoint 11 | Establish real-store/authz fixtures early; extend integration/protocol coverage as domain modules land. |
| [#48](https://github.com/Sammieblz/V3l0city/issues/48) `CICD01` | Current v1 checks immediately; owned-container gates in checkpoint 3 | Extend through all implementation checkpoints | Do not postpone basic PR checks until product completion; add native/web/server/container suites as prerequisites become available. |
| [#98](https://github.com/Sammieblz/V3l0city/issues/98) `QA04` | Harness decision/local smoke in checkpoints 2 to 4 | Checkpoint 9 | Complete two-device shared/reaction/chat/recovery evidence needs later UI09 and connected modules. |
| [#99](https://github.com/Sammieblz/V3l0city/issues/99) `QA06` | Native audio/security proofs in checkpoint 7 | Checkpoint 11 | Test real phones/headsets as soon as radio exists; repeat required final audio/network/revocation qualification. |
| [#104](https://github.com/Sammieblz/V3l0city/issues/104) `QA08` | Device access and controlled-route preparation in checkpoint 1 | Checkpoint 11 | Reserve older/current iOS/Android phones, cars, headset and dead-zone route early; execute release matrix after prerequisite evidence. |
| [#59](https://github.com/Sammieblz/V3l0city/issues/59) `CICD05` | Plan controls with checkpoint 3 staging setup | Checkpoint 11 before REL01 | Prepare promotion/abort/rollback/switch mechanisms early; final production-like staging rehearsal uses complete candidate capabilities. |

## The final release sequence

1. Finish full feature, privacy, offline, billing, device and operations evidence. Rehearse promotion, rollback and feature switches in [#59 CICD05](https://github.com/Sammieblz/V3l0city/issues/59).
2. Retire the remaining Supabase runtime paths in [#82 PROD-MIG01](https://github.com/Sammieblz/V3l0city/issues/82) only after integrated owned-backend parity and recoverable cutover evidence.
3. Accept the exact release candidate in [#105 REL01](https://github.com/Sammieblz/V3l0city/issues/105). Every earlier included work item must have its required evidence. [#101 PROD-VOICE03](https://github.com/Sammieblz/V3l0city/issues/101) can close with a documented disabled experiment; successful proximity shipment is not required.
4. Activate production through [#106 CICD04](https://github.com/Sammieblz/V3l0city/issues/106) after candidate acceptance and the required release authorization. Use the staging-tested immutable artifacts and rehearsed abort controls.

## Scope and maintenance

The confirmed v2.0.0 boundary includes the complete Local, Connected and Plus scope. CarPlay/Android Auto, peer networking, public stranger discovery, replay and all other source-deferred candidates remain in [future backlog #107](https://github.com/Sammieblz/V3l0city/issues/107). The PDF document revision and its future V2 label do not change this release boundary.

Keep V3l0city colors, typography, native movement and personal SQLite data throughout. Product tickets own service/state/SDK behavior; UI tickets consume it for screens and interaction. Preserve meaningful tests and docs with each change. Adjust this guide when a recorded dependency or scope decision changes.

Source register: [backlog.json](https://github.com/Sammieblz/V3l0city/blob/docs/v2.0.0-planning/docs/planning/v2.0.0/backlog.json). Detailed rationale: [analysis.md](https://github.com/Sammieblz/V3l0city/blob/docs/v2.0.0-planning/docs/planning/v2.0.0/analysis.md).

Sequence validation: all 80 unique work tickets appear exactly once in the numbered register; every recorded prerequisite precedes its dependent. No dates or staffing estimates were fabricated.
