import type { Trip } from '../domain/trip';
import type { Units } from '../utils/speedMath';
import { getDatabase } from './database';

type TripRow = {
  id: string;
  started_at: string;
  ended_at: string;
  total_distance_meters: number;
  max_speed_mps: number;
  average_speed_mps: number;
  units: string;
  mount_label: string | null;
};

const rowToTrip = (row: TripRow): Trip => ({
  id: row.id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  totalDistanceMeters: row.total_distance_meters,
  maxSpeedMps: row.max_speed_mps,
  averageSpeedMps: row.average_speed_mps,
  units: row.units as Units,
  mountLabel: row.mount_label ?? undefined,
});

export const getTrips = async (): Promise<Trip[]> => {
  try {
    const db = getDatabase();
    const rows = db.getAllSync<TripRow>(
      'SELECT * FROM trips ORDER BY started_at DESC'
    );
    return rows.map(rowToTrip);
  } catch {
    return [];
  }
};

export const getTripById = async (id: string): Promise<Trip | null> => {
  try {
    const db = getDatabase();
    const row = db.getFirstSync<TripRow>(
      'SELECT * FROM trips WHERE id = ?',
      id
    );
    return row ? rowToTrip(row) : null;
  } catch {
    return null;
  }
};

export const saveTrip = async (trip: Trip): Promise<void> => {
  const db = getDatabase();
  db.runSync(
    `INSERT OR REPLACE INTO trips
      (id, started_at, ended_at, total_distance_meters, max_speed_mps, average_speed_mps, units, mount_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    trip.id,
    trip.startedAt,
    trip.endedAt,
    trip.totalDistanceMeters,
    trip.maxSpeedMps,
    trip.averageSpeedMps,
    trip.units,
    trip.mountLabel ?? null
  );
};

export const updateTrip = async (trip: Trip): Promise<void> => {
  const db = getDatabase();
  db.runSync(
    `UPDATE trips SET
      started_at = ?,
      ended_at = ?,
      total_distance_meters = ?,
      max_speed_mps = ?,
      average_speed_mps = ?,
      units = ?,
      mount_label = ?
    WHERE id = ?`,
    trip.startedAt,
    trip.endedAt,
    trip.totalDistanceMeters,
    trip.maxSpeedMps,
    trip.averageSpeedMps,
    trip.units,
    trip.mountLabel ?? null,
    trip.id
  );
};

export const deleteTrip = async (id: string): Promise<void> => {
  const db = getDatabase();
  db.runSync('DELETE FROM trips WHERE id = ?', id);
};

export const clearTrips = async (): Promise<void> => {
  const db = getDatabase();
  db.runSync('DELETE FROM trips');
};
