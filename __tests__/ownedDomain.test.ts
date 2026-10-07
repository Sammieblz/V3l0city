import { canShareLocation, createTravelSession, reduceTravelSession, type ConnectedTripSnapshot } from '../src/domain/connectedTrip';
import { adoptPersonalRecordings, canBackUpRecording, planLegacyRecordingMigration } from '../src/domain/recordingOwnership';
import type { Trip } from '../src/domain/trip';

const personal: Trip = { id: 'legacy-local-id', startedAt: '2026-10-06T12:00:00Z',
  endedAt: '', totalDistanceMeters: 120, maxSpeedMps: 10, averageSpeedMps: 4,
  units: 'MPH', recordStatus: 'draft' };
const snapshot: ConnectedTripSnapshot = { tripId: 'shared-trip', userId: 'alice',
  revision: 1, state: 'active', membership: 'joined', role: 'member' };
const grant = { tripId: snapshot.tripId, userId: 'alice', connectionEpoch: 'epoch-a', expiresAtMs: 2000 };

describe('personal recording and connected authority boundaries', () => {
  it('never grants location sharing from a cached active membership', () => {
    const cached = reduceTravelSession(createTravelSession(personal), { type: 'cached-snapshot', snapshot });
    expect(canShareLocation(cached, 'alice', 'epoch-a', 1000)).toBe(false);
    expect(cached.personalRecording).toBe(personal);
  });

  it('retains join consent through lobby and requires current server grant, account and epoch', () => {
    let state = reduceTravelSession(createTravelSession(personal), { type: 'join-requested' });
    state = reduceTravelSession(state, { type: 'server-snapshot', snapshot: { ...snapshot, state: 'lobby' }, grant: null, consentGeneration: state.consentGeneration });
    state = reduceTravelSession(state, { type: 'server-snapshot', snapshot: { ...snapshot, revision: 2 }, grant, consentGeneration: state.consentGeneration });
    expect(canShareLocation(state, 'alice', 'epoch-a', 1000)).toBe(true);
    expect(canShareLocation(state, 'bob', 'epoch-a', 1000)).toBe(false);
    expect(canShareLocation(state, 'alice', 'old-epoch', 1000)).toBe(false);
    expect(canShareLocation(state, 'alice', 'epoch-a', 2000)).toBe(false);
    expect(canShareLocation(state, 'alice', 'epoch-a', NaN)).toBe(false);
  });

  it.each(['leave-requested', 'end-requested', 'access-revoked', 'disconnected'] as const)(
    '%s invalidates live sharing without changing the personal draft', (type) => {
      const state = reduceTravelSession(reduceTravelSession(createTravelSession(personal), { type: 'join-requested' }),
        { type: 'server-snapshot', snapshot, grant, consentGeneration: 1 });
      const next = reduceTravelSession(state, { type });
      expect(next.personalRecording).toBe(personal);
      expect(next.sharingGrant).toBeNull();
      expect(canShareLocation(next, 'alice', 'epoch-a', 1000)).toBe(false);
    });

  it('ignores older revisions and rejects a late active grant after authoritative trip end', () => {
    let state = reduceTravelSession(createTravelSession(personal), { type: 'join-requested' });
    state = reduceTravelSession(state, { type: 'server-snapshot', snapshot: { ...snapshot, state: 'ended', revision: 3 }, grant: null, consentGeneration: state.consentGeneration });
    const next = reduceTravelSession(state, { type: 'server-snapshot', snapshot: { ...snapshot, revision: 4 }, grant, consentGeneration: state.consentGeneration });
    expect(next).toBe(state);
    expect(canShareLocation(next, 'alice', 'epoch-a', 1000)).toBe(false);
  });

  it('retains authenticated terminal and revision facts through stale cache, rejoin and trip switching', () => {
    let state = reduceTravelSession(createTravelSession(personal), { type: 'join-requested' });
    state = reduceTravelSession(state, { type: 'server-snapshot', snapshot: { ...snapshot, state: 'ended', revision: 3 }, grant: null, consentGeneration: state.consentGeneration });
    state = reduceTravelSession(state, { type: 'cached-snapshot', snapshot });
    expect(state.connected).toMatchObject({ state: 'ended', revision: 3 });
    state = reduceTravelSession(state, { type: 'cached-snapshot', snapshot: { ...snapshot, tripId: 'other-trip' } });
    state = reduceTravelSession(state, { type: 'join-requested' });
    const next = reduceTravelSession(state, { type: 'server-snapshot', snapshot: { ...snapshot, revision: 2 }, grant, consentGeneration: state.consentGeneration });
    expect(next).toBe(state);
    expect(canShareLocation(next, 'alice', 'epoch-a', 1000)).toBe(false);
    expect(next.personalRecording).toBe(personal);
  });

  it('privacy disable rejects an identical grant replay, even under the renewed consent generation', () => {
    let state = reduceTravelSession(reduceTravelSession(createTravelSession(personal), { type: 'join-requested' }),
      { type: 'server-snapshot', snapshot, grant, consentGeneration: 1 });
    state = reduceTravelSession(state, { type: 'sharing-preference', enabled: false });
    state = reduceTravelSession(state, { type: 'sharing-preference', enabled: true });
    state = reduceTravelSession(state, { type: 'server-snapshot', snapshot, grant, consentGeneration: state.consentGeneration });
    expect(canShareLocation(state, 'alice', 'epoch-a', 1000)).toBe(false);
    state = reduceTravelSession(state, { type: 'server-snapshot', snapshot,
      grant: { ...grant, expiresAtMs: 3000 }, consentGeneration: state.consentGeneration });
    expect(canShareLocation(state, 'alice', 'epoch-a', 1000)).toBe(true);
  });

  it('rejects a previously unseen grant returned by a request made before privacy changed', () => {
    let state = reduceTravelSession(createTravelSession(personal), { type: 'join-requested' });
    const requestGeneration = state.consentGeneration;
    state = reduceTravelSession(state, { type: 'sharing-preference', enabled: false });
    state = reduceTravelSession(state, { type: 'sharing-preference', enabled: true });
    state = reduceTravelSession(state, { type: 'server-snapshot', snapshot, grant, consentGeneration: requestGeneration });
    expect(canShareLocation(state, 'alice', 'epoch-a', 1000)).toBe(false);
    state = reduceTravelSession(state, { type: 'server-snapshot', snapshot,
      grant: { ...grant, expiresAtMs: 3000 }, consentGeneration: state.consentGeneration });
    expect(canShareLocation(state, 'alice', 'epoch-a', 1000)).toBe(true);
  });
});

