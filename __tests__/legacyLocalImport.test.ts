import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SqlitePort } from '../src/database/sqlitePort';
import { migrateLocalDatabase } from '../src/database/sqliteMigrations';
import { importLegacyLocalStorage, LEGACY_PREFS_KEY, LEGACY_TRIPS_KEY, type LegacyStoragePort } from '../src/database/legacyLocalImport';
import { getPreferences, savePreferences, type Preferences } from '../src/database/preferencesRepository';
import { realSqlite, historicalPersonalSchema } from '../test-support/sqliteFixture';

let mockPort: SqlitePort;
jest.mock('../src/database/database', () => ({ getDatabase: () => mockPort }));

const now = '2026-10-28T00:00:00.000Z';
const preferences: Preferences = { units: 'MPH', mountIndex: 2, autoStart: true, autoSave: false,
  orientationMode: 'landscape', themePreference: 'dark' };
const trip = (id = 'legacy-trip') => ({ id, startedAt: '2026-10-01T00:00:00.000Z', endedAt: '2026-10-01T00:00:10.000Z',
  totalDistanceMeters: 100, maxSpeedMps: 20, averageSpeedMps: 10, units: 'MPH', mountLabel: 'right' });
const digest = async (raw: string) => createHash('sha256').update(raw).digest('hex');
function legacyStorage(values: Record<string, string> = {}) {
  const data = new Map(Object.entries(values));
  const storage: jest.Mocked<LegacyStoragePort> = {
    getItem: jest.fn(async (key) => data.get(key) ?? null),
    removeItem: jest.fn(async (key) => { data.delete(key); }),
  };
  return { data, storage };
}

