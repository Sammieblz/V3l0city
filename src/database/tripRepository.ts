import type {
  Trip,
  TripHeadingSource,
  TripSignalQuality,
  TripSpeedSample,
  TripSpeedSource,
  TripWithSpeedSamples,
} from '../domain/trip';
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

type TripSpeedSampleRow = {
  trip_id: string;
  sequence: number;
  recorded_at: string;
  elapsed_ms: number;
  speed_mps: number;
  distance_meters: number;
  heading_degrees: number | null;
  heading_source: string;
  heading_accuracy_degrees: number | null;
  heading_quality: string;
  heading_reasons: string;
  source: string;
  quality: string;
  quality_score: number;
  quality_reasons: string;
  gps_accuracy_meters: number | null;
  fix_age_ms: number | null;
  native_speed_used: number;
  is_moving: number;
  is_stopped: number;
  stale: number;
  uploaded_at: string | null;
  upload_error: string | null;
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

const rowToTripSpeedSample = (row: TripSpeedSampleRow): TripSpeedSample => ({
  tripId: row.trip_id,
  sequence: row.sequence,
  recordedAt: row.recorded_at,
  elapsedMs: row.elapsed_ms,
  speedMps: row.speed_mps,
  distanceMeters: row.distance_meters,
  headingDegrees: row.heading_degrees,
  headingSource: row.heading_source as TripHeadingSource,
  headingAccuracyDegrees: row.heading_accuracy_degrees,
  headingQuality: row.heading_quality as TripSignalQuality,
  headingReasons: parseQualityReasons(row.heading_reasons),
  source: row.source as TripSpeedSource,
  quality: row.quality as TripSignalQuality,
  qualityScore: row.quality_score,
  qualityReasons: parseQualityReasons(row.quality_reasons),
  gpsAccuracyMeters: row.gps_accuracy_meters,
  fixAgeMs: row.fix_age_ms,
  nativeSpeedUsed: row.native_speed_used === 1,
  isMoving: row.is_moving === 1,
  isStopped: row.is_stopped === 1,
  stale: row.stale === 1,
  uploadedAt: row.uploaded_at,
  uploadError: row.upload_error,
});

const parseQualityReasons = (raw: string): string[] => {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((reason): reason is string => typeof reason === 'string')
      : [];
  } catch {
    return [];
  }
};

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

export const getTripSpeedSamples = async (
  tripId: string
): Promise<TripSpeedSample[]> => {
  try {
    const db = getDatabase();
    const rows = db.getAllSync<TripSpeedSampleRow>(
      `SELECT * FROM trip_speed_samples
       WHERE trip_id = ?
       ORDER BY sequence ASC, elapsed_ms ASC`,
      tripId
    );
    return rows.map(rowToTripSpeedSample);
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

export const getRecentTripsWithSpeedSamples = async (
  limit = 50
): Promise<TripWithSpeedSamples[]> => {
  try {
    const db = getDatabase();
    const trips = db
      .getAllSync<TripRow>(
        `SELECT * FROM trips
         ORDER BY started_at DESC
         LIMIT ?`,
        Math.max(1, Math.round(limit))
      )
      .map(rowToTrip);

    return trips.map((trip) => {
      const rows = db.getAllSync<TripSpeedSampleRow>(
        `SELECT * FROM trip_speed_samples
         WHERE trip_id = ?
         ORDER BY sequence ASC, elapsed_ms ASC`,
        trip.id
      );
      return {
        ...trip,
        speedSamples: rows.map(rowToTripSpeedSample),
      };
    });
  } catch {
    return [];
  }
};

const insertTripSpeedSamples = (
  samples: TripSpeedSample[]
): void => {
  const db = getDatabase();
  for (const sample of samples) {
    db.runSync(
      `INSERT INTO trip_speed_samples
        (trip_id, sequence, recorded_at, elapsed_ms, speed_mps, distance_meters, heading_degrees, heading_source, heading_accuracy_degrees, heading_quality, heading_reasons, source, quality, quality_score, quality_reasons, gps_accuracy_meters, fix_age_ms, native_speed_used, is_moving, is_stopped, stale, uploaded_at, upload_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      sample.tripId,
      sample.sequence,
      sample.recordedAt,
      Math.round(sample.elapsedMs),
      sample.speedMps,
      sample.distanceMeters,
      sample.headingDegrees,
      sample.headingSource,
      sample.headingAccuracyDegrees,
      sample.headingQuality,
      JSON.stringify(sample.headingReasons),
      sample.source,
      sample.quality,
      sample.qualityScore,
      JSON.stringify(sample.qualityReasons),
      sample.gpsAccuracyMeters,
      sample.fixAgeMs == null ? null : Math.round(sample.fixAgeMs),
      sample.nativeSpeedUsed ? 1 : 0,
      sample.isMoving ? 1 : 0,
      sample.isStopped ? 1 : 0,
      sample.stale ? 1 : 0,
      sample.uploadedAt ?? null,
      sample.uploadError ?? null
    );
  }
};

export const saveTrip = async (
  trip: Trip,
  samples: TripSpeedSample[] = []
): Promise<void> => {
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

  if (samples.length > 0) {
    db.runSync('DELETE FROM trip_speed_samples WHERE trip_id = ?', trip.id);
    insertTripSpeedSamples(samples);
  }
};

export const getPendingTripSpeedSamples = async (
  tripId: string
): Promise<TripSpeedSample[]> => {
  try {
    const db = getDatabase();
    const rows = db.getAllSync<TripSpeedSampleRow>(
      `SELECT * FROM trip_speed_samples
       WHERE trip_id = ? AND uploaded_at IS NULL
       ORDER BY sequence ASC, elapsed_ms ASC`,
      tripId
    );
    return rows.map(rowToTripSpeedSample);
  } catch {
    return [];
  }
};

export const markTripSpeedSamplesUploaded = async (
  tripId: string,
  throughSequence: number,
  uploadedAt: string = new Date().toISOString()
): Promise<void> => {
  const db = getDatabase();
  db.runSync(
    `UPDATE trip_speed_samples
     SET uploaded_at = ?, upload_error = NULL
     WHERE trip_id = ? AND sequence <= ?`,
    uploadedAt,
    tripId,
    throughSequence
  );
};

export const markTripSpeedSamplesUploadError = async (
  tripId: string,
  fromSequence: number,
  message: string
): Promise<void> => {
  const db = getDatabase();
  db.runSync(
    `UPDATE trip_speed_samples
     SET upload_error = ?
     WHERE trip_id = ? AND sequence >= ? AND uploaded_at IS NULL`,
    message,
    tripId,
    fromSequence
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
  db.runSync('DELETE FROM trip_speed_samples WHERE trip_id = ?', id);
  db.runSync('DELETE FROM trips WHERE id = ?', id);
};

export const clearTrips = async (): Promise<void> => {
  const db = getDatabase();
  db.runSync('DELETE FROM trip_speed_samples');
  db.runSync('DELETE FROM trips');
};
