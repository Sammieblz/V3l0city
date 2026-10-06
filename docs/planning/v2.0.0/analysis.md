# V3l0city v2.0.0: scope, architecture, delivery and release analysis

Planning baseline: October 5, 2026. Repository: `Sammieblz/V3l0city`.

The complete included scope of **V3l0city_MVP_Full_Scope.pdf** is the product scope for **v2.0.0**. That includes Local, Connected and V3l0city+, together with the backend, offline behavior, privacy, operations and field evidence required to make those features dependable. The planning work also includes the requested staging and production pipelines, containerization, local and remote development backends, unit/integration/E2E testing, physical devices, edge cases, and maintained documentation.

The plan preserves the existing native movement engine, local trip storage and V3l0city visual identity. It evolves the current server into an owned portable backend and removes Supabase from the critical path after equivalent behavior is verified. The cloud host remains undecided. Sequencing the work into phases changes the order of delivery; it does not remove any included product scope.

The [v2.0.0 release tracker](https://github.com/Sammieblz/V3l0city/issues/8) is the entry point for the linked implementation backlog. The published plan contains 100 actual GitHub issues: this tracker, 18 epics, 80 v2.0.0 leaf issues and one future-scope index. The v2.0.0 leaf work is numbered 27–106; the separate future index is 107. This report explains the requirements, evidence, architectural choices and release conditions behind that backlog.

## 1. Evidence, confidence and release boundaries

All 30 PDF pages were read, extracted with pypdf, rendered with PyMuPDF and reviewed in contact sheets. Page 30 contains empty build-checklist boxes. Those boxes define work to verify; they do not show that any feature is complete.

The repository audit used two immutable snapshots:

| Snapshot | Role in this analysis |
|---|---|
| [dev: `5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd`](https://github.com/Sammieblz/V3l0city/tree/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd) | Main planning baseline because it contains the supplied daisyUI skill and the IDE-referenced guides. |
| [master: `e45fb2e222d007f4e5847c79f640fbd268ddb452`](https://github.com/Sammieblz/V3l0city/tree/e45fb2e222d007f4e5847c79f640fbd268ddb452) | Default-branch baseline recorded separately for release and migration planning. |

The complete Git trees were compared. Existing application files have identical blob hashes between these snapshots; dev adds the daisyUI skill files and `skills-lock.json`. This establishes the committed baseline. It does not establish the user's current local checkout, uncommitted changes, installed dependencies, running services or deployed production state.

Tests, configuration and source code were inspected. The audit did **not** run application tests, compile native binaries, execute exploits, query production data, inspect physical devices, or certify driver usability. Findings below distinguish code-path evidence from outcomes that still require execution.

The PDF identifies itself as document Version 1.0 and lists later “V2” candidates. The user has confirmed that the requested release is **v2.0.0 with the full included MVP scope**. Therefore:

| Classification | v2.0.0 treatment |
|---|---|
| Included Local/Connected/Plus capabilities | Implementation and acceptance requirements. |
| Supporting security/offline/quality/operations requirements | Required release work, not optional cleanup. |
| Experimental proximity radio | Explicitly tracked beta capability with feasibility, security and launch gates. |
| Optional source features | Tracked with a decision outcome; not silently advertised as complete. |
| Explicitly deferred features and “future V2” candidates | Separate future backlog; the requested version number does not automatically pull them into this release. |
| New user requirements for stage/prod, containers, cloud development, E2E and docs | Added delivery requirements alongside the PDF. |

Examples in the document are not decided business policies. Its suggested free limit of eight participants, example presence TTL of 15–30 seconds, potential storage providers and low-cost VPS arrangement remain examples. No subscription price, hosting budget, exact free/paid cap, production cloud host, battery allowance or recovery SLO has been invented here.

## 2. Product purpose and complete included scope

The product is a deliberately joined multiplayer journey: a group plans a trip, joins a shared session, sees one another, communicates, regroups and finishes through intermittent connectivity. An individual can still use V3l0city without an account or server.

That is a coherent boundary. The source separates it from a public stranger map, general social network, racing game, proprietary map provider or fleet platform. Those exclusions help keep feature behavior understandable. They do not diminish the included social, crew, meetup, voice or subscription scope.

The first production architecture is intended for groups of 2–20 participants, with controlled testing up to 50. These are workload assumptions from PDF page 4, not automatically the final free and paid limits. Capacity, billing eligibility and experimentally tested envelope must be distinct configuration concepts.

### 2.1 Local V3l0city

The account-free experience includes:

- Drive HUD with speed, heading, distance, trip status and understandable signal/position confidence, using the existing native C++ engine.
- Personal recording: start, pause/continue where supported, stop/save, durable samples and summaries, local history, draft recovery and local export.
- Map with own position/heading, route overlay, destination selection and optional waypoints, route preview and ETA/distance where supported.
- Downloaded or cached supported offline regions/corridors, with visible readiness, storage management and removal.
- Local vehicle nickname, type, optional make/model and marker/avatar choice.
- Theme and units, sharing defaults, analytics opt-out, history retention, and driver/passenger preferences.
- First launch without registration. Location/units setup and optional profile come before driving; connected signup is requested at the point of connected use.

The local guarantee is stronger than “the screen opens offline.” Recording, finalization, history and export must remain useful when auth, API, PostgreSQL, Redis, LiveKit, billing or map-provider connectivity fails. Previously downloaded supported data must remain available. First-launch offline, missing map data and denied permissions need truthful degraded behavior rather than fabricated capabilities.

### 2.2 Connected V3l0city

The included connected experience comprises:

- Owned account identity, verified authentication, profiles and cloud-visible vehicle choices.
- Road Buddy request/accept/remove relationships, blocking and reporting.
- Trip creation for now or a scheduled time, title/settings, destination/waypoints, share link and short join code.
- Join/leave, ready state, host role and roster, selected vehicle/avatar, authoritative start/end lifecycle.
- Synchronized shared route and ordered waypoints, host updates and authorized rally requests.
- Live member map with vehicle markers, approximate distance/ahead-behind information, last update age and stale/disconnected states.
- Fuel, food, meetup, regroup, destination and custom points, plus parking/mechanical icon categories identified by the map requirements.
- Preset Thanks, Wait, Fuel, Food, Regroup, All good and Need help reactions.
- Trip-wide crew radio through LiveKit, practical mute/PTT, participant-local mute and authorized host removal.
- Experimental trip-only proximity radio with an explicit feature gate.
- Trip-scoped durable text chat, local cache, queued/sent/failed states, system events and duplicate-free reconciliation.
- Crews with owner/admin/member roles, membership, invitations, name/image/description and administration.
- Scheduled meetups with location, date/time, description, RSVP and associated/launchable trip.
- Push for invitations, buddy requests, reminders and important connected events.
- Durable trip-end metadata and summary: participants, duration, route summary and permitted local metrics.

Location sharing is an intentional active-trip action. Being buddies or belonging to the same crew is not permanent tracking permission. A trip ending, a member leaving, removal, a privacy change or the applicable block policy must stop future sharing and contact. Historical personal routes are local/private by default.

### 2.3 V3l0city+

The paid layer includes personal-summary cloud backup, eligible cross-device restore/history, configurable larger groups, premium crew member/admin scale, branding and event retention, cosmetic markers/icons/avatars, and longer hosted connected summary/chat history where policy permits.

RevenueCat is the purchase/entitlement integration baseline, while the owned backend authorizes server capabilities. The client can cache status briefly for offline presentation, but a client flag must never grant premium capacity or cloud access. Raw high-frequency sensor history can remain local; it is not a default cloud-upload requirement.

The following must remain usable without payment: core safety states, blocking/reporting, help reaction, route access necessary to finish an active trip, the user's own local data and local export. Expiry is not permission to delete personal history. Grace, refunds, pending purchases, restore, provider outages, over-cap crews and expiry during an active journey all need explicit behavior.

## 3. What already exists and what needs implementation

The current repository provides useful foundations, but it is not the completed multiplayer release.

| Surface | Verified committed baseline | Planning consequence |
|---|---|---|
| Native app | Expo 54, React Native 0.81.5, React 19.1, Expo Router, Paper and Reanimated; committed iOS/Android projects | Preserve the existing stack and custom engine. Native builds are required; Expo Go cannot validate this native module. |
| Native navigation | A single application route; a 2,164-line speedometer component owns dashboard, onboarding/settings, internal screens and trip lifecycle | Extract feature navigation/presentation from active-trip services before adding all multiplayer screens. |
| Local persistence | Expo SQLite, preferences, recordings/samples, drafts, recovery, tombstones and a sync-operation queue | Extend these mechanisms with versioned migrations and account-scoped caches instead of introducing a competing local trip store. |
| Native movement | C++, Swift/Objective-C++, Kotlin/JNI engine and live-drive/background surfaces | Map, radio and background work must coexist with this lifecycle and its platform constraints. |
| Existing server | Fastify 5, WebSocket/Zod, better-sqlite3 telemetry store, device tokens and batch handling | Reuse appropriate code, but add owned identity, PostgreSQL, memberships, live-state separation and deployable packaging. |
| Current connected layer | Provider-neutral mobile interfaces but direct construction of Supabase implementations; direct Supabase usage on web; Edge Functions and migrations | Portability is partial. Migration spans mobile, web, identity, functions, schema, storage and docs. |
| Web | Independent Next.js App Router app, handwritten CSS, Framer Motion, browser Dexie/IndexedDB | Browser capability is separate from native. Web is not the native app and must not promise native background behavior. |
| Maps/voice | No Mapbox or LiveKit runtime dependency/implementation was verified in the audited manifests | These are implementation and native-feasibility tasks, not configuration of already finished integrations. |
| Delivery | No committed GitHub workflows, Dockerfiles, Compose or mobile E2E configuration in either audited tree | CI/CD and portable environments require actual implementation and rehearsal. |
| Car surfaces | Existing widgets/Live Activity/Android active-trip notification; dormant CarPlay/Android Auto proof of concept excluded from v1 production | Preserve existing supported surfaces. Do not treat the POC as approved production vehicle support. |

Sources: [native manifest](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/package.json), [application entry](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/app/index.tsx), [speedometer implementation](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/src/components/speedometer.tsx), [local trip repository](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/src/database/tripRepository.ts), [cloud service](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/src/cloud/cloudService.ts), [server](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/server/src/app.ts), [web manifest](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/web/package.json), [documented car boundaries](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/docs/developer/widgets-and-car-surfaces.md).

### 3.1 Existing code-path findings that should be closed early

**Trip-ID ownership collision.** The telemetry store uses caller-controlled `clientTripId` as a global trip key. Its conflict path updates metadata without checking the device owner and subsequently creates a live session token. HTTP get/update paths check ownership, but the live socket checks trip ID and session token. A different registered device requesting an existing trip ID can therefore reach a path that issues a token for that ID. This is source evidence, not a reproduced exploit. First add a two-device adversarial regression; then enforce owner-scoped idempotency and refuse cross-owner collisions before issuing grants. [Store code](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/server/src/store.ts#L156-L194), [live endpoint](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/server/src/app.ts#L166-L226).

**Authorization only at socket opening.** The current endpoint checks the live session once, then accepts subsequent messages without rechecking expiry, revocation or terminal-trip state. v2 must revoke ongoing subscriptions, not only deny new sockets. The same policy needs to cover voice separately. [WebSocket handler](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/server/src/app.ts#L166-L226).

**Acknowledgement watermark ambiguity.** The hello path echoes a client-supplied sequence; batch acknowledgement uses the highest sequence rather than a verified contiguous server watermark. The client marks samples through that acknowledgement uploaded. Missing or reordered batches can therefore be misrepresented unless the contract defines per-event receipts or verified contiguous progress. Test lost acknowledgements, gaps, reordered batches and changed payloads for a reused idempotency key before carrying these semantics into v2. [Server contract behavior](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/server/src/app.ts), [telemetry client](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/src/api/tripTelemetryService.ts).

**In-memory retry lifecycle.** The telemetry service establishes its active object only after successful remote start, caps reconnect attempts, attempts completion upload when active, then clears state. SQLite provides pending mechanisms, but this service is not itself a durable post-restart retry worker. Offline start/end, recovered drafts and process death need a system-level retry design. [Telemetry service](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/src/api/tripTelemetryService.ts).

**Account and entitlement adoption.** The existing cloud service scans local unsynced recordings and restores missing rows using v1 assumptions. v2 must decide which account owns which local records, which records are backed up by consent, and which connected facts sync regardless of Plus. Signing another person into the same phone must not upload the previous user's private history. [Cloud service](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/src/cloud/cloudService.ts).

These findings justify targeted repairs and regression tests. They do not justify discarding the entire server or replacing the local engine.

## 4. Architecture and local/cloud portability

### 4.1 Define authority per entity

The PDF's “truth” slogan is useful if its ownership boundaries are made explicit.

| Data or behavior | Authority | Other representations |
|---|---|---|
| Personal recordings, native samples, preferences and local vehicle | Device SQLite/native services | Optional consented eligible backup; never an automatic raw location archive. |
| Account, buddy/block graph, crew roles, trip plan/membership, durable chat and entitlement state | Owned backend/PostgreSQL | SQLite replicas with versions; caches cannot grant permissions. |
| Current accepted location and presence | Authenticated live gateway/short-lived Redis state | Bounded last-known device snapshot with honest age; not generic durable sync. |
| Voice transport | LiveKit | Owned backend controls admission/role policy; audio is not replayed from an offline queue. |
| Map/routing/offline data | Selected Mapbox SDK capability | App metadata tracks downloads; SDK manages actual map/routing assets. |
| Cloud-backed personal history | User consent plus owned backup service | Versioned portable artifacts and restore merge rules. |

A personal recording and a shared trip session are different domain objects. A host can end the shared session while a member keeps driving and locally recording. Leaving a shared session must stop location/media sharing without destroying the member's personal recording.

The native location pipeline also needs an early audit. Map and WebSocket features require coordinates, accepted timestamps, accuracy and sampling lifecycle, not only speed/heading. Verify what the existing hook/module exposes before adding another independent location listener. The background durability proof must establish what is persisted when JavaScript is suspended, rather than relying on a foreground callback that may stop. [Sensor hook](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/src/hooks/useVelocitySensors.ts), [engine module](https://github.com/Sammieblz/V3l0city/tree/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/modules/v3l0city-speed-engine).

### 4.2 Owned services

Start with a modular Fastify/TypeScript backend, shared contract package, PostgreSQL migration runner, realtime gateway and background worker. The API/gateway/worker can initially share a repository and much of a runtime without prematurely becoming independent microservices. Separate deployment boundaries when operational evidence justifies them.

PostgreSQL stores durable facts and enforces ownership/uniqueness/version constraints. Redis stores ephemeral presence, appropriate rate-limit state and cross-instance fanout. Redis loss must not create membership or erase durable operations. Keep real authorization tied to durable current membership and bounded validated leases, particularly during outages.

Use typed adapters for email, maps/routing, push, object storage, billing and diagnostics. This makes configuration and tests portable; it does not make each provider interchangeable without migration work. External Mapbox, RevenueCat and APNs/FCM remain platform dependencies under the selected baseline. “No Supabase” means the application backend is owned, not that all external services disappear.

Authentication remains application-controlled. Choose the email/password or magic-link experience deliberately, with a maintained self-hostable/OIDC-compatible implementation where appropriate. Do not invent password cryptography. If passwords are used, preserve the PDF's memory-hard hashing requirement. Implement verification, recovery, short access tokens, refresh rotation/replay handling, secure native storage, revocable device/session inventory, logout-all, account export and deletion.

The source endpoint list is representative. It does not by itself implement reset, unblock, session inventory, deletion, report review or all mutation policies. Those are explicit backend slices with tests and docs.

### 4.3 Supabase migration

Inventory every dependency: native adapters and construction sites, web client/server auth, Edge Functions, SQL tied to `auth.users`/`auth.uid()`/extension schemas, storage, subscriptions/account mappings, deletion, environment variables and developer instructions.

Ordinary PostgreSQL cannot simply replay SQL that depends on Supabase identity and authorization functions. Create owned identity foreign keys, equivalent application authorization and portable versioned migrations. Use migration locks/checksums, separate migration credentials, tested constraints/indexes and supported upgrade paths.

First establish whether real hosted users/data need continuity. If not, document that evidence. If they do, rehearse identifier mapping, export/import, consent, blocked relations, tombstones, foreign-key ordering, checksums and authentication transition. Password hashes and existing sessions must not be assumed transferable. Use synthetic/anonymized dry runs and a recoverable cutover plan before any live-data operation.

Retain provider-neutral interfaces where useful, replace implementations after parity, and retire obsolete runtime imports/functions/secrets/docs deliberately. Keep the local engine and SQLite independent. Inventory, adapter design and migration rehearsal begin early; final Supabase retirement is a phase 7–8 gate after accounts, recovery/deletion, social/trip/chat/sync and billing parity. Legacy documentation can remain explicitly marked for migration history; it must not continue to advertise Supabase as a v2 prerequisite.

### 4.4 Local and remote development are both first-class

| Environment | Required properties |
|---|---|
| Local developer | Compose API/gateway/worker, PostgreSQL and Redis; optional compatible object storage, email sink and LiveKit; seeded synthetic fixtures; no production credentials. |
| Physical-device LAN | Documented reachable API/WS/media URLs, certificate/trust behavior and local firewall/network setup; correct native build configuration. |
| Remote development | Same immutable service images against generic remote Linux and configurable external service URLs; isolated accounts/secrets/data, secure ingress or VPN. |
| Staging | Production-like configuration, provider sandboxes, synthetic data, signed staging app identity, deploy/migration/smoke/E2E gates. |
| Production | Separate identity/database/cache/storage/secrets/push and media namespace; tested artifact promotion, monitoring, recovery and controlled rollout. |

Environment changes must not reuse tokens, outboxes, cached accounts or precise location snapshots across different backends. A staging and production app should coexist on a real phone with distinct bundle/package identities, app groups, deep links and push configuration. Committed native projects require matching schemes/flavors or an explicitly chosen native-generation approach; app configuration alone should not be assumed to update them. [Expo build variants](https://docs.expo.dev/build-reference/variants/).

Portability has an observable acceptance test: the same versioned server images complete the representative connected journey on local Compose and a generic remote reference host, using environment URLs for PostgreSQL/Redis/storage/media. A cloud provider can then be chosen based on actual reliability, networking and cost requirements. Kubernetes is not an automatic requirement.

## 5. Offline, realtime and cross-system correctness

### 5.1 Durable outbox and sync

Every durable offline mutation needs a stable client UUID, transactional enqueue, account/entity scope, retry state and server receipt. Safe retry means the server returns one result when a commit succeeded but the acknowledgement was lost. Reusing a key for a different payload needs explicit rejection or documented reconciliation.

Use a monotonic server change cursor with deterministic pagination, visibility rules, versioned entities and tombstones. Define compaction/cursor-expiry recovery so an old device cannot resurrect deleted records. Profile last-write-wins can be acceptable for low-risk fields; membership, invitation, roles, billing and ownership use authoritative server decisions. Route/waypoint reorder/delete needs its own conflict behavior.

Reconnect order matters: authenticate, revalidate trip/membership/privacy, fetch current authorized state, reconcile allowed durable edits, then resume live sharing/media. A device removed while offline must not briefly reveal positions or reconnect radio before learning that it was removed. A queued waypoint edit after role loss must fail explicitly.

Personal recording should continue while this happens. Pending work is visible as queued/failed/retryable instead of silently marked successful. Queue size, retry backoff/jitter and failure handling must be bounded. Lost ACK, partial batch acceptance, app death during transaction, full disk, token expiry and account switching are required tests.

### 5.2 Ephemeral signals must not use durable replay semantics

The PDF permits offline reactions “where appropriate” and also describes reactions as short-lived. These statements require a policy, not a blanket queue. A delayed Wait or Need help can mislead the group. Each reaction type needs expiration, duplicate suppression and an explicit expired/offline outcome. Persisted chat can reconcile later; current GPS and audio must not replay as though current.

Do not send every missed live GPS point when coverage returns. Send the current accepted point and current authorized snapshot. Durable personal samples remain local or follow an explicitly consented backup policy.

### 5.3 Presence, sequence and privacy

Use versioned frames with trip/member/device context, coordinates, heading/speed/accuracy, movement/privacy state, client time, sequence and server acceptance time. Define connection/device epoch, sequence reset after restart, accepted watermark and gap telemetry. Reject malformed ranges, excessive frame size, rate floods, unreasonable timestamps and unauthorized publish/subscribe.

The document suggests approximately 1 Hz when moving, reduced stopped cadence and platform-permitted background updates. Those are intended operating behaviors. Physical evidence must establish what supported devices deliver, especially under background/locked/low-power restrictions.

A Redis presence key expiring does not automatically delete a separate GEO sorted-set entry or trip-member set entry. Snapshot, proximity and fanout code must filter current authorized presence and clean residual indexes. Otherwise an expired member may remain geographically discoverable or audible.

Device last-known snapshots are useful during a dead zone but need authorization-bound retention. Former members cannot reappear from old cache after end/leave/block. Render interpolation with bounded prediction, stale age, later map removal and retained disconnected roster. Do not continue animating a vehicle indefinitely when its signal stopped.

“Ahead/behind” is not simply straight-line geographic distance. Same-route projection, opposite directions, separate carriageways, route alternatives and stale accuracy must be considered. When comparison is unreliable, show approximate/unknown rather than assert lane-level positioning.

### 5.4 Blocking, removal and outages

Define a policy matrix for two blocked people already in the same trip or crew: what each sees, whether membership changes, invitation rules, host powers, chat history and voice. Server enforcement must match the UI. Hiding an avatar or locally muting a voice is not proof that a modified client loses access.

During PostgreSQL failure, the source permits brief live continuation. That cannot mean indefinite reliance on stale roles. Define bounded membership/session leases, revocation propagation and which operations fail closed. Redis failure can disable live presence while durable APIs continue where safe. LiveKit failure can leave map/chat intact. RevenueCat uncertainty must not destroy personal data. Map-provider failure preserves cached capability and local HUD.

## 6. Native maps, voice and commerce feasibility gates

### 6.1 Offline maps versus offline navigation

Offline basemap rendering, offline routing data, rerouting, search and voice guidance are separate capabilities. A React Native map wrapper may not expose native Navigation SDK offline features. Prove the selected integration on physical iOS and Android before promising those features. The current official [iOS offline guidance](https://docs.mapbox.com/ios/navigation/guides/advanced/offline/) and [Android offline guidance](https://docs.mapbox.com/android/navigation/guides/advanced/offline/) are the implementation references, subject to selected SDK/version/license constraints.

The proof should cover a downloaded route/corridor, airplane-mode route behavior, supported reroute, cancellation/restart/removal, low storage, incomplete assets, outdated region, route changes and movement outside downloaded data. The app must distinguish “download complete” from “routing data sufficient for this route.” Unsupported offline search or guidance should not be implied by a successful cached map.

Record SDK/native build compatibility, usage metering, quota/license assumptions and cost visibility. Traffic is conditional on pricing/licensing; Waze-like incident intelligence is outside the included scope. Keep routing and map rendering provider integration separate from the app's multiplayer identity.

### 6.2 Crew radio and self-hosted revocation

Use a LiveKit room per active trip, backend-issued minimal grants, no default recordings, and clear microphone/connection state. The real-device integration must handle permission denial, PTT release/cancellation, interruption by calls/alarms/assistant, Bluetooth/car/helmet routes, background/lock, loss/rejoin and actual capture shutdown after end/leave/logout.

Media networking has public-IP, UDP, TLS and TURN requirements. A generic HTTP reverse proxy or serverless endpoint is not enough to establish voice connectivity. Keep media deploy configuration separate and test restrictive networks/TURN behavior explicitly. [LiveKit self-host deployment guidance](https://docs.livekit.io/transport/self-hosting/deployment/).

There is a particularly important self-hosted security constraint: removing a participant or changing permissions does not invalidate an already-issued token, and token expiration controls initial join rather than reconnect. Therefore short-lived tokens alone do **not** prove prompt removal. [LiveKit token/grant reference](https://docs.livekit.io/frontends/reference/tokens-grants/).

Before voice is declared complete, an adversarial test must save old tokens, remove/end/block/revoke a participant and attempt repeated reconnect with a modified client. Prove an enforceable room epoch/replacement/admission strategy for the selected deployment, including how authorized remaining members recover. If a mechanism cannot meet the agreed policy, change the architecture or explicitly resolve the limitation before release. UI mute and a short token TTL are not acceptable substitutes for this evidence.

### 6.3 Experimental proximity radio

Define whether proximity means convenient audio mixing or a privacy boundary. Client-side subscription/gain controls can implement the first but cannot alone enforce the second. Use accepted authorized positions, coarse distance bands, hysteresis/smoothing, poor/stale location fallback and explicit opt-in. Decide how crew-wide radio coexists with proximity users.

Test boundary oscillation, opposite routes, stale locations, mixed modes, reconnect churn and battery/audio load. The required experimental deliverable is a prototype evaluation and explicit ship-or-disable decision. A documented disabled beta control is an acceptable release outcome when performance or privacy cannot be proved; successful proximity shipment is not assumed. If enabled, it must satisfy its authorization and quality evidence. Keep basic crew radio usable when experimental proximity is disabled. Advanced smooth gain/channel zones remain a separate future capability.

### 6.4 Billing and backup correctness

Use RevenueCat's documented configured authorization-header checks and optional HMAC signature when enabled. Signature verification uses the exact raw request bytes, not JSON that has been parsed and reserialized. Persist event ID, environment and ordering/reconciliation state; duplicated, late or forged events must not incorrectly grant or revoke capacity. Keep sandbox and production accounts/products/events isolated. [RevenueCat webhook guidance](https://www.revenuecat.com/docs/integrations/webhooks).

Prove purchase/restore/pending/cancel/refund/grace and account transfer on both store sandboxes. Server entitlement and client cache must agree through a documented reconciliation policy. Define host versus participant entitlement ownership, over-cap existing crews and expiry mid-trip without inventing current limits.

Backups require explicit consent, versioned eligible summaries, checksum/integrity, ownership, encryption/access, portable storage and retention/deletion. Restore on another device must merge rather than overwrite unrelated local recordings. Interrupted/corrupt uploads, format changes, expiry and account deletion need evidence. Service disaster-recovery backups and a user's Plus history backup are different products with different policies.

## 7. Brand, frontend structure and skills

### 7.1 Preserve the existing design system

The native authority is [paperTheme.ts](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/src/theme/paperTheme.ts), with corresponding browser roles in [globals.css](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/web/src/app/globals.css). A starter-style constants palette elsewhere should not replace those roles.

| Role | Native dark | Native light |
|---|---|---|
| Primary cyan | `#00E5FF` | `#007F92` |
| Bright cyan | `#33F7FF` | `#009DB5` |
| Gold/warning | `#FFD21A` | `#936000` |
| Teal | `#00AFC7` | `#007C8F` |
| Background | `#0F1114` | `#F4F7F8` |
| Surface | `#151A1D` | `#FFFFFF` |
| Primary text | `#EAEDF2` | `#10191C` |
| Secondary text | `#8A8F98` | `#45555C` |
| Muted text | `#5D6A70` | `#68787E` |
| Danger | `#FF4C6B` | `#C72345` |
| Border | `#283137` | `#C9D6DA` |

Preserve Barlow body typography, Rajdhani display/numerics, the instrument/gauge identity, native spacing/radius roles and System/Light/Dark preference. Inventory native/web differences before centralizing tokens. Small differences may be intentional; a third-party default theme is not a design migration plan.

Measured source contrast gives one concrete improvement target: native muted `#5D6A70` is approximately 3.14:1 on `#151A1D` and appears in small labels; secondary text is approximately 5.40:1 on that surface. Review actual rendered pairings/states and adjust semantic text roles where necessary while preserving accent identity. These calculations are evidence for an accessibility task, not a complete certification. Translucent materials require composited checks over their actual backgrounds.

### 7.2 Use daisyUI where it fits

The [provided daisyUI skill](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/.agents/skills/daisyui/SKILL.md) is committed on dev. It supplies discovery/configuration/colors/component guidance. That does not mean the runtime has already adopted Tailwind or daisyUI.

Its DOM/CSS components apply to browser work. Native `View`, `Text`, `Pressable` and Paper controls do not gain daisyUI behavior by receiving HTML class names. Native screens should use native components, existing tokens and appropriate interaction principles. Web adoption, if selected, needs pinned Tailwind 4/daisyUI 5 runtime integration, explicit V3l0city light/dark themes, SSR/theme persistence and regression coverage.

There are real migration collisions: current CSS has `.avatar`, `.modal`, `.input` and `.select`, and its `--border` variable is a color while daisyUI's custom-theme `--border` is a width. Class prefixes alone do not solve the variable collision. Design a scoped/token migration and verify unaffected pages. [Existing browser CSS](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/web/src/app/globals.css).

The active `swap` and `text-rotate` guides are useful references, not feature requirements. Swap still needs semantic labels/state/focus. Continuous text rotation is a possible marketing affordance with reduced-motion handling; it is a poor default for a live driver display.

### 7.3 Add the Apple reviewer with explicit scope

The external [Apple Design Skill](https://github.com/dickwu/apple-design-skill/blob/904b0eedc7cc778152f545506075d5bb5219ce77/SKILL.md) was reviewed at pinned commit `904b0eedc7cc778152f545506075d5bb5219ce77`. It supports React Native, measured accessibility review, typography/layout/color, onboarding/permissions, feedback and motion. Its brand guidance supports product personality rather than a generic Apple clone.

Integrate it as a project-scoped reviewer with provenance/update process and explicit native/web/Android boundaries. Preserve V3l0city's palette and fonts. Its preference against app-level appearance switches is a review consideration, not authorization to remove the existing tested System/Light/Dark feature. Its generic mobile guidance does not prove driving suitability.

The audited repository has no standard LICENSE file and reports null license metadata. The README provides a provenance/“as-is” statement. Record those actual terms and choose a reviewed integration method; absence of a standard license is not itself proof that the skill cannot be used. Avoid unpinned fetch/install scripts in CI. [Source/provenance statement](https://github.com/dickwu/apple-design-skill/blob/904b0eedc7cc778152f545506075d5bb5219ce77/README.md).

The skill's HIG lookup does not cover CarPlay. Any future car integration needs official [Apple CarPlay framework](https://developer.apple.com/documentation/carplay/) and [entitlement guidance](https://developer.apple.com/documentation/carplay/requesting-carplay-entitlements), plus [Android for Cars](https://developer.android.com/training/cars), category/template decisions and physical head-unit proof. CarPlay/Android Auto are not release blockers under the confirmed included scope.

### 7.4 Frontend information architecture and safety states

Separate active recording/shared-session services from screen ownership so navigation cannot stop sensors, discard drafts or lose connected state. Plan Local/Connected/Plus information architecture explicitly: account-free entry, connected/auth gates, route/lobby/map/radio/social/crew/meetup/backup settings and meaningful permission/offline states.

Every feature needs loading, empty, error, retry, stale, expired, denied and partial-success presentation. Marker age/confidence must use text/icon/state as well as color. Driver-mode controls should be large and brief; composition and complex administration belong to parked/passenger interaction. Passenger preference alone is not a verified distraction certification.

Validate VoiceOver/TalkBack, keyboard on web, large text, contrast, focus, reduced motion/transparency, daylight/night readability, orientation and actual touch targets. Existing web reduced-motion support is an asset. Native press animation needs its own audit; browser support should not be treated as proof of native accessibility.

## 8. Containerization, CI/CD and release operations

### 8.1 Containers and bootstrap

Create reproducible server/gateway/worker images with pinned dependencies, compiled production artifacts, validated configuration, health checks and non-root execution where supported. Development bind mounts and seeds belong in development overrides, not production images. Include persistent volume, reset/export/import and restore instructions that affect only the intended environment.

Compose should support PostgreSQL/Redis and optional local object/email/media services. Separate optional-provider absence from a misconfigured required dependency. Document Windows/macOS/Linux backend/web setup, LAN devices and remote development. Android native builds require their toolchain; iOS requires macOS or a chosen native build service. Container portability does not eliminate platform build constraints.

A base Compose definition can have production-specific overrides, but that is a deployment pattern, not a guarantee of scale or reliability. [Docker Compose production guidance](https://docs.docker.com/compose/how-tos/production/).

### 8.2 Pull-request validation

The root `npm test` currently uses a watch command. Add finite CI scripts that exit deterministically. Run lockfile installs and appropriate checks across native JS, server, web and C++: types, lint, unit/component/property tests, portable database/protocol integrations, compiled builds and supported E2E.

Pin runtime/Actions dependencies, limit workflow permissions, isolate untrusted PRs from deploy/signing secrets, cancel superseded runs safely and retain sanitized artifacts. Measure coverage of critical logic and invariants; an arbitrary overall percentage or snapshot count is not a release proof.

The audit found no committed workflows. Branch responses reported unprotected branches, but that does not prove no organization ruleset exists. Verify actual protection/required checks and the account's environment capabilities before claiming enforcement. Deployment-reviewer and secret protections vary with repository visibility/account plan. [GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

### 8.3 Native build and distribution pipeline

Build signed development/staging/production variants with separate identities, schemes/flavors, app groups/widget IDs, deep links and push credentials. Link every AAB/IPA to commit, app/build version, environment and backend compatibility. Preserve symbols/source maps and scoped signing access. Production excludes simulator switches, fixture controls and test credentials.

The existing EAS preview/production profiles are useful inputs, not a complete staging/promotion plan. Document app version, native build number, schema version, protocol version and image digest separately. Native engine/Mapbox/audio changes require compatible native builds; an OTA update cannot supply a new binary dependency.

Include current Android native-library/page-size requirements and selected-device validation rather than assuming all packaged native libraries remain distribution-compatible. [Android 16 KB page-size guidance](https://developer.android.com/guide/practices/page-sizes).

### 8.4 Staging deployment

Build immutable images, record digests and serialize deployment/migration jobs. Validate configuration before exposure. Use isolated staging credentials/data/provider sandboxes, TLS/WSS, one controlled migration runner, health/readiness checks and synthetic journey smoke.

Stage acceptance should include sign-in, trip creation/join/start, live point delivery, reaction/chat where available, privacy/leave/end and voice when enabled. Failed migration/readiness/smoke blocks promotion. A deployment record connects commit, images, schema, app variants and evidence.

Schema changes need expand/migrate/contract compatibility, especially while older mobile apps remain installed. “Run migrations before traffic switches” is not permission to destructively break the previous server or shipped clients. Rollback must use a compatible prior artifact, with forward-recovery or documented restore where data transformation prevents simple reversal.

### 8.5 Production promotion and recovery

Promote the staging-tested digest, rather than rebuild an equivalent-looking artifact. Preparation and staging rehearsal of promotion, rollback and feature switches (`CICD05`) precede release-candidate acceptance (`REL01`). Actual production activation (`CICD04`) consumes that accepted candidate and rehearsal evidence afterward. This ordering avoids requiring production already deployed in order to accept the candidate. Rehearse release authorization on the repository's actual available controls, then progressive rollout, stop conditions, smoke/metric checks and recovery. Mobile rollout cannot be instantly reversed like a server image; maintain backend compatibility and feature kill switches that leave Local recording operational.

Monitor redacted API latency/errors, DB queries/connections, WS population/messages/freshness/reconnect, Redis memory, worker queue lag, voice joins/rooms, push failures, backup status/disk/TLS and relevant provider usage/spend. Correlation must not become a default precise travel, chat or audio archive.

Backup success is insufficient without restore evidence. Select PostgreSQL backup technique from agreed recovery objectives, encrypt/off-host artifacts, restore independently to a clean environment, reconcile sample counts/checksums and run application smoke. Include object storage/key recovery, Redis rebuild and reapplication of deletion records so old backups do not restore prohibited visibility. Record observed drill duration/data-loss window before setting final RPO/RTO expectations. [PostgreSQL backup and restore](https://www.postgresql.org/docs/current/backup.html).

## 9. Testing and release evidence

### 9.1 Existing tests to retain

The inspected baseline contains 24 native Jest test files, native C++ engine tests, six Fastify tests in one server test file, four browser Vitest files and a Playwright public-site suite. Browser projects include desktop Chrome and Pixel emulation. That suite checks public navigation/theme/demo boundaries; it does not prove connected convoy, authenticated voice or native Android behavior. No mobile E2E harness was found. [Existing operations/test guide](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/docs/developer/testing-and-operations.md), [server tests](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/server/src/app.test.ts), [public-site E2E](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/web/e2e/public-site.spec.ts).

Retain these checks, add meaningful scenario coverage and execute them in CI. Neither their existence nor this audit is a passing test result.

### 9.2 Layered test matrix

| Layer | Required evidence |
|---|---|
| Unit/property | Native engine regression; clocks/IDs/state transitions; permission functions; distance/proximity; sequence/epoch; outbox/conflicts; entitlement mapping; marker interpolation. |
| Component | User-observable loading/empty/error/offline/stale states, accessibility, appearance and safe input restrictions. |
| Local storage | SQLite upgrades, transactions/recovery, drafts, account isolation, tombstones, disk pressure/corruption handling. |
| API/database | Real PostgreSQL constraints, concurrent mutations, identity/membership/caps, idempotency, pagination, migration compatibility and authoritative state inspection. |
| Realtime | Real Redis/socket auth/fanout/TTL/GEO cleanup, multi-instance convergence, sequence gaps, reconnect storms and 5–20 virtual members. |
| Provider contracts | Email, push, maps/routing/offline, store sandbox/RevenueCat, LiveKit grants/revocation and compatible storage. Fakes do not replace required native proof. |
| Browser E2E | Supported public/account/invite/support/privacy surfaces against own backend and production build; full web product remains optional. |
| Native E2E | Tooling decision for custom-module builds, seeded isolated backend, local and two-device shared journeys, deep links/permissions/restart/revocation. |
| Resilience | Loss/jitter/reorder/half-open/401/429/5xx/DNS/TLS/captive portal/IP handover plus independent API/DB/Redis/media/maps/billing failures. |
| Performance | Representative workload, p50/p95/error/frame/memory/freshness/data/heat/battery measurements, 2–20 group cohorts and controlled 50 test envelope. |
| Physical qualification | Mixed-platform vehicles, real OS/background/audio/headsets/thermals and oldest/newest supported device matrix. |
| Operations | Fresh boot, staged deploy, migration failure, restore, host migration, rollback, kill switches and redacted alert/runbook exercises. |

Choose Maestro/Detox or equivalent by demonstrated native/location/audio capabilities and maintain stable test IDs/fixtures. Keep fixture APIs/simulation unavailable in production. Emulator smoke can run frequently; physical qualification is a separate gate.

### 9.3 Required end-to-end journeys

1. New user, no account/network: onboarding, units/vehicle, record/pause/save, restart/history/export and supported offline map.
2. Owned registration/verification/login/session recovery across two devices; switch account without private-history leakage.
3. Host creates trip, shares link/code, member authenticates/joins/readies, host starts, both receive route/waypoints/current or stale positions.
4. Reactions/chat/radio while authorized; permitted rally update; several-minute loss with ongoing local recording; reconnect with no duplicate membership/message/waypoint or false-current signal.
5. Block/remove/end during dropout; returning client is denied location/audio and cannot regain access with cached credentials/media tokens.
6. Crew creation/roles/invite, timezone-aware meetup/RSVP, changed/cancelled reminder and idempotent launch/association with trip.
7. Sandbox purchase/restore, configurable cap enforcement, backup and second-device restore, expiry/refund/grace while preserving local data and active-route access.
8. App upgrade/migration, signed staging variant, deployment smoke, clean service restore and compatible rollback.

### 9.4 Physical field requirements

The PDF explicitly requires a two-car iOS/Android controlled route, a five-vehicle mixed highway/city convoy, a known cellular dead zone, motorcycle helmet Bluetooth before motorcycle beta, battery measurement over 1/3/6 hours, older-phone heat/background testing, and driver-UX glance/button/voice review.

Add installation/update from v1, approximate/denied/revoked/one-time permissions, lock/background/OS-kill/battery-saver, GPS loss/tunnel/dense streets, real audio-route changes and existing widgets/notifications. Use stationary/simulator/controlled settings and a passenger/test operator for interactions during motion. Physical head-unit tests become required only if that surface ships.

Record signed build SHA/version, device/OS, permissions, network/provider/audio setup, scenario, expected/actual result and defect/evidence links. A simulator demo cannot waive these gates. Determine numeric battery, freshness, revocation, recovery, load and distraction thresholds from prototypes and representative evidence; the PDF does not supply final numbers.

### 9.5 Edge cases to attach to feature acceptance

| Domain | Cases that must not disappear into a generic “add tests” issue |
|---|---|
| Identity | Expired/replayed link, email normalization, stolen/revoked refresh, offline expiry, account switch, reinstall, deletion during shared session. |
| Trip | Copied/revoked/expired code, duplicate devices/join, cap races, concurrent start/end, last host leave/crash/deletion, offline end, separate continuing personal recording. |
| Sync | Commit-before-lost-ACK, partial success, changed key payload, stale cursor, tombstone expiry, corruption/full disk, app death, unauthorized queued edit. |
| Location | Bad ranges/NaN/time jump, poor GPS/teleport, epoch reset, opposite route, stale GEO, Redis eviction/restart, privacy disabled, fanout ordering. |
| Maps | First launch offline, incomplete/cancelled region, no storage/quota, unsupported search/reroute, corridor exit, changed shared route, provider/token failure. |
| Voice | Mic denial, cancelled PTT, phone interruption, Bluetooth route change, TURN-only network, stale proximity, end/logout shutdown, hostile old-token rejoin. |
| Chat/push | Duplicate system event, queued expired reaction, ended-trip send, delayed/cancelled reminder, push token reassignment, blocked deep link, unauthorized history. |
| Billing/backup | Forged/duplicate/reordered webhook, sandbox confusion, pending/refund/grace, host downgrade, corrupt/interrupted artifact, restore conflict, consent/retention deletion. |
| Media | Oversize/polyglot file, EXIF/GPS metadata, orphan uploads, unauthorized/expired signed URL, optional-store outage. |
| UI | Largest text, focus/reader semantics, reduced motion, non-color stale state, daylight/night, motion/parked/passenger transitions. |
| Operations | Missing secret, migration failure, old mobile client, disk/backup failure, old backup restoring deleted visibility, cloud migration, unavailable monitoring. |

## 10. Documentation and work organization

Extend the existing documentation hierarchy rather than create a competing one. Keep developer entry points, architecture, native engine/local data, testing/operations and user guides, while updating their authority and observed behavior.

There is existing drift: the mobile frontend guide says samples remain in memory until save, but later describes draft append/recovery, and current code uses draft creation/sample append/recovery. Reconcile documentation with measured native and JavaScript persistence, including background gaps. [Mobile frontend guide](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/docs/developer/mobile-frontend.md), [draft repository](https://github.com/Sammieblz/V3l0city/blob/5a1ac2d77e295cc9e50dd6502bde866f9ae1ebdd/src/database/tripRepository.ts).

Documentation release artifacts should cover:

- Domain/data authority, dependency boundaries, ADRs and legacy migration decisions.
- OpenAPI/WS versioned contracts, errors/cursors/idempotency and old-client compatibility.
- Local schema/outbox/conflicts, sampling lifecycle, background limitations and map/download capabilities.
- Owned auth/session/deletion/export, sharing/block/report permissions, retention and backup consent.
- Fresh-checkout local bootstrap, Windows/macOS/Linux caveats, LAN phones, remote development and optional providers.
- Environment/secrets inventory, native variants/signing, staging/prod pipelines and immutable promotion.
- Backup/restore/rollback, incident/kill switches, alerts and provider migration.
- Test layers/fixtures/device matrix, evidence, supported platforms and known limitations.
- Skill provenance/scope, brand tokens/accessibility, release checklist and user-facing behavior.

Contract/state/permission/operating changes should update the relevant documents in the same PR. Check generated contracts/links where feasible; rehearse setup/runbooks. Documentation completion means another developer or operator can follow it successfully, not merely that a Markdown file exists.

### 10.1 Epic structure

Organize the complete backlog into architecture/migration; identity/privacy; device storage/sync; local drive/maps; shared-trip lifecycle; social/crews/meetups; realtime; voice/chat/reactions/push; Plus/media/backup; UI/design/accessibility; containers/environments; CI/CD; operations/recovery; automated/physical quality; documentation/release.

Each leaf issue should state outcome, source page/user requirement, implementation boundary, edge cases, acceptance, evidence, dependencies and documentation. Feature issues own their meaningful tests. Cross-cutting epics provide shared tools/matrices/pipelines and release gates; they must not become a reason to postpone all verification until the last phase.

Reusable guard, rate-limit and revocation-signal foundations (`SEC02`) come before domain features and can be tested with isolated fixtures. Their completion does not claim the finished application's entire security matrix; full cross-domain security, protocol and media evidence follows in `SEC03`, `QA02` and `QA06`. Brand tokens and scoped skill governance (`UI01`/`UI02`) begin in phase 0. Account-free native HUD work (`UI05`) depends on local recording foundations, not completed authentication. Optional daisyUI runtime adoption remains separate from using its supplied guidance.

### 10.2 Delivery order without scope reduction

| Phase | Product result | Required supporting evidence |
|---|---|---|
| 0: foundations | Local app preserved; ownership/critical telemetry regression; owned contracts/schema/Compose; migration and skill/brand rules | Existing tests in finite CI, architecture/data inventory, local/LAN setup and upgrade baseline. |
| 1: identity/data | Owned accounts/profiles/vehicles and durable local cache/outbox | Verification/recovery/session/privacy/account-isolation integration; two-device profile sync. |
| 2: shared lobby | Create/join/ready/host lifecycle and shared route/waypoints | Link/code authorization, races/caps, role loss and deterministic plan convergence. |
| 3: realtime map | Reliable group movement, approximate distance, stale/reconnect state | Five-client and 5–20 simulations, TTL/GEO/epoch/fanout tests and real-device proof. |
| 4: communication | Crew radio/chat/reactions and gated proximity | Hostile media rejoin proof, Bluetooth/PTT, durable/offline chat, transient expiry. |
| 5: crews/meetups | Role-controlled crew, RSVP, reminders and trip launch | Timezone/cap/ownership/cancellation/concurrency E2E. |
| 6: offline hardening | Supported offline maps, durable retries and restart recovery | Full network/service-fault matrix, no unauthorized cache resurrection, physical dead zone. |
| 7: Plus | Purchase/restore, limits, customization, retention and backups | Both store sandboxes, webhook/order policy, expiry mid-trip and cross-device backup integrity. |
| 8: release candidate | Invited beta independently operates complete product | Staging/prod promotion rehearsal, restored service, physical qualification, docs/privacy/evidence pack. |

Security, offline invariants, documentation, metrics and test tools start in phase 0. Later hardening phases verify the whole system; they do not introduce those concerns for the first time.

## 11. Decisions that remain open

| Decision | Why it matters | Resolve before |
|---|---|---|
| Owned identity implementation and password/magic-link UX | Migration, email, secure storage, recovery and threat model | Account implementation/cutover. |
| Real legacy users/data and adoption policy | Retention/consent/identity transition cannot be assumed | Destructive provider retirement. |
| Native map/Navigation SDK and offline capabilities | RN wrapper may not supply routing/rerouting/search | Public feature claim and route implementation. |
| Native accepted-location/background persistence contract | Map/WS require coordinates; suspended JS may miss writes | Realtime/native architecture. |
| Supported OS/device baseline | Builds, memory, thermal/background and field matrix | Qualification and store release. |
| Same-trip block/host transfer/multiple-device policy | Visibility, role races and removal enforcement | Connected authorization. |
| Self-hosted voice revocation mechanism | Old token reconnect is not solved by short expiry | Voice completion/release. |
| Proximity convenience/privacy and beta launch | Determines enforceable subscription/security behavior | Experimental feature launch. |
| Reaction validity/expiry | Delayed help/wait cannot appear current | Offline communication release. |
| Free/Plus caps, prices and host entitlement ownership | Capacity and downgrade policy; free8 is only example | Products/limits configuration. |
| History/cache/report/backup retention and deletion | Consent, privacy, storage and restoration behavior | Data lifecycle release. |
| Freshness/revocation/recovery/performance/battery targets | Qualitative wording cannot produce a pass/fail | Pilot and release gate. |
| RPO/RTO and backup method | Required evidence depends on tolerated loss/recovery | Production operations. |
| Production hosting provider and scale arrangement | Networking, support, deployment/cost choices | Actual production infrastructure. |
| GitHub protection/approval capabilities | Enforcement depends on actual account/repo plan | Pipeline governance. |
| Native E2E/build distribution approach | Must support custom module and seeded journeys | Automated native QA. |
| daisyUI runtime adoption and external skill integration | Supplied guides are not runtime styling or a license decision | Relevant frontend implementation. |
| Optional web breadth/traffic/OAuth/host broadcast | Avoid implied commitments beyond included baseline | Their implementation or marketing. |

Use reversible defaults and recorded ADRs for routine engineering choices. Keep product policies and irreversible/provider commitments explicit. An open decision should have an owner, evidence task and deadline relative to its dependency, rather than being a hidden assumption in code.

## 12. Deferred and optional boundaries

PDF page 26 explicitly defers public stranger discovery/anonymous proximity, proprietary map/turn-by-turn engine, crowdsourced police/hazard reporting, CarPlay/Android Auto as a release blocker, Bluetooth/AWDL mesh, E2EE beyond chosen platform guarantees, public feeds/likes/followers/creator economy, competitive speed/racing, OBD-II/CAN, dashcam/video, AI driving coach, complex fleet/business administration and a global web dashboard beyond minimal account/support.

Future candidates are vehicle-dashboard companion surfaces, advanced proximity zones/gain, peer relay research, photo drops, recurring crew calendar, private replay, intercept routing, richer emergency/mechanical assistance, web crew planning and advanced Plus analytics/custom map themes. These stay visible in a future backlog. The included Need help reaction does not mean the richer emergency workflow is already promised; included cosmetics do not imply a full custom-map editor.

Optional source items include OAuth, traffic layer, host broadcast, private call only if trivial, optional avatar/crew assets and later web reuse. Decisions should be recorded. Read receipts and future `crew_pro` are not part of the required initial entitlement/chat implementation.

## 13. Source traceability: all 30 pages

This table preserves the document's original numbering while applying the confirmed v2.0.0 interpretation. It is the source map for the linked backlog and acceptance evidence.

| Page | Source section | Requirement and planning interpretation |
|---|---|---|
| 1 | Cover/architecture thesis | SQLite local, PostgreSQL durable backend, Redis live, LiveKit media, Mapbox spatial, C++ movement ownership. |
| 2 | Document version | Source document Version1.0/October2026; release identifier remains v2.0.0. |
| 3 | Purpose/principles | Local usefulness without account/cloud; owned core backend; durable/live/media separation; glanceable driving; no competitive incentives; shared-group travel boundary. |
| 4 | §1 Summary | Local/Connected/Plus, journey completion through intermittent coverage; multi-vehicle/club/motorcycle audience; 2–20 intended and50 controlled test envelope. |
| 5 | §2 Architecture | SQLite/native engine/Mapbox/PostgreSQL/Redis/Fastify WS/LiveKit/API/RevenueCat responsibilities. |
| 6 | §2 continuation | Push and optional S3-compatible storage; do not stream every live GPS point into PostgreSQL. |
| 7 | §3.1–3.2 | Settings/vehicles/recordings/caches/outbox/cursors/offline metadata; airplane mode, last-known locations, reconnect, app recovery and service-unavailable behavior. |
| 8 | §3.3 | UUID/idempotent durable retry; server cursor; conflict ownership; client message IDs/tombstones; exclude live location from generic sync. |
| 9 | §4.1–4.2 | Full Local and Connected feature inventories: HUD/record/map/route/offline/profile/privacy plus accounts/buddies/lobby/route/map/waypoints/reactions/voice/chat/crews/meetups/push/summary. |
| 10 | §4.3 | Plus backup/restore/caps/admins/branding/cosmetics/retention; safety/finish route/block/report/help/local data not paywalled. |
| 11 | §5 Flows | First-launch local; create/invite/join/ready/start; throttled authorized live session; end/leave/local finalize/cloud summary/backup/automatic sharing stop. |
| 12 | §6.1–6.3 | Versioned location fields/accepted server time; moving/stopped/background cadence; current-state reconnect; presence TTL/member/GEO/reaction keys. |
| 13 | §6.4 | Interpolation, approximate distances, stale age, later active-map removal/roster retention and understandable confidence. |
| 14 | §7 | Mapbox puck/vehicles/route/icons/cameras/search/ETA/offline; conditional traffic; no custom maps/routing/crowd incidents/lane identity/full car-nav blocker. |
| 15 | §8 | Trip LiveKit room/minimal token; crew PTT/mute, experimental proximity, optional/deferred modes; durable cached chat/UUID/states/system events/limits; block/report/mute/remove/no recording/preset driving input. |
| 16 | §9 | Owned verified auth, secure sessions/hashing; social/vehicle/crew/meetup/trip role fields; active-trip sharing only, no public nearby/home requirement/permanent crew tracking, local-private history. |
| 17 | §10 | Durable account/session/vehicle/buddy/block/crew/meetup/trip/chat/event/summary/backup/subscription/push/report/audit models; device caches/outbox/sync/live/entitlement additions. |
| 18 | §11 | Representative versioned API and WS surface, validation/OpenAPI/structured errors/cursor pagination/independent abuse limits; add missing lifecycle endpoints explicitly. |
| 19 | §12 | RevenueCat offerings/purchase/restore/webhook authority; Plus entitlement/configurable example limits; graceful expiry/local data/export/offline cache/grace; future crewPro deferred. |
| 20 | §13 | Compose local services, portable early public hosting/media separation, growth hooks, immutable GitHub Actions/migrations/secrets/nightly backup/TLS; user adds full local-cloud-dev/stage/prod delivery. |
| 21 | §14 | Strong owned auth/revocable sessions/operation and WS/media auth; trip-only TTL locations/no default raw server history/retention/stop/revoke; rate/frame/image limits/audit/no strangers. |
| 22 | §15 | Redacted correlation logs/metrics/crashes/health/readiness/alerts; independent maps/Redis/LiveKit/Postgres/billing degraded states and local preservation. |
| 23 | §16 | Native/SQLite/sync/authz/proximity/WS/entitlement/interpolation unit; API/socket/virtual group/network/providers/restore integration; specified physical vehicles/headsets/battery/heat/driver usability. |
| 24 | §17 | Phases0–8 and exit criteria; shared-state/realtime proof before voice/monetization; cross-cutting fundamentals start early. |
| 25 | §18 | Account-free local, cross-platform group lifecycle/map, loss/rejoin without duplication, voice/chat/crew/meetup, privacy, sandbox Plus, deploy/restore/monitoring and motion UI acceptance. |
| 26 | §19 | Explicit deferred and future candidates remain separate; source future “V2” is not automatic requested v2.0.0 scope. |
| 27 | §20 | Battery/network/audio/license/privacy/scope/single-host/distraction risks; attach measured/operational mitigations and evidence. |
| 28 | §21 | Keep engine/SQLite/interfaces/simulators, separate personal/shared domain, evolve owned server, retire Supabase after parity; optional web and gated car dependency. |
| 29 | §22 | Verify current external SDK/quota/license/pricing; React Native/Expo/native/SQLite, Mapbox, Fastify/Postgres/Redis/LiveKit/RevenueCat/APNs-FCM baseline; portable local/cloud path. |
| 30 | §23 | Uncompleted integration checklist requiring explicit implementation, security, operations, physical and documented beta evidence. |

## 14. Release completion standard

Release-candidate acceptance occurs when every included requirement links to implemented behavior and appropriate evidence, with conditional experiments explicitly dispositioned; the account-free local experience still works with connected dependencies disabled; authorized shared journeys survive measured outages/restarts; block/end/removal is enforced across data and audio; Plus honors consent and preserves local ownership; signed app and backend artifacts are traceable; stage/prod promotion, recovery and documentation have been rehearsed; and required physical-device/controlled-trip checks are complete. Actual production activation then uses that accepted evidence and the rehearsed controls, records authorization and post-deployment results, and completes the production-delivery work.

The plan must remain honest about supported platforms, offline map/navigation capabilities, beta proximity, old-client compatibility and any unresolved limitations. Optional/deferred decisions should be visible rather than silently advertised or discarded. Passing tests, restore drills and device observations are the evidence of readiness; source checklists, configuration files and polished screens alone are not.
