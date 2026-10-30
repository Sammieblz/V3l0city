import { mkdtempSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCloudService } from '../src/cloud/cloudService';
import type { CloudProviders } from '../src/cloud/providers';
import type { CloudAuthSession, CloudSyncResult } from '../src/cloud/types';
import { createConnectedCache, type CacheLease } from '../src/database/connectedCache';
import { migrateLocalDatabase } from '../src/database/sqliteMigrations';
import * as repository from '../src/database/tripRepository';
import { historicalPersonalSchema, realSqlite, snapshotPersonal } from '../test-support/sqliteFixture';

let mockSqlite: ReturnType<typeof realSqlite>;
jest.mock('../src/database/database', () => ({ getDatabase: () => mockSqlite.port }));
jest.mock('../src/utils/logging', () => ({ logAppWarning: jest.fn() }));

const alice: CloudAuthSession = { userId: '11111111-1111-4111-8111-111111111111', email: null, accessToken: 'alice-credential' };
const bob: CloudAuthSession = { userId: '22222222-2222-4222-8222-222222222222', email: null, accessToken: 'bob-credential' };
const time = Date.parse('2026-10-28T12:00:00.000Z');
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('auth boundaries integrated with durable connected SQLite cache', () => {
  let directory: string;
  let filename: string;
  let cache: ReturnType<typeof createConnectedCache>;
  let personal: ReturnType<typeof snapshotPersonal>;
  let lease: CacheLease;

  const seedCache = (userId = alice.userId) => {
    const current = cache.activate({ provider: 'owned', userId });
    cache.apply(current, [{ kind: 'profile', id: userId, revision: 1,
      data: { id: userId, handle: 'driver', displayName: 'Driver', avatarUrl: null, revision: 1 },
      expiresAtMs: time + 60000 }], { stream: 'profiles', cursor: 'cursor_1' });
    cache.enqueue(current, { idempotencyKey: '33333333-3333-4333-8333-333333333333', operation: 'profile.patch', payload: { displayName: 'Queued driver' } });
    return current;
  };
  const unchangedPersonal = () => expect(snapshotPersonal(mockSqlite.connection).before).toEqual(personal.before);
  const rawCount = () => mockSqlite.connection.prepare('SELECT count(*) AS count FROM connected_cache_entities').get();
  const expectCleared = () => {
    expect(rawCount()).toEqual({ count: 0 });
    expect(mockSqlite.connection.prepare('SELECT count(*) AS count FROM connected_cache_sync_state').get()).toEqual({ count: 0 });
    expect(mockSqlite.connection.prepare('SELECT state FROM connected_outbox').all()).toEqual([{ state: 'blocked' }]);
    expect(() => cache.get(lease, 'profile', alice.userId)).toThrow(expect.objectContaining({ code: 'stale_cache_scope' }));
    unchangedPersonal();
  };
  const setup = (options: { configured?: boolean; reconcile?: (userId: string | null, stillCurrent: () => boolean) => Promise<void> } = {}) => {
    let session: CloudAuthSession | null = alice;
    const adapter = { auth: {
      isConfigured: () => true,
      getSession: jest.fn(async () => session),
      getProfile: jest.fn(async () => ({ userId: session?.userId, syncEnabled: true })),
      signInWithEmail: jest.fn(async () => { session = bob; return bob; }),
      signUpWithEmail: jest.fn(async () => ({ email: 'bob@example.test', emailConfirmationRequired: false, session: bob })),
      signOut: jest.fn(async () => { session = null; }),
      upsertProfile: jest.fn(),
    }, sync: { syncLocalChanges: jest.fn(), restoreCloudTrips: jest.fn() }, social: {} } as unknown as CloudProviders;
    const factory = jest.fn(async () => adapter);
    const store = { ...repository,
      acknowledgeCloudSync: jest.fn(repository.acknowledgeCloudSync), restoreCloudTrips: jest.fn(repository.restoreCloudTrips) };
    const service = createCloudService({ factory, isConfigured: () => options.configured ?? true, store,
      ownership: { canUpload: async () => true, canRestore: async () => true },
      invalidateConnectedCache: () => cache.clearActive(),
      reconcileConnectedCache: options.reconcile ?? ((userId, stillCurrent) => {
        if (stillCurrent()) cache.reconcile(userId ? { provider: 'owned', userId } : null);
      }),
    });
    return { service, adapter, factory, store, setSession: (next: CloudAuthSession | null) => { session = next; }, getSession: () => session };
  };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'v3l0city-auth-cache-'));
    filename = join(directory, 'cache.sqlite');
    mockSqlite = realSqlite(filename);
    historicalPersonalSchema(mockSqlite.port, { latest: true });
    migrateLocalDatabase(mockSqlite.port);
    personal = snapshotPersonal(mockSqlite.connection);
    cache = createConnectedCache(mockSqlite.port, { now: () => time });
    lease = seedCache();
  });
  afterEach(() => {
    if (mockSqlite.connection.open) mockSqlite.connection.close();
    for (const name of readdirSync(directory)) {
      expect(['cache.sqlite', 'cache.sqlite-journal', 'cache.sqlite-wal', 'cache.sqlite-shm']).toContain(name);
      rmSync(join(directory, name), { force: true });
    }
    rmdirSync(directory);
  });

  it('clears display replicas and cursors on logout while retaining blocked connected edits and all personal data', async () => {
    const { service, adapter, getSession } = setup();
    await service.auth.signOut();
    expect(adapter.auth.signOut).toHaveBeenCalledTimes(1); expect(getSession()).toBeNull();
    expectCleared();
    expect(() => cache.apply(lease, [])).toThrow(expect.objectContaining({ code: 'stale_cache_scope' }));
  });

  it('still clears credentials when SQLite cleanup fails and poisons old leases despite transaction rollback', async () => {
    const { service, adapter, getSession } = setup();
    mockSqlite.connection.exec(`CREATE TRIGGER fail_cache_cleanup BEFORE DELETE ON connected_cache_entities BEGIN SELECT RAISE(ABORT,'private SQL detail'); END`);
    await expect(service.auth.signOut()).rejects.toMatchObject({ code: 'storage_unavailable' });
    expect(adapter.auth.signOut).toHaveBeenCalledTimes(1); expect(getSession()).toBeNull();
    expect(rawCount()).toEqual({ count: 1 }); // Failed deletion rolled back, not silently discarded.
    expect(() => cache.get(lease, 'profile', alice.userId)).toThrow(expect.objectContaining({ code: 'stale_cache_scope' }));
    const separateFacade = createConnectedCache(mockSqlite.port, { now: () => time });
    expect(() => separateFacade.apply(lease, [])).toThrow(expect.objectContaining({ code: 'stale_cache_scope' }));
    unchangedPersonal();
    mockSqlite.connection.exec('DROP TRIGGER fail_cache_cleanup');
    await service.auth.signOut(); expectCleared();
  });

  it('blocks a new sign-in before provider dispatch if old-account cache cleanup cannot commit', async () => {
    const { service, adapter, getSession } = setup();
    mockSqlite.connection.exec(`CREATE TRIGGER fail_cache_cleanup BEFORE DELETE ON connected_cache_entities BEGIN SELECT RAISE(ABORT,'cleanup refused'); END`);
    await expect(service.auth.signInWithEmail('bob@example.test', 'fixture-password')).rejects.toMatchObject({ code: 'storage_unavailable' });
    expect(adapter.auth.signInWithEmail).not.toHaveBeenCalled(); expect(getSession()).toEqual(alice);
    expect(() => cache.get(lease, 'profile', alice.userId)).toThrow(expect.objectContaining({ code: 'stale_cache_scope' }));
    unchangedPersonal();
    mockSqlite.connection.exec('DROP TRIGGER fail_cache_cleanup');
    await service.auth.signInWithEmail('bob@example.test', 'fixture-password'); expectCleared();
  });

  it.each([bob, null])('reconciles the first observed session after reopening a database with another active account', async (observed) => {
    mockSqlite.connection.close(); mockSqlite = realSqlite(filename); migrateLocalDatabase(mockSqlite.port);
    cache = createConnectedCache(mockSqlite.port, { now: () => time });
    expect(rawCount()).toEqual({ count: 1 });
    const { service, setSession } = setup(); setSession(observed);
    await expect(service.auth.getSession()).resolves.toEqual(observed);
    expectCleared();
  });

  it('preserves the same account display cache and cursor across a credential refresh', async () => {
    const { service, setSession } = setup();
    await service.auth.getSession(); setSession({ ...alice, accessToken: 'refreshed-credential' });
    const received = await service.auth.getSession();
    expect(received?.accessToken).toBe('refreshed-credential'); expect(Object.isFrozen(received)).toBe(true);
    expect(cache.get(lease, 'profile', alice.userId)?.authority).toBe('display-only');
    expect(cache.cursor(lease, 'profiles')).toBe('cursor_1');
    expect(mockSqlite.connection.prepare('SELECT state FROM connected_outbox').all()).toEqual([{ state: 'queued' }]);
    unchangedPersonal();
  });

  it('clears persisted connected scope in local-only mode without loading a cloud provider', async () => {
    const { service, factory } = setup({ configured: false });
    await expect(service.auth.getSession()).resolves.toBeNull();
    expect(factory).not.toHaveBeenCalled(); expectCleared();
  });

  it('ignores a delayed old session response after sign-in without clearing the newly active account cache', async () => {
    const entered = deferred<void>(); const response = deferred<CloudAuthSession | null>();
    const { service, adapter } = setup();
    jest.spyOn(adapter.auth, 'getSession').mockImplementationOnce(async () => { entered.resolve(); return response.promise; });
    const pending = service.auth.getSession(); await entered.promise;
    await service.auth.signInWithEmail('bob@example.test', 'fixture-password');
    const bobLease = seedCache(bob.userId);
    response.resolve(alice); await expect(pending).resolves.toBeNull();
    expect(cache.get(bobLease, 'profile', bob.userId)).not.toBeNull();
    expect(() => cache.get(lease, 'profile', alice.userId)).toThrow(expect.objectContaining({ code: 'stale_cache_scope' }));
    unchangedPersonal();
  });

  it('does not perform delayed reconciliation SQL after an overlapping sign-in invalidated its observation', async () => {
    const entered = deferred<void>(); const release = deferred<void>();
    const { service } = setup({ reconcile: async (userId, stillCurrent) => {
      entered.resolve(); await release.promise;
      if (stillCurrent()) cache.reconcile(userId ? { provider: 'owned', userId } : null);
    } });
    const pending = service.auth.getSession(); await entered.promise;
    await service.auth.signInWithEmail('bob@example.test', 'fixture-password'); const bobLease = seedCache(bob.userId);
    release.resolve(); await expect(pending).resolves.toBeNull();
    expect(cache.get(bobLease, 'profile', bob.userId)).not.toBeNull(); unchangedPersonal();
  });

  it('rejects an older concurrent lookup after a newer lookup observed a different account', async () => {
    const entered = deferred<void>(); const response = deferred<CloudAuthSession | null>();
    const { service, adapter, setSession } = setup();
    jest.spyOn(adapter.auth, 'getSession').mockImplementationOnce(async () => { entered.resolve(); return response.promise; });
    const older = service.auth.getSession(); await entered.promise;
    setSession(bob); await expect(service.auth.getSession()).resolves.toEqual(bob);
    const bobLease = seedCache(bob.userId);
    response.resolve(alice); await expect(older).resolves.toBeNull();
    expect(cache.get(bobLease, 'profile', bob.userId)).not.toBeNull(); unchangedPersonal();
  });

  it('rejects a late backup acknowledgement after even a failed account transition and leaves personal rows untouched', async () => {
    const entered = deferred<void>(); const response = deferred<CloudSyncResult>();
    const { service, adapter, store } = setup();
    jest.spyOn(adapter.sync, 'syncLocalChanges').mockImplementation(async () => { entered.resolve(); return response.promise; });
    jest.spyOn(adapter.auth, 'signInWithEmail').mockRejectedValue(new Error('Fixture login refused'));
    const pending = service.syncLocalChanges(); await entered.promise;
    await expect(service.auth.signInWithEmail('bob@example.test', 'fixture-password')).rejects.toThrow('Fixture login refused');
    response.resolve({ ok: true, syncedTripIds: [], deletedTripIds: ['personal-deleted'], restoredTrips: [], message: 'Server committed' });
    await expect(pending).resolves.toMatchObject({ ok: false, message: expect.stringContaining('Account changed') });
    expect(store.acknowledgeCloudSync).not.toHaveBeenCalled(); expect(store.restoreCloudTrips).not.toHaveBeenCalled();
    expectCleared();
  });

  it('does not restore a late remote result after logout while keeping existing personal recordings recoverable', async () => {
    const entered = deferred<void>(); const response = deferred<Awaited<ReturnType<typeof repository.getUnsyncedTrips>>>();
    const { service, adapter, store } = setup();
    jest.spyOn(adapter.sync, 'restoreCloudTrips').mockImplementation(async () => { entered.resolve(); return response.promise; });
    const pending = service.restoreCloudTrips(); await entered.promise;
    await service.auth.signOut(); response.resolve([{ id: 'late-foreign-recording', startedAt: '2026-10-28T00:00:00Z', endedAt: '2026-10-28T00:00:01Z',
      totalDistanceMeters: 1, maxSpeedMps: 1, averageSpeedMps: 1, units: 'MPH', speedSamples: [], recordStatus: 'completed' }]);
    await expect(pending).resolves.toBe(0); expect(store.restoreCloudTrips).not.toHaveBeenCalled(); expectCleared();
  });
});
