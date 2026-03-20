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
      mount_label TEXT
    );
  `);
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
