import type { Units } from '../utils/speedMath';
import { getDatabase } from './database';

export type OrientationMode = 'portrait' | 'landscape' | 'auto';

export type Preferences = {
  units: Units;
  mountIndex: number;
  autoStart: boolean;
  autoSave: boolean;
  orientationMode: OrientationMode;
};

type PreferencesRow = {
  id: number;
  units: string;
  mount_index: number;
  auto_start: number;
  auto_save: number;
  orientation_mode: string;
};

export const getPreferences = async (): Promise<Preferences | null> => {
  try {
    const db = getDatabase();
    const row = db.getFirstSync<PreferencesRow>(
      'SELECT * FROM preferences WHERE id = 1'
    );
    if (!row) return null;
    return {
      units: row.units as Units,
      mountIndex: row.mount_index,
      autoStart: row.auto_start === 1,
      autoSave: row.auto_save === 1,
      orientationMode: row.orientation_mode as OrientationMode,
    };
  } catch {
    return null;
  }
};

export const savePreferences = async (prefs: Preferences): Promise<void> => {
  const db = getDatabase();
  db.runSync(
    `UPDATE preferences SET
      units = ?,
      mount_index = ?,
      auto_start = ?,
      auto_save = ?,
      orientation_mode = ?
    WHERE id = 1`,
    prefs.units,
    prefs.mountIndex,
    prefs.autoStart ? 1 : 0,
    prefs.autoSave ? 1 : 0,
    prefs.orientationMode
  );
};