describe('non-destructive migration and explicit personal ownership', () => {
  const records = [ { recordingId: 'local-1', legacyOwnerId: null },
    { recordingId: 'old-alice-trip', legacyOwnerId: 'legacy-alice' },
    { recordingId: 'unknown-account-trip', legacyOwnerId: 'unmapped' } ];

  it('preserves local IDs, leaves unmapped records unclaimed and does not grant backup consent', () => {
    const before = JSON.stringify(records);
    const plan = planLegacyRecordingMigration(records, { 'legacy-alice': 'alice' });
    expect(JSON.stringify(records)).toBe(before);
    expect(plan.map((record) => record.recordingId)).toEqual(records.map((record) => record.recordingId));
    expect(plan.map((record) => record.ownerUserId)).toEqual([null, 'alice', null]);
    expect(plan.every((record) => !canBackUpRecording(record, 'alice'))).toBe(true);
  });

  it('requires selected-record consent and rejects account-switch adoption atomically', () => {
    const plan = planLegacyRecordingMigration(records, { 'legacy-alice': 'alice' });
    const claimed = adoptPersonalRecordings(plan, ['local-1'], 'alice', '2026-10-06T12:00:00Z');
    expect(canBackUpRecording(claimed[0], 'alice')).toBe(true);
    expect(canBackUpRecording(claimed[0], 'bob')).toBe(false);
    expect(plan[0].ownerUserId).toBeNull();
    expect(() => adoptPersonalRecordings(claimed, ['local-1', 'unknown-account-trip'], 'bob', '2026-10-06T12:00:00Z')).toThrow(/another account/);
    expect(claimed[2].ownerUserId).toBeNull();
  });

  it('rejects duplicate IDs, ambiguous identity maps and invalid consent', () => {
    expect(() => planLegacyRecordingMigration([records[0], records[0]], {})).toThrow(/unique/);
    expect(() => planLegacyRecordingMigration(records, { a: 'alice', b: 'alice' })).toThrow(/one-to-one/);
    expect(() => adoptPersonalRecordings(planLegacyRecordingMigration(records, {}), ['absent'], 'alice', '2026-10-06')).toThrow(/existing/);
    expect(() => adoptPersonalRecordings(planLegacyRecordingMigration(records, {}), ['local-1'], 'alice', '')).toThrow(/consent/);
  });

  it('does not treat inherited object keys as confirmed identities', () => {
    expect(planLegacyRecordingMigration([{ recordingId: 'safe', legacyOwnerId: 'constructor' }], {})[0].ownerUserId).toBeNull();
  });
});
