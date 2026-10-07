import { createCloudService } from '../src/cloud/cloudService';
import type { CloudProviders } from '../src/cloud/providers';
import type { CloudAuthSession, CloudSyncResult } from '../src/cloud/types';
import type { TripWithSpeedSamples } from '../src/domain/trip';

jest.mock('../src/database/tripRepository', () => ({}));
jest.mock('../src/utils/logging', () => ({ logAppWarning: jest.fn() }));

const trip = (id: string, deletedAt?: string): TripWithSpeedSamples => ({ id,
  startedAt: '2026-10-06', endedAt: '2026-10-06', totalDistanceMeters: 100,
  maxSpeedMps: 10, averageSpeedMps: 5, units: 'MPH', speedSamples: [], deletedAt,
  localUpdatedAt: '2026-10-06T12:00:00Z' });
const alice: CloudAuthSession = { userId: 'alice', email: null, accessToken: 'alice-token' };

const setup = (ownershipEnabled = true) => {
  let session: CloudAuthSession | null = alice;
  const sync = jest.fn<Promise<CloudSyncResult>, [unknown, Readonly<CloudAuthSession>]>().mockResolvedValue({ ok: true,
    syncedTripIds: ['owned', 'unclaimed'], deletedTripIds: [], restoredTrips: [trip('owned-restore'), trip('other-restore')], message: 'Synced' });
  const adapter = { auth: { isConfigured: () => true,
    getSession: jest.fn(async () => session),
    getProfile: jest.fn(async () => ({ userId: session?.userId, syncEnabled: true })),
    signInWithEmail: jest.fn(async () => { session = { ...alice, userId: 'bob', accessToken: 'bob-token' }; return session; }),
    signOut: jest.fn(async () => { session = null; }),
    upsertProfile: jest.fn(async () => ({ userId: 'alice', syncEnabled: true })),
  }, sync: { syncLocalChanges: sync, restoreCloudTrips: jest.fn(async () => [trip('owned-restore')]) }, social: {} } as unknown as CloudProviders;
  const operations = [ ['owned', 'sync_trip'], ['unclaimed', 'sync_trip'], ['deleted', 'delete_trip'], ['foreign', 'sync_trip'] ]
    .map(([entityId, operationType]) => ({ id: entityId, entityId, operationType }));
  const store = { getUnsyncedTrips: jest.fn(async () => [trip('owned'), trip('unclaimed'), trip('foreign'), trip('deleted', '2026-10-06')]),
    getPendingSyncOperations: jest.fn(async (_limit?: number | null) => operations),
    acknowledgeCloudSync: jest.fn(async (snapshots: TripWithSpeedSamples[], _operations: unknown[]) => snapshots.map((snapshot) => snapshot.id)),
    restoreCloudTrips: jest.fn(async () => 1) };
  const factory = jest.fn(async () => adapter);
  const service = createCloudService({ factory, isConfigured: () => true,
    store: store as unknown as NonNullable<Parameters<typeof createCloudService>[0]['store']>,
    ownership: ownershipEnabled ? { canUpload: async (id, userId) => userId === 'alice' && ['owned', 'deleted'].includes(id),
      canRestore: async (id, userId) => userId === 'alice' && id === 'owned-restore' } : undefined });
  return { service, sync, store, factory, adapter, setSession: (next: CloudAuthSession | null) => { session = next; } };
};

