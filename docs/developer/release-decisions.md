# v2.0.0 release decisions

Register established for [PLAN01 #28](https://github.com/Sammieblz/V3l0city/issues/28).
PDF document Version 1.0 is the source revision; product release is v2.0.0.
Confirmed scope means a requirement, not an implementation claim. Proposed
defaults need a recorded decision; open gates cannot pass based on elapsed time.

## Confirmed direction

| ID | Decision | Evidence/owner |
| --- | --- | --- |
| S01 | Full included PDF MVP is v2.0.0; deferred items remain future backlog #107. | Explicit user answer; product owner @Sammieblz. |
| S02 | Include Local, Connected and Plus; experimental proximity has a ship-or-disable gate. | PDF pp9–16 and release plan #8. |
| S03 | Owned portable backend; cloud host undecided; move away from Supabase after parity. | User request; ADR 0001/0002. |
| S04 | Work from `dev`, chronological prerequisites, current coding/docs standards. | User implementation request; maintainer @Sammieblz. |
| S05 | Local needs no account; retain native engine, personal SQLite, history/export. | PDF pp3,5,7,28; existing implementation. |
| S06 | Preserve V3l0city palette/typography and platform-specific frontend boundaries. | User request and authoritative `src/theme/paperTheme.ts`; brand/UI tickets #38/#40. |
| S07 | Stage/prod pipelines, unit/integration/E2E/physical testing, containers, local/remote backend and maintained docs are release work. | User request; delivery/QA epics. |
| S08 | Preserve existing Supabase accounts and cloud data, alongside local history. | Explicit user migration answer October 6, 2026; migration owner @Sammieblz. |

Included connected scope covers owned accounts/profiles, Road Buddies and blocks,
shared trip lobby/route/map/waypoints/reactions/voice/chat, crews/meetups/push and
trip summaries. Plus covers authorized store purchases, backup/restore, eligible
capacity/crew/cosmetic/history features. Public stranger discovery, CarPlay/
Android Auto production, P2P networking and trip replay remain deferred. Map
traffic and experimental proximity need explicit feasibility/launch disposition.

## Open and proposed decisions

Owners below are accountable roles, not GitHub assignments. @Sammieblz holds
product/release decisions; implementation owners collect evidence in the linked
tickets. Record outcome, date, evidence/build and owner here when a choice changes.

| ID/status | Decision to make | Owner | Required evidence | Must resolve before |
| --- | --- | --- | --- | --- |
| D01 open | Supported iOS/Android versions, phone/tablet classes and low-end baseline | Product + mobile maintainer | Existing native deployment targets, Mapbox/audio compatibility, actual devices | #34 feasibility and #32/#88 physical test matrix; final #105 |
| D02 open | One account's simultaneous live publishing/device takeover policy | Product + backend maintainer | Two-device join/reconnect and session-revocation behavior | #58/#74/#75 |
| D03 open | Free/Plus trip/crew limits and downgrade/grace behavior | Product owner | Capacity/cost tests and store policy; PDF eight-member example is unselected | #62/#72/#86; no cap sold earlier |
| D04 open | Subscription price/offering and cosmetic/retention packaging | Product owner | Store sandbox, costs and entitlement scenarios | #62/#87/#93 |
| D05 open | Personal/shared/chat/media retention and deletion/consent policy | Product + privacy owner | Export/delete/backup recovery scenarios; source distinctions | #52/#65/#94/#59 |
| D06 confirmed requirement, evidence open | Preserve legacy users/cloud data with verified mapping and recovery | Product + migration maintainer | Authorized source inventory/counts/consent, synthetic then sanitized rehearsal, reconciliation; never assume portable password hashes | Real #44 import or #82 retirement |
| D07 proposed | Reverify retained identities; never assume reusable provider hashes | Product + identity maintainer | Chosen auth library/method, email verification and recovery rehearsal | #51/#65 and real migration |
| D08 open | Owned auth method and maintained identity/session/password libraries | Identity maintainer + product | Maintained-library threat model and session tests | #51/#58 |
| D09 open | Email delivery provider/domain and bounce/retry handling | Product + operator | Verified delivery to representative inboxes and recovery flows | #51 staging acceptance |
| D10 open | Mapbox SDK/offline routing/search/corridor/traffic capability set | Mobile maintainer + product | Native builds, downloaded map and disconnected route/search/device tests; tiles alone do not prove offline routing | #34/#42/#55 |
| D11 open | Stage/prod reference host, storage/email/push secrets and deployment topology | Release operator + product | Same images on local and generic remote host, costs/connectivity/backup evidence | #45/#49/#56/#57; production #106 |
| D12 open | LiveKit public IP/UDP/TURN topology and cached-token removal enforcement | Media maintainer + operator | Restrictive networks, revoke/rejoin/mute on devices | #79/#83/#101 |
| D13 open | Avatar/media provider, max dimensions/bytes and moderation handling | Product + media maintainer | Decode/upload/remove abuse fixtures and cost limits | #61 |
| D14 open | Push token ownership, event selection and notification retention | Product + backend/mobile maintainer | Permission denial, duplicate delivery, logout/token reassignment devices | #73 |
| D15 open | Freshness/stale/grant/revocation/reconnect thresholds | Product + realtime/security maintainer | Measured age/latency distributions under loss/jitter/clock skew and multiple instances; units milliseconds | #75/#85/#90/#95 and #98/#94 |
| D16 open | PTT/audio latency, interruption/background/battery acceptance | Product + media/mobile QA | Physical iOS/Android/Bluetooth trips, capture-stop timing, battery per hour | #79/#92/#99/#101/#103 |
| D17 open | Frame/CPU/memory/thermal and map/battery budgets | Mobile QA + product | Comparable device/route/duration builds with permissions/network recorded | #32/#88/#99/#103 |
| D18 open | Group/load/fanout envelope, provider spend and alert thresholds | Backend/operator + product | 2–20 intended members and controlled 50-member workload tests, actual billing forecasts | #104/#50; release #105 |
| D19 open | Backup mechanism, RPO/RTO and retention/key recovery | Operator + product | Independent restore, observed loss window/recovery minutes, counts/checksums and deletion reconciliation | #59 and release #105 |
| D20 open | Proximity beta launch or disabled build | Product + security/media QA | Same-trip-only discovery, removal/reconnect, sound behavior and real device controls | #101 then #105 |
| D21 proposed | Keep Apple design guidance scoped to native review; DaisyUI to compatible web surfaces | UI maintainer + product | #40 pin/license/skill review, brand tokens, accessibility and platform tests | #40 adoption then feature UI |

The runtime has structural bounds (ports, shutdown deadlines, schema frame sizes)
and the legacy telemetry grant lifetime. These are compatibility/resource defaults,
not approved tier limits or measured v2 latency/battery guarantees. No hosting
vendor, subscription price, launch date, retention period, free/paid cap or
performance threshold is silently selected by this register.

## Evidence procedure

Each measurement records commit/build, OS/device, fixture/group size, route and
duration, network conditions, units and pass/fail against a subsequently approved
threshold. Record a pilot observation separately from its acceptance budget.
Do not replace physical-device evidence with a simulator, pure schema test or
synthetic migration. Update this register with the deciding ticket and maintain
configuration/test plans together when a decision is approved.
