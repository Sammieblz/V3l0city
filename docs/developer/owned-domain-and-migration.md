# Owned domain and legacy migration foundations

This architecture slice prepares issues #31 and #44. It does not implement
owned account endpoints, shared-trip production flows, a production identity
migration, or a new location collector. Final Supabase retirement (#82) remains
dependent on owned-backend feature/data parity and release evidence. The user has
confirmed that real legacy accounts and hosted data exist and must be retained.
This checkout has performed no production data reads, writes, exports or deletes;
preserving the legacy adapter is not proof that a production migration is ready.

## Personal recordings and connected trips

`src/domain/trip.ts` keeps the existing personal recording and sample shapes,
including legacy IDs, SQLite/export compatibility, and native speed metadata.
Neither shared membership nor live location authorization is stored in `Trip`.

`src/domain/connectedTrip.ts` defines a separate travel-session reducer:

- Personal recording is device-owned; connected snapshots describe server-owned
  trip lifecycle, membership and roles using the shared contract vocabulary.
- Loading a cached active membership always clears sharing grants. Cached facts
  may render a last-known screen, but cannot authorize location/media access.
- Join requests are intent, not permission. Sharing requires an authenticated,
  transport-validated server grant for the same trip, account, connection epoch,
  active/joined membership, unexpired lease, and explicit sharing preference.
- Disconnect, access revocation, leave and end requests clear the grant
  immediately. These events retain the exact personal recording object.
- Older revisions and conflicting same-revision facts are ignored. A terminal
  trip cannot become active again under the same identity. Authenticated history
  is retained separately for each trip/account, so a cache or trip switch cannot
  lower the authoritative revision or erase a known terminal state.
- Disabling sharing destroys and invalidates the grant. Re-enabling requires a
  fresh grant; an identical replay stays rejected even after renewed consent.
  The transport captures `consentGeneration` when it requests permission and
  attaches that captured value to the response event. Responses to requests
  made before privacy changes cannot enable sharing, including unseen grants.
  This foundation identifies an invalidated grant by trip/account/epoch/expiry,
  so a distinct renewal with identical fields is conservatively denied. The
  production transport contract needs a unique server grant ID/generation to
  distinguish renewal from replay; do not remove the denial barrier to fix UX.

The reducer is a client safety gate, not a replacement for server authorization.
Its `server-snapshot` input must come from the authenticated validated transport;
it must never be dispatched from SQLite cache or arbitrary deep-link content.
Lease expiry needs a transport-provided clock projection; do not use unchecked
device wall-clock changes as proof of authority. Server handlers still validate
current session/membership and revoke live access independently.

The existing UI does not yet consume this new shared-trip reducer; wiring it is
part of the later shared-trip and realtime epics. Current personal recording
behavior remains on its existing engine/repository path.

## Provider seam and deliberate local default

`src/cloud/cloudService.ts` exports the existing auth/social/profile/sync facade
and an injectable `createCloudService` factory. Backend-specific providers,
configuration, ownership decisions and local persistence are replaceable ports.
The service imports no concrete Supabase classes.

`src/cloud/providers.ts` loads legacy classes only after an explicit valid
selection. Set `EXPO_PUBLIC_V3L0CITY_CLOUD_PROVIDER=legacy-supabase` plus the
existing publishable URL/key to retain the legacy auth/social adapter. Old
Supabase environment variables by themselves no longer enable cloud features.
The default or unknown selection is `local`, with no provider initialization or
network dependency for account-free driving. `owned` is reserved and disabled
until the owned auth/sync adapter is implemented; it is not advertised as ready.
No service-role key belongs in either native or web clients.

Supabase files and packages remain for explicit compatibility. Its live schema,
functions, credentials and hosted account data are not changed by this slice.
The independent Next.js application's legacy adapter is not migrated here;
that cross-surface parity must be addressed before final retirement.

## Adoption and account isolation

Existing personal-trip rows and legacy outbox mutations have no reliably
persisted account ownership. Signing up, enabling backup, completing onboarding,
or switching accounts must not upload every local record to the current user.

`src/domain/recordingOwnership.ts` supplies a non-destructive migration rehearsal:

1. Preserve personal IDs and records. Apply only a confirmed one-to-one legacy
   identity map; missing mappings leave records unclaimed.
2. Identity mapping is not backup consent. `adoptionConsentAt` remains absent.
3. Require explicit selection and a recorded consent timestamp to adopt personal
   records. Reject reassignment from another account before changing anything.
4. Backup is eligible only when the owner and consent both match the account.

These helpers plan changes; they do not execute database writes. Production
adoption needs a versioned account-scoped persistence migration and UI consent
journey, with export/rollback and before/after data-integrity checks. Do not use
email similarity, current login, or profile metadata to infer a mapping.
The ownership-array helper alone does not rehearse profiles, credentials, friend
relations, blocks, tombstones, persisted consent, record/sample counts, checksums
or restore fidelity. Issue #44 must include those synthetic fixtures and an
authorized, reviewed migration procedure before touching real legacy data.

The production cloud facade currently uses a deny-by-default ownership port.
Personal upload and restore therefore remain disabled even with the legacy
provider selected, until a persisted, validated `RecordingOwnershipPort` is
wired. Existing local history remains readable and exportable. This deliberate
restriction avoids silent cross-account adoption during transitional builds.
The later persisted port must protect restore ID collisions and atomically
scope writes to the expected account; a UI-selected boolean is insufficient.

When a real ownership port is injected, the service filters uploads/tombstones,
blocks upload/restore while auth transitions are pending, checks the account
epoch at both start and completion/failure, and dispatches with an immutable
captured session. Provider implementations must bind each request to that token
instead of mutable SDK login state. The legacy adapter sets an invocation-level
Authorization header for both sync and restore, and partitions its archived
endpoint's combined success IDs into upload and deletion acknowledgements.
Post-response account checks protect local application; explicit credential
binding protects the outgoing request before any response exists.

The service captures all pending/error outbox operations before recording
versions and delegates acknowledgement to the repository's atomic compare-and-
set. A changed local version or an uncaptured mutation remains pending. A
confirmed tombstone can supersede captured older uploads, while an upload cannot
acknowledge a deletion. It never drains unrelated accounts' operations. This
unlimited capture prevents the old 25-operation page from stranding a backlog;
bounded durable batching, retry cursors and persistent account ownership remain
part of #54. Deleted records require explicit deletion acknowledgement;
successful uploads do not imply deletion succeeded.
The facade permits one outgoing backup at a time, returning an explicit busy
result to overlapping callers and releasing the guard after success/failure.
This prevents an older local request from committing after a newer one and
leaving a newer already-acknowledged row stale remotely. It does not coordinate
separate devices or independent client instances: authoritative server mutation
versions and multi-device conflict ordering remain #54/#60.
Creating a profile no longer starts a blanket personal upload.

Tokens/session IDs are used only to detect local operation races here. They do
not prove server authorization; the owned server must validate sessions. The
legacy adapter's auth session API is unchanged. References:
[Supabase getSession](https://supabase.com/docs/reference/javascript/auth-getsession)
and [invocation headers](https://supabase.com/docs/reference/javascript/functions-invoke).

## Single native location source: identified projection gap

The existing native collectors already receive coordinates:

- iOS `V3l0citySpeedEngineModule.swift` passes CLLocation coordinates, timestamp
  and accuracy to `SpeedEngineWrapper` in its GPS ingest path.
- Android `LiveDriveSessionManager.kt` passes Location latitude/longitude and
  quality/timestamp into the JNI speed engine.

However `modules/v3l0city-speed-engine/index.d.ts`'s `SpeedUpdateEvent`, the
`useVelocitySensors` public state, `TripSpeedSample`, and drive-surface snapshots
do not expose latitude/longitude. The UI/Mapbox/WebSocket layer cannot obtain
current native accepted coordinates from that projection today.

The map integration must extend the existing accepted native GPS event through
Swift/JNI/TypeScript with timestamp/accuracy/quality and explicit unavailable
state, and validate both platforms. It must not create a parallel always-on
Expo GPS collector or fabricate coordinates from speed/heading. Background
durability also needs physical validation: receiving native widget updates is
not proof that coordinates/samples are durably saved while JS is suspended.
This slice changes none of those native fields or collectors.

## Evidence and remaining gates

`ownedDomain.test.ts` exercises cached authorization denial, lobby-to-active
consent, lease/account/epoch expiry, cache-resistant terminal facts, stale consent
responses and replayed grants, revocation while retaining
the personal draft, and synthetic migration/adoption isolation.
`ownedCloudService.test.ts` exercises local-only factory isolation, unclaimed
backup denial, scoped partial acknowledgements, restoration filtering, account
switch during pending response and during deferred login/preflight, atomic
acknowledgement delegation, and onboarding without automatic uploads.
`legacySyncProvider.test.ts` uses the installed Functions SDK with a synthetic
fetch to check captured Authorization at dispatch and legacy tombstone response
partitioning. It makes no hosted-service call or claim about production RLS.
`cloudConfig.test.ts` verifies deliberate provider selection and rejects loading
the legacy SDK in local mode.

Remaining gates: persisted adoption/ownership schema, actual owned adapter,
legacy account migration rehearsal with authorized source data, typed transport
integration, real two-device join/leave/end, native builds, and physical
background/permission/network scenarios. Unit tests do not satisfy those gates.