describe('owned provider seams and account-scoped backup', () => {
  it('does not load a provider or read local data in local-only mode', async () => {
    const factory = jest.fn();
    const service = createCloudService({ factory, isConfigured: () => false });
    await expect(service.auth.getSession()).resolves.toBeNull();
    await expect(service.syncLocalChanges()).resolves.toMatchObject({ ok: false });
    expect(factory).not.toHaveBeenCalled();
  });

  it('fails closed without a persisted adoption adapter, including legacy profiles with sync enabled', async () => {
    const { service, sync, store } = setup(false);
    await expect(service.syncLocalChanges()).resolves.toMatchObject({ ok: false, message: expect.stringContaining('account-owned') });
    expect(sync).not.toHaveBeenCalled();
    expect(store.acknowledgeCloudSync).not.toHaveBeenCalled();
  });

  it('uploads only adopted current-account records and acknowledges only matching successful mutations', async () => {
    const { service, sync, store } = setup();
    const result = await service.syncLocalChanges();
    expect(sync).toHaveBeenCalledWith({ trips: [trip('owned')], deletedTripIds: ['deleted'] }, alice);
    expect(Object.isFrozen(sync.mock.calls[0][1])).toBe(true);
    expect(result.syncedTripIds).toEqual(['owned']);
    expect(store.getPendingSyncOperations).toHaveBeenCalledWith(null);
    expect(store.getPendingSyncOperations.mock.invocationCallOrder[0]).toBeLessThan(store.getUnsyncedTrips.mock.invocationCallOrder[0]);
    expect(store.acknowledgeCloudSync).toHaveBeenCalledWith([trip('owned')], [expect.objectContaining({ entityId: 'owned', operationType: 'sync_trip' })]);
    expect(store.restoreCloudTrips).toHaveBeenCalledWith([trip('owned-restore')]);
  });

  it('does not apply a pending response after switching accounts', async () => {
    const { service, sync, store } = setup();
    let resolve!: (result: CloudSyncResult) => void;
    sync.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const pending = service.syncLocalChanges();
    while (!resolve) await Promise.resolve();
    await service.auth.signInWithEmail('bob@example.test', 'not-a-real-password');
    resolve({ ok: true, syncedTripIds: ['owned'], restoredTrips: [trip('owned-restore')], message: 'Synced' });
    await expect(pending).resolves.toMatchObject({ ok: false, message: expect.stringContaining('Account changed') });
    expect(store.acknowledgeCloudSync).not.toHaveBeenCalled();
    expect(store.restoreCloudTrips).not.toHaveBeenCalled();
  });

  it('allows only one outbound backup while pending and releases the guard after failure', async () => {
    const { service, sync, store } = setup();
    let fail!: (error: Error) => void;
    sync.mockImplementationOnce(() => new Promise((_done, reject) => { fail = reject; }));
    const pending = service.syncLocalChanges();
    while (!fail) await Promise.resolve();
    await expect(service.syncLocalChanges()).resolves.toMatchObject({ ok: false,
      message: expect.stringContaining('already in progress') });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(store.acknowledgeCloudSync).not.toHaveBeenCalled();
    fail(new Error('Synthetic network failure'));
    await expect(pending).resolves.toMatchObject({ ok: false });
    await expect(service.syncLocalChanges()).resolves.toMatchObject({ ok: true });
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('refuses upload and restore started while a deferred login is still changing accounts', async () => {
    const { service, adapter, sync, store, setSession } = setup();
    let finish!: () => void;
    jest.spyOn(adapter.auth, 'signInWithEmail').mockImplementation(async () => {
      await new Promise<void>((done) => { finish = done; });
      const bob = { ...alice, userId: 'bob', accessToken: 'bob-token' };
      setSession(bob);
      return bob;
    });
    const login = service.auth.signInWithEmail('bob@example.test', 'not-a-real-password');
    while (!finish) await Promise.resolve();
    await expect(service.syncLocalChanges()).resolves.toMatchObject({ ok: false,
      message: expect.stringContaining('in progress') });
    await expect(service.restoreCloudTrips()).resolves.toBe(0);
    expect(sync).not.toHaveBeenCalled();
    expect(adapter.sync.restoreCloudTrips).not.toHaveBeenCalled();
    expect(store.getUnsyncedTrips).not.toHaveBeenCalled();
    finish();
    await login;
  });

  it('rejects stale preflight session captured before login finishes without dispatching an upload', async () => {
    const { service, adapter, sync, store } = setup();
    let reads = 0;
    jest.spyOn(adapter.auth, 'getSession').mockImplementation(async () => {
      reads++;
      if (reads === 2) {
        await service.auth.signInWithEmail('bob@example.test', 'not-a-real-password');
        return alice; // Delayed getSession result belongs to the previous account.
      }
      return alice;
    });
    await expect(service.syncLocalChanges()).resolves.toMatchObject({ ok: false,
      message: expect.stringContaining('Account changed') });
    expect(sync).not.toHaveBeenCalled();
    expect(store.acknowledgeCloudSync).not.toHaveBeenCalled();
  });

  it('releases the auth transition guard after a failed login while retaining the original account', async () => {
    const { service, adapter, sync } = setup();
    jest.spyOn(adapter.auth, 'signInWithEmail').mockRejectedValue(new Error('Synthetic login failure'));
    await expect(service.auth.signInWithEmail('bob@example.test', 'not-a-real-password')).rejects.toThrow('Synthetic login failure');
    await expect(service.syncLocalChanges()).resolves.toMatchObject({ ok: true });
    expect(sync.mock.calls[0][1].userId).toBe('alice');
  });

  it('passes confirmed deletion and captured prior uploads to the repository for atomic supersession', async () => {
    const { service, sync, store } = setup();
    store.getPendingSyncOperations.mockResolvedValue([
      { id: 'old-upload', entityId: 'deleted', operationType: 'sync_trip' },
      { id: 'delete', entityId: 'deleted', operationType: 'delete_trip' },
    ]);
    sync.mockResolvedValue({ ok: true, syncedTripIds: [], deletedTripIds: ['deleted'], restoredTrips: [], message: 'Deleted' });
    await service.syncLocalChanges();
    expect(store.acknowledgeCloudSync).toHaveBeenCalledWith([trip('deleted', '2026-10-06')], [
      { id: 'old-upload', entityId: 'deleted', operationType: 'sync_trip' },
      { id: 'delete', entityId: 'deleted', operationType: 'delete_trip' },
    ]);
  });

  it('retains an upload as pending when repository compare-and-set detects a newer local version', async () => {
    const { service, store } = setup();
    store.acknowledgeCloudSync.mockResolvedValue([]);
    const result = await service.syncLocalChanges();
    expect(result.syncedTripIds).toEqual([]);
  });

  it('does not restore pending remote history after signout/account change', async () => {
    const { service, adapter, store } = setup();
    let resolve!: (value: TripWithSpeedSamples[]) => void;
    adapter.sync.restoreCloudTrips = jest.fn(() => new Promise((done) => { resolve = done; }));
    const pending = service.restoreCloudTrips();
    while (!resolve) await Promise.resolve();
    await service.auth.signOut();
    resolve([trip('owned-restore')]);
    await expect(pending).resolves.toBe(0);
    expect(store.restoreCloudTrips).not.toHaveBeenCalled();
  });

  it('does not auto-upload personal history during signup onboarding', async () => {
    const { service, sync } = setup();
    await service.completeCloudOnboarding({ username: 'alice', displayName: 'Alice', syncEnabled: true, leaderboardOptIn: false, nearbyOptIn: false });
    expect(sync).not.toHaveBeenCalled();
  });
});
