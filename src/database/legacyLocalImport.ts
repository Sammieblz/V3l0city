import { z } from 'zod';
import { sqliteTransaction, type SqlitePort } from './sqlitePort';
import { LocalStorageError } from './storageErrors';

export const LEGACY_PREFS_KEY = 'velocity.preferences';
export const LEGACY_TRIPS_KEY = 'velocity.trips';
const timestamp = z.string().datetime({ offset: true });
const preferencesSchema = z.strictObject({ units: z.enum(['km/h','MPH']),mountIndex: z.number().int().nonnegative(),
  autoStart: z.boolean().optional(),autoSave: z.boolean().optional(),orientationMode: z.enum(['portrait','landscape','auto']).optional(),
  themePreference: z.enum(['system','light','dark']).optional() });
const tripSchema = z.strictObject({ id: z.string().min(1),startedAt: timestamp,endedAt: timestamp,
  totalDistanceMeters: z.number().finite().nonnegative(),maxSpeedMps: z.number().finite().nonnegative(),
  averageSpeedMps: z.number().finite().nonnegative(),units: z.enum(['km/h','MPH']),mountLabel: z.string().optional() })
  .refine((trip) => Date.parse(trip.endedAt) >= Date.parse(trip.startedAt));
type LegacyTrip = z.infer<typeof tripSchema>;
export type LegacyImportResult = { source: 'preferences' | 'trips'; status: 'absent' | 'imported' | 'retained';
  code?: 'invalid_legacy_data' | 'legacy_import_conflict' | 'storage_unavailable'; importedRows?: number };
export type LegacyStoragePort = { getItem(key: string): Promise<string | null>; removeItem(key: string): Promise<void> };

function importTrips(database: SqlitePort, trips: LegacyTrip[], importedAt: string): number {
  if (new Set(trips.map((trip) => trip.id)).size !== trips.length) throw new LocalStorageError('invalid_legacy_data');
  let inserted = 0;
  for (const trip of trips) {
    const existing = database.getFirstSync<Record<string, unknown>>('SELECT * FROM trips WHERE id=?', trip.id);
    if (existing) {
      const expected = { started_at: trip.startedAt,ended_at: trip.endedAt,total_distance_meters: trip.totalDistanceMeters,
        max_speed_mps: trip.maxSpeedMps,average_speed_mps: trip.averageSpeedMps,units: trip.units,mount_label: trip.mountLabel ?? null };
      if (Object.entries(expected).some(([name, value]) => existing[name] !== value)
        || existing.deleted_at !== null || existing.record_status !== 'completed') throw new LocalStorageError('legacy_import_conflict');
      continue;
    }
    database.runSync(`INSERT INTO trips(id,started_at,ended_at,total_distance_meters,max_speed_mps,average_speed_mps,units,mount_label,local_updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)`, trip.id,trip.startedAt,trip.endedAt,trip.totalDistanceMeters,trip.maxSpeedMps,
    trip.averageSpeedMps,trip.units,trip.mountLabel ?? null,importedAt);
    database.runSync('INSERT INTO recording_ownership(recording_id) VALUES(?)', trip.id);
    inserted++;
  }
  return inserted;
}

/** Read/validate before SQL; delete source only after a transaction and durable digest receipt. */
export async function importLegacyLocalStorage(database: SqlitePort, storage: LegacyStoragePort,
  options: { digest: (text: string) => Promise<string>; now?: () => string }): Promise<LegacyImportResult[]> {
  const results: LegacyImportResult[] = [];
  for (const [key, source] of [[LEGACY_PREFS_KEY,'preferences'],[LEGACY_TRIPS_KEY,'trips']] as const) {
    try {
      const raw = await storage.getItem(key);
      if (raw === null) { results.push({ source,status: 'absent' }); continue; }
      const parsed: unknown = JSON.parse(raw);
      const value = source === 'preferences' ? preferencesSchema.parse(parsed) : z.array(tripSchema).parse(parsed);
      const digest = await options.digest(raw);
      if (!/^[a-f0-9]{64}$/.test(digest)) throw new LocalStorageError('storage_unavailable');
      const importedAt = (options.now ?? (() => new Date().toISOString()))();
      const importedRows = sqliteTransaction(database, () => {
        const receipt = database.getFirstSync<{ source_digest: string }>('SELECT source_digest FROM local_import_receipts WHERE source_key=?', key);
        if (receipt) {
          if (receipt.source_digest !== digest) throw new LocalStorageError('legacy_import_conflict');
          return 0;
        }
        let count = 0;
        if (source === 'preferences') {
          const preferences = value as z.infer<typeof preferencesSchema>;
          const expected = { units: preferences.units,mount_index: preferences.mountIndex,auto_start: preferences.autoStart ? 1 : 0,
            auto_save: preferences.autoSave ? 1 : 0,orientation_mode: preferences.orientationMode ?? 'portrait',
            theme_preference: preferences.themePreference ?? 'system' };
          const current = database.getFirstSync<Record<string, unknown>>('SELECT * FROM preferences WHERE id=1');
          const mayImport = database.getFirstSync<{ value: string }>("SELECT value FROM local_storage_metadata WHERE key='legacy_preferences_can_import'")?.value === '1';
          if (!mayImport && (!current || Object.entries(expected).some(([name, field]) => current[name] !== field))) {
            throw new LocalStorageError('legacy_import_conflict');
          }
          if (mayImport) {
            database.runSync(`UPDATE preferences SET units=?,mount_index=?,auto_start=?,auto_save=?,orientation_mode=?,theme_preference=? WHERE id=1`,
              expected.units,expected.mount_index,expected.auto_start,expected.auto_save,expected.orientation_mode,expected.theme_preference);
            count = 1;
          }
        } else count = importTrips(database, value as LegacyTrip[], importedAt);
        database.runSync('INSERT INTO local_import_receipts(source_key,source_digest,imported_at) VALUES(?,?,?)', key,digest,importedAt);
        return count;
      });
      await storage.removeItem(key);
      results.push({ source,status: 'imported',importedRows });
    } catch (error) {
      results.push({ source,status: 'retained',code: error instanceof LocalStorageError
        ? error.code === 'legacy_import_conflict' || error.code === 'invalid_legacy_data' ? error.code : 'storage_unavailable'
        : error instanceof SyntaxError || error instanceof z.ZodError ? 'invalid_legacy_data' : 'storage_unavailable' });
    }
  }
  return results;
}
