import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Trip } from '../domain/trip';
import type { Preferences } from './preferencesRepository';

const DB_NAME = 'velocity.db';
const LEGACY_PREFS_KEY = 'velocity.preferences';
const LEGACY_TRIPS_KEY = 'velocity.trips';

let db: SQLite.SQLiteDatabase | null = null;

const createTables = (database: SQLite.SQLiteDatabase): void => {
  database.execSync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      units TEXT NOT NULL DEFAULT 'km/h',
      mount_index INTEGER NOT NULL DEFAULT 0,
      auto_start INTEGER NOT NULL DEFAULT 0,
      auto_save INTEGER NOT NULL DEFAULT 0,
      orientation_mode TEXT NOT NULL DEFAULT 'portrait'
    );
    INSERT OR IGNORE INTO preferences (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      total_distance_meters REAL NOT NULL DEFAULT 0,
      max_speed_mps REAL NOT NULL DEFAULT 0,
      average_speed_mps REAL NOT NULL DEFAULT 0,
      units TEXT NOT NULL DEFAULT 'km/h',
      mount_label TEXT,
      record_status TEXT NOT NULL DEFAULT 'completed',
      local_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT,
      cloud_synced_at TEXT,
      cloud_sync_error TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local'
    );

    CREATE TABLE IF NOT EXISTS trip_speed_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id TEXT NOT NULL,
      sequence INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL,
      elapsed_ms INTEGER NOT NULL,
      speed_mps REAL NOT NULL,
      distance_meters REAL NOT NULL,
      heading_degrees REAL,
      heading_source TEXT NOT NULL DEFAULT 'none',
      heading_accuracy_degrees REAL,
      heading_quality TEXT NOT NULL DEFAULT 'poor',
      heading_reasons TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'none',
      quality TEXT NOT NULL DEFAULT 'medium',
      quality_score REAL NOT NULL DEFAULT 0.5,
      quality_reasons TEXT NOT NULL DEFAULT '[]',
      gps_accuracy_meters REAL,
      fix_age_ms INTEGER,
      native_speed_used INTEGER NOT NULL DEFAULT 0,
      is_moving INTEGER NOT NULL DEFAULT 0,
      is_stopped INTEGER NOT NULL DEFAULT 0,
      stale INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT,
      upload_error TEXT,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_trip_speed_samples_trip_id
      ON trip_speed_samples (trip_id, elapsed_ms);
    CREATE INDEX IF NOT EXISTS idx_trip_speed_samples_upload
      ON trip_speed_samples (uploaded_at, trip_id, sequence);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_speed_samples_unique_sequence
      ON trip_speed_samples (trip_id, sequence);

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      operation_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sync_outbox_status
      ON sync_outbox (status, created_at);
  `);
};

const columnExists = (
  database: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string
): boolean => {
  const columns = database.getAllSync<{ name: string }>(
    `PRAGMA table_info(${tableName})`
  );
  return columns.some((column) => column.name === columnName);
};

const addColumnIfMissing = (
  database: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string,
  definition: string
): void => {
  if (!columnExists(database, tableName, columnName)) {
    database.execSync(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
};

const runMigrations = (database: SQLite.SQLiteDatabase): void => {
  addColumnIfMissing(
    database,
    'trips',
    'record_status',
    "record_status TEXT NOT NULL DEFAULT 'completed'"
  );
  addColumnIfMissing(
    database,
    'trips',
    'local_updated_at',
    'local_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP'
  );
  addColumnIfMissing(database, 'trips', 'deleted_at', 'deleted_at TEXT');
  addColumnIfMissing(
    database,
    'trips',
    'cloud_synced_at',
    'cloud_synced_at TEXT'
  );
  addColumnIfMissing(
    database,
    'trips',
    'cloud_sync_error',
    'cloud_sync_error TEXT'
  );
  addColumnIfMissing(
    database,
    'trips',
    'sync_status',
    "sync_status TEXT NOT NULL DEFAULT 'local'"
  );
  addColumnIfMissing(
    database,
    'trip_speed_samples',
    'heading_source',
    "heading_source TEXT NOT NULL DEFAULT 'none'"
  );
  addColumnIfMissing(
    database,
    'trip_speed_samples',
    'heading_accuracy_degrees',
    'heading_accuracy_degrees REAL'
  );
  addColumnIfMissing(
    database,
    'trip_speed_samples',
    'heading_quality',
    "heading_quality TEXT NOT NULL DEFAULT 'poor'"
  );
  addColumnIfMissing(
    database,
    'trip_speed_samples',
    'heading_reasons',
    "heading_reasons TEXT NOT NULL DEFAULT '[]'"
  );
  addColumnIfMissing(
    database,
    'trip_speed_samples',
    'sequence',
    'sequence INTEGER NOT NULL DEFAULT 0'
  );
  addColumnIfMissing(
    database,
    'trip_speed_samples',
    'quality_score',
    'quality_score REAL NOT NULL DEFAULT 0.5'
  );
  addColumnIfMissing(
    database,
    'trip_speed_samples',
    'quality_reasons',
    "quality_reasons TEXT NOT NULL DEFAULT '[]'"
  );
  addColumnIfMissing(
    database,
    'trip_speed_samples',
    'gps_accuracy_meters',
    'gps_accuracy_meters REAL'
  );
  addColumnIfMissing(
    database,
    'trip_speed_samples',
    'fix_age_ms',
    'fix_age_ms INTEGER'
  );
  addColumnIfMissing(
    database,
    'trip_speed_samples',
    'native_speed_used',
    'native_speed_used INTEGER NOT NULL DEFAULT 0'
  );
  addColumnIfMissing(
    database,
    'trip_speed_samples',
    'uploaded_at',
    'uploaded_at TEXT'
  );
  addColumnIfMissing(
    database,
    'trip_speed_samples',
    'upload_error',
    'upload_error TEXT'
  );
  database.runSync(
    'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)',
    '2026-05-19-trip-speed-sample-telemetry',
    new Date().toISOString()
  );
  database.runSync(
    'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)',
    '2026-05-26-trip-heading-diagnostics',
    new Date().toISOString()
  );
  database.runSync(
    'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)',
    '2026-05-27-offline-cloud-sync',
    new Date().toISOString()
  );
};

/**
 * One-time migration from AsyncStorage to SQLite.
 * Reads legacy keys, inserts data, then removes the keys.
 */
const migrateFromAsyncStorage = async (
  database: SQLite.SQLiteDatabase
): Promise<void> => {
  try {
    const rawPrefs = await AsyncStorage.getItem(LEGACY_PREFS_KEY);
    if (rawPrefs) {
      const p = JSON.parse(rawPrefs) as Partial<Preferences>;
      if (
        (p.units === 'km/h' || p.units === 'MPH') &&
        typeof p.mountIndex === 'number'
      ) {
        database.runSync(
          `UPDATE preferences SET
            units = ?,
            mount_index = ?,
            auto_start = ?,
            auto_save = ?,
            orientation_mode = ?
          WHERE id = 1`,
          p.units,
          p.mountIndex,
          p.autoStart ? 1 : 0,
          p.autoSave ? 1 : 0,
          p.orientationMode ?? 'portrait'
        );
      }
      await AsyncStorage.removeItem(LEGACY_PREFS_KEY);
    }
  } catch {
    // Best-effort migration; ignore failures.
  }

  try {
    const rawTrips = await AsyncStorage.getItem(LEGACY_TRIPS_KEY);
    if (rawTrips) {
      const trips = JSON.parse(rawTrips);
      if (Array.isArray(trips)) {
        for (const t of trips as Trip[]) {
          database.runSync(
            `INSERT OR IGNORE INTO trips
              (id, started_at, ended_at, total_distance_meters, max_speed_mps, average_speed_mps, units, mount_label)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            t.id,
            t.startedAt,
            t.endedAt,
            t.totalDistanceMeters,
            t.maxSpeedMps,
            t.averageSpeedMps,
            t.units,
            t.mountLabel ?? null
          );
        }
      }
      await AsyncStorage.removeItem(LEGACY_TRIPS_KEY);
    }
  } catch {
    // Best-effort migration; ignore failures.
  }
};

export const getDatabase = (): SQLite.SQLiteDatabase => {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
    createTables(db);
    runMigrations(db);
  }
  return db;
};

/**
 * Call once at app startup to run the one-time AsyncStorage migration.
 */
export const initDatabase = async (): Promise<void> => {
  const database = getDatabase();
  await migrateFromAsyncStorage(database);
};