describe('legacy import and current preference protection on actual SQLite', () => {
  let directory: string;
  let filename: string;
  let database: ReturnType<typeof realSqlite>;
  const receipts = () => database.connection.prepare('SELECT * FROM local_import_receipts ORDER BY source_key').all();
  const count = (table: string) => (database.connection.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  const importSource = (storage: LegacyStoragePort) => importLegacyLocalStorage(mockPort, storage, { digest, now: () => now });
  const reopen = () => { database.connection.close(); database = realSqlite(filename); mockPort = database.port; migrateLocalDatabase(mockPort, now); };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'v3l0city-legacy-import-'));
    filename = join(directory, 'legacy.sqlite');
    database = realSqlite(filename); mockPort = database.port;
  });
  afterEach(() => {
    if (database.connection.open) database.connection.close();
    // Only remove files inside the unique directory created by this fixture.
    for (const name of readdirSync(directory)) {
      expect(['legacy.sqlite', 'legacy.sqlite-journal', 'legacy.sqlite-wal', 'legacy.sqlite-shm']).toContain(name);
      rmSync(join(directory, name), { force: true });
    }
    rmdirSync(directory);
  });

  it('imports valid preferences/trips with unclaimed ownership and durable hash-only receipts before removing keys', async () => {
    migrateLocalDatabase(mockPort, now);
    const rawPreferences = JSON.stringify(preferences); const rawTrips = JSON.stringify([trip()]);
    const source = legacyStorage({ [LEGACY_PREFS_KEY]: rawPreferences, [LEGACY_TRIPS_KEY]: rawTrips });
    source.storage.removeItem.mockImplementation(async (key) => {
      expect(database.connection.prepare('SELECT source_digest FROM local_import_receipts WHERE source_key=?').get(key))
        .toEqual({ source_digest: await digest(source.data.get(key)!) });
      source.data.delete(key);
    });
    expect(await importSource(source.storage)).toEqual([
      { source: 'preferences', status: 'imported', importedRows: 1 }, { source: 'trips', status: 'imported', importedRows: 1 },
    ]);
    expect(await getPreferences()).toEqual(preferences);
    expect(source.data.size).toBe(0);
    expect(database.connection.prepare('SELECT * FROM recording_ownership').get()).toEqual({
      recording_id: 'legacy-trip', owner_provider: null, owner_user_id: null, adoption_consent_at: null,
    });
    expect(count('sync_outbox')).toBe(0);
    const savedReceipts = receipts();
    expect(savedReceipts).toEqual([
      { source_key: LEGACY_PREFS_KEY, source_digest: await digest(rawPreferences), imported_at: now },
      { source_key: LEGACY_TRIPS_KEY, source_digest: await digest(rawTrips), imported_at: now },
    ]);
    expect(JSON.stringify(savedReceipts)).not.toContain('mountIndex');
    expect(JSON.stringify(savedReceipts)).not.toContain('legacy-trip');
    reopen(); expect(receipts()).toEqual(savedReceipts);
    expect(await importSource(source.storage)).toEqual([{ source: 'preferences', status: 'absent' }, { source: 'trips', status: 'absent' }]);
  });

  it('retries failed cleanup after reopen without reimporting or overwriting a later explicit preference edit', async () => {
    migrateLocalDatabase(mockPort, now);
    const source = legacyStorage({ [LEGACY_PREFS_KEY]: JSON.stringify(preferences) });
    source.storage.removeItem.mockRejectedValueOnce(new Error('AsyncStorage cleanup unavailable'));
    expect((await importSource(source.storage))[0]).toMatchObject({ status: 'retained', code: 'storage_unavailable' });
    expect(receipts()).toHaveLength(1); expect(source.data.has(LEGACY_PREFS_KEY)).toBe(true);
    const explicit: Preferences = { ...preferences, units: 'km/h', mountIndex: 1, themePreference: 'light' };
    await savePreferences(explicit); reopen();
    expect((await importSource(source.storage))[0]).toEqual({ source: 'preferences', status: 'imported', importedRows: 0 });
    expect(await getPreferences()).toEqual(explicit);
    expect(receipts()).toHaveLength(1); expect(source.data.has(LEGACY_PREFS_KEY)).toBe(false);
  });

  it('rejects a changed source digest after a receipt and preserves its new raw source', async () => {
    migrateLocalDatabase(mockPort, now);
    const source = legacyStorage({ [LEGACY_TRIPS_KEY]: JSON.stringify([trip()]) });
    source.storage.removeItem.mockRejectedValueOnce(new Error('cleanup failed'));
    await importSource(source.storage);
    source.data.set(LEGACY_TRIPS_KEY, JSON.stringify([trip('different-trip')]));
    expect((await importSource(source.storage))[1]).toEqual({ source: 'trips', status: 'retained', code: 'legacy_import_conflict' });
    expect(source.data.has(LEGACY_TRIPS_KEY)).toBe(true);
    expect(database.connection.prepare('SELECT id FROM trips').all()).toEqual([{ id: 'legacy-trip' }]);
    expect(receipts()).toHaveLength(1);
  });

  it.each([
    ['malformed JSON', '{bad'],
    ['unknown credential fields', JSON.stringify([{ ...trip(), accessToken: 'must-never-import' }])],
    ['invalid ISO timestamp', JSON.stringify([{ ...trip(), startedAt: 'yesterday' }])],
    ['negative duration', JSON.stringify([{ ...trip(), endedAt: '2026-09-01T00:00:00.000Z' }])],
    ['negative measurement', JSON.stringify([{ ...trip(), totalDistanceMeters: -1 }])],
    ['duplicate IDs', JSON.stringify([trip(), trip()])],
  ])('retains %s without a receipt or partial rows', async (_name, raw) => {
    migrateLocalDatabase(mockPort, now);
    const source = legacyStorage({ [LEGACY_TRIPS_KEY]: raw });
    expect((await importSource(source.storage))[1]).toEqual({ source: 'trips', status: 'retained', code: 'invalid_legacy_data' });
    expect(source.data.get(LEGACY_TRIPS_KEY)).toBe(raw);
    expect(source.storage.removeItem).not.toHaveBeenCalled();
    expect(count('trips')).toBe(0); expect(count('recording_ownership')).toBe(0); expect(receipts()).toEqual([]);
  });

  it('retains invalid preferences and lets an independent valid trips source import', async () => {
    migrateLocalDatabase(mockPort, now);
    const raw = JSON.stringify({ ...preferences, mountIndex: -1 });
    const source = legacyStorage({ [LEGACY_PREFS_KEY]: raw, [LEGACY_TRIPS_KEY]: JSON.stringify([trip()]) });
    expect(await importSource(source.storage)).toEqual([
      { source: 'preferences', status: 'retained', code: 'invalid_legacy_data' },
      { source: 'trips', status: 'imported', importedRows: 1 },
    ]);
    expect(source.data.get(LEGACY_PREFS_KEY)).toBe(raw); expect(receipts()).toHaveLength(1);
  });

  it('rolls back every trip and ownership insert in a failed source batch, including its receipt', async () => {
    migrateLocalDatabase(mockPort, now);
    database.connection.exec(`CREATE TRIGGER fail_second_legacy_trip BEFORE INSERT ON trips WHEN NEW.id='second'
      BEGIN SELECT RAISE(ABORT,'synthetic batch failure'); END`);
    const source = legacyStorage({ [LEGACY_TRIPS_KEY]: JSON.stringify([trip('first'), trip('second')]) });
    expect((await importSource(source.storage))[1]).toEqual({ source: 'trips', status: 'retained', code: 'storage_unavailable' });
    expect(count('trips')).toBe(0); expect(count('recording_ownership')).toBe(0); expect(receipts()).toEqual([]);
    expect(source.data.has(LEGACY_TRIPS_KEY)).toBe(true);
    database.connection.exec('DROP TRIGGER fail_second_legacy_trip'); reopen();
    expect((await importSource(source.storage))[1]).toMatchObject({ status: 'imported', importedRows: 2 });
    expect(count('trips')).toBe(2); expect(count('recording_ownership')).toBe(2); expect(receipts()).toHaveLength(1);
  });

  it('rolls back imported preferences when writing the durable receipt fails', async () => {
    migrateLocalDatabase(mockPort, now);
    const before = await getPreferences();
    database.connection.exec(`CREATE TRIGGER fail_receipt BEFORE INSERT ON local_import_receipts
      BEGIN SELECT RAISE(ABORT,'synthetic receipt failure'); END`);
    const source = legacyStorage({ [LEGACY_PREFS_KEY]: JSON.stringify(preferences) });
    expect((await importSource(source.storage))[0]).toMatchObject({ status: 'retained', code: 'storage_unavailable' });
    expect(await getPreferences()).toEqual(before); expect(receipts()).toEqual([]);
    expect(source.storage.removeItem).not.toHaveBeenCalled();
  });

  it('preserves current preferences on historical migration instead of overwriting them with stale AsyncStorage', async () => {
    historicalPersonalSchema(database.port, { latest: true }); migrateLocalDatabase(mockPort, now);
    const before = await getPreferences();
    const source = legacyStorage({ [LEGACY_PREFS_KEY]: JSON.stringify(preferences) });
    expect((await importSource(source.storage))[0]).toEqual({ source: 'preferences', status: 'retained', code: 'legacy_import_conflict' });
    expect(await getPreferences()).toEqual(before); expect(source.data.has(LEGACY_PREFS_KEY)).toBe(true);
    expect(receipts()).toEqual([]);
  });

  it('protects new SQLite settings after a failed legacy read and an explicit savePreferences edit', async () => {
    migrateLocalDatabase(mockPort, now);
    const source = legacyStorage({ [LEGACY_PREFS_KEY]: JSON.stringify(preferences) });
    source.storage.getItem.mockRejectedValueOnce(new Error('temporarily unavailable'));
    expect((await importSource(source.storage))[0]).toMatchObject({ status: 'retained', code: 'storage_unavailable' });
    const explicit: Preferences = { ...preferences, units: 'km/h', mountIndex: 1 };
    await savePreferences(explicit); reopen();
    expect((await importSource(source.storage))[0]).toMatchObject({ status: 'retained', code: 'legacy_import_conflict' });
    expect(await getPreferences()).toEqual(explicit);
    expect(database.connection.prepare("SELECT value FROM local_storage_metadata WHERE key='legacy_preferences_can_import'").get()).toEqual({ value: '0' });
    expect(source.data.has(LEGACY_PREFS_KEY)).toBe(true); expect(receipts()).toEqual([]);
  });

  it('atomically saves explicit settings and their legacy-import barrier', async () => {
    migrateLocalDatabase(mockPort, now); const before = await getPreferences();
    database.connection.exec(`CREATE TRIGGER fail_preference_barrier BEFORE INSERT ON local_storage_metadata
      WHEN NEW.key='legacy_preferences_can_import' BEGIN SELECT RAISE(ABORT,'synthetic barrier failure'); END`);
    // better-sqlite3's native exception constructor can cross Jest realms.
    await expect(savePreferences(preferences)).rejects.toMatchObject({
      code: 'SQLITE_CONSTRAINT_TRIGGER', message: 'synthetic barrier failure',
    });
    expect(await getPreferences()).toEqual(before);
    expect(database.connection.prepare("SELECT value FROM local_storage_metadata WHERE key='legacy_preferences_can_import'").get()).toEqual({ value: '1' });
  });

  it('retains conflicting existing trips, tombstones and their source without overwriting personal truth', async () => {
    migrateLocalDatabase(mockPort, now);
    const source = legacyStorage({ [LEGACY_TRIPS_KEY]: JSON.stringify([trip()]) });
    await importSource(source.storage);
    database.connection.exec('DELETE FROM local_import_receipts');
    database.connection.prepare('UPDATE trips SET deleted_at=? WHERE id=?').run(now, 'legacy-trip');
    const before = database.connection.prepare('SELECT * FROM trips').get();
    source.data.set(LEGACY_TRIPS_KEY, JSON.stringify([trip()]));
    expect((await importSource(source.storage))[1]).toMatchObject({ status: 'retained', code: 'legacy_import_conflict' });
    expect(database.connection.prepare('SELECT * FROM trips').get()).toEqual(before); expect(receipts()).toEqual([]);
    expect(source.data.has(LEGACY_TRIPS_KEY)).toBe(true);
  });

  it('refuses an invalid digest without committing or cleaning up any source', async () => {
    migrateLocalDatabase(mockPort, now);
    const source = legacyStorage({ [LEGACY_PREFS_KEY]: JSON.stringify(preferences) });
    expect((await importLegacyLocalStorage(mockPort, source.storage, { digest: async () => 'not-a-hash' }))[0])
      .toMatchObject({ status: 'retained', code: 'storage_unavailable' });
    expect(receipts()).toEqual([]); expect(source.storage.removeItem).not.toHaveBeenCalled();
  });
});
