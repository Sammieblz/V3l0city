import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyRehearsalState, rehearseLegacyMigration, type LegacyArchive } from './legacy-rehearsal';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const ownedAlice = '33333333-3333-4333-8333-333333333333';
const ownedBob = '44444444-4444-4444-8444-444444444444';
const mapping = [{ legacyId: alice, ownedId: ownedAlice, reverificationConfirmed: true },
  { legacyId: bob, ownedId: ownedBob, reverificationConfirmed: true }];
const fixture: LegacyArchive = {
  formatVersion: 1,
  identities: [{ legacyId: alice, email: 'alice@example.test', verifiedAt: '2026-10-01T12:00:00Z' },
    { legacyId: bob, email: 'bob@example.test', verifiedAt: null }],
  rows: [
    { id: 'friendships:blocked', ownerLegacyId: alice, relatedLegacyIds: [bob], payload: { status: 'blocked' } },
    { id: 'cloud_trips:deleted', ownerLegacyId: bob, relatedLegacyIds: [], payload: { deleted_at: '2026-10-02T12:00:00Z', samples: [] } },
    { id: 'legal_acceptances:alice', ownerLegacyId: alice, relatedLegacyIds: [], payload: { policy_version: 'v1', accepted_at: '2026-10-01T12:00:00Z' } },
    { id: 'profiles:bob', ownerLegacyId: bob, relatedLegacyIds: [], payload: { sync_enabled: false, nearby_opt_in: false } },
    { id: 'cloud_trip_samples:retained', ownerLegacyId: alice, relatedLegacyIds: [], payload: { sequence: 1, quality_reasons: ['good_gps'], speed_mps: 2.5 } },
  ],
};

test('synthetic archive preserves blocks, deletion and consent with counts/checksums and safe rerun', () => {
  const original = JSON.stringify(fixture);
  const result = rehearseLegacyMigration(fixture, mapping);
  assert.deepEqual(result.counts, { identities: 2, rows: 5 });
  assert.equal(result.state.rows['friendships:blocked'].ownerId, ownedAlice);
  assert.deepEqual(result.state.rows['friendships:blocked'].relatedUserIds, [ownedBob]);
  assert.equal(result.state.rows['cloud_trips:deleted'].payload.deleted_at, '2026-10-02T12:00:00Z');
  assert.equal(result.state.rows['profiles:bob'].payload.sync_enabled, false);
  assert.equal(JSON.stringify(fixture), original);
  const rerun = rehearseLegacyMigration(fixture, mapping, result.state);
  assert.equal(rerun.alreadyImported, true);
  assert.equal(rerun.state, result.state);
  const reordered = rehearseLegacyMigration({ ...fixture, rows: [...fixture.rows].reverse() }, [...mapping].reverse());
  assert.equal(reordered.sourceChecksum, result.sourceChecksum);
  assert.equal(reordered.targetChecksum, result.targetChecksum);
});

test('mapping failures, credential exports, conflicts and dangling links leave previous state untouched', () => {
  const previous = emptyRehearsalState();
  for (const input of [
    { ...fixture, rows: [...fixture.rows, fixture.rows[0]] },
    { ...fixture, rows: [{ ...fixture.rows[0], relatedLegacyIds: [ownedBob] }] },
    { ...fixture, rows: [{ ...fixture.rows[0], payload: { encrypted_password: 'unsupported-hash' } }] },
  ]) assert.throws(() => rehearseLegacyMigration(input, mapping, previous));
  assert.throws(() => rehearseLegacyMigration(fixture, mapping.slice(1), previous));
  assert.throws(() => rehearseLegacyMigration(fixture, mapping.map((item) => ({ ...item, reverificationConfirmed: false })), previous));
  assert.throws(() => rehearseLegacyMigration(fixture, mapping.map((item) => ({ ...item, ownedId: ownedAlice })), previous));
  assert.deepEqual(previous, emptyRehearsalState());
  const result = rehearseLegacyMigration(fixture, mapping);
  const before = JSON.stringify(result.state);
  assert.throws(() => rehearseLegacyMigration({ ...fixture, rows: [{ ...fixture.rows[0], payload: { status: 'accepted' } }] }, mapping, result.state));
  assert.equal(JSON.stringify(result.state), before);
  const corruptedIdentity = JSON.parse(before) as typeof result.state;
  corruptedIdentity.identities[ownedAlice].email = 'different@example.test';
  assert.throws(() => rehearseLegacyMigration(fixture, mapping, corruptedIdentity), /reconciliation/);
  result.state.rows['friendships:blocked'].payload.status = 'accepted';
  assert.throws(() => rehearseLegacyMigration(fixture, mapping, result.state), /reconciliation/);
});
