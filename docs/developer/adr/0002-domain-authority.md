# ADR 0002: distinct trip domains and explicit data adoption

Status: accepted foundation safety model; feature/persistence wiring pending.
Implementation: #31/#39/#44; final cutover: #82.

## Context and decision

The existing `Trip` represents a device's personal recording. Reusing it for
shared group lifecycle would couple leave/end/removal to personal history and
make cached social data appear authoritative. Legacy local rows also have no
persisted account owner, so signing into an account is insufficient upload consent.

Keep personal recordings, shared definitions, memberships and live sessions
distinct. A personal recording may continue when a shared trip ends. A local
leave/end/removal/disconnect drops its sharing grant immediately while preserving
the personal draft. The reducer is a client safety gate; the backend must still
authorize each publication and current membership.

| Data or action | Authority | Device role |
| --- | --- | --- |
| Personal samples/draft/summary/export | Device SQLite | Source of personal truth; account free. |
| Shared destination/waypoints/lifecycle | Owned backend with revision checks | Cached view and pending mutation. |
| Membership, host/admin, blocks | Current backend facts | Display cache; never independent grant. |
| Live location publication | Authenticated user/device/epoch grant plus active sharing consent | Validate epoch/expiry; discard on leave/end/revoke. |
| Presence/location | Ephemeral live service | Bounded last-known display; no offline GPS replay. |
| Purchases/capacity/entitlements | Owned verified billing state | Offline display only; cannot grant server privileges. |
| Recording backup/adoption | Persisted owner plus explicit consent and server authorization | Explicit selection; unclaimed records stay local. |

Identity mapping must be confirmed one-to-one. Unmapped data remains unclaimed;
never infer ownership from current login or copy provider credentials. Adoption
cannot transfer a recording from another account. Restore must not overwrite
another account's local history. Blocks, deletion/tombstones and consent must
survive any actual export/import; synthetic planner tests are only preparation.

One account can have multiple devices, but the policy for concurrent publishers
is open. The contract carries a server-issued connection epoch; timestamps and
sequences cannot create authority or reset a watermark. Durable acknowledgments
must not skip gaps; ephemeral location may skip sequences within one epoch.

## Compatibility and release gates

Legacy personal `Trip` and SQLite schema remain unchanged in this foundation.
The cloud facade preserves callers while selecting Local by default and loading
an explicitly selected legacy provider lazily. Backup/restore default to denied
until account ownership/consent persistence is wired. This intentional interim
limitation prevents automatic cross-account uploads and is not final backup parity.

The native collectors contain coordinates, but the JS speed event/hook/persisted
sample currently omit them. Project accepted coordinates/time/accuracy through
the existing native sampling source in the collector and map tickets; do not
start a second GPS loop or claim native device validation from a pure reducer test.

No destructive provider retirement precedes feature/data parity, successful
migration rehearsal, rollback evidence and #82. Actual two-device connected
join/leave/end and device upgrade journeys remain required with their features.
