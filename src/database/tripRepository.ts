import type {
  Trip,
  TripHeadingSource,
  TripRecordStatus,
  TripSignalQuality,
  TripSpeedSample,
  TripSpeedSource,
  TripSyncStatus,
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
  record_status: string;
  local_updated_at: string;
  deleted_at: string | null;
  cloud_synced_at: string | null;
  cloud_sync_error: string | null;
  sync_status: string;
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

export type SyncOutboxOperation = {
  id: string;
  operationType: 'sync_trip' | 'delete_trip' | 'restore_trips';
  entityType: 'trip' | 'account';
  entityId: string;
  payloadJson: string;
  status: 'pending' | 'done' | 'error';
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ImportTripsMergeResult = {
  tripsFound: number;
  tripsImported: number;
  tripsSkipped: number;
  samplesFound: number;
  samplesImported: number;
  samplesSkipped: number;
};

type SyncOutboxRow = {
  id: string;
  operation_type: string;
  entity_type: string;
  entity_id: string;
  payload_json: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const nowIso = () => new Date().toISOString();

const outboxId = () =>
  `sync-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const rowToTrip = (row: TripRow): Trip => ({
  id: row.id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  totalDistanceMeters: row.total_distance_meters,
  maxSpeedMps: row.max_speed_mps,
  averageSpeedMps: row.average_speed_mps,
  units: row.units as Units,
  mountLabel: row.mount_label ?? undefined,
  recordStatus: row.record_status as TripRecordStatus,
  localUpdatedAt: row.local_updated_at,
  deletedAt: row.deleted_at,
  cloudSyncedAt: row.cloud_synced_at,
  cloudSyncError: row.cloud_sync_error,
  syncStatus: row.sync_status as TripSyncStatus,
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

const rowToOutboxOperation = (row: SyncOutboxRow): SyncOutboxOperation => ({
  id: row.id,
  operationType: row.operation_type as SyncOutboxOperation['operationType'],
  entityType: row.entity_type as SyncOutboxOperation['entityType'],
  entityId: row.entity_id,
  payloadJson: row.payload_json,
  status: row.status as SyncOutboxOperation['status'],
  attemptCount: row.attempt_count,
  lastError: row.last_error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getTrips = async (): Promise<Trip[]> => {
  try {
    const db = getDatabase();
    const rows = db.getAllSync<TripRow>(
      `SELECT * FROM trips
       WHERE deleted_at IS NULL AND record_status = 'completed'
       ORDER BY started_at DESC`
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

export const recoverActiveTrip =
  async (): Promise<TripWithSpeedSamples | null> => {
    try {
      const db = getDatabase();
      const row = db.getFirstSync<TripRow>(
        `SELECT * FROM trips
         WHERE deleted_at IS NULL AND record_status = 'draft'
         ORDER BY started_at DESC
         LIMIT 1`
      );
      if (!row) {
        return null;
      }

      const trip = rowToTrip(row);
      return {
        ...trip,
        speedSamples: await getTripSpeedSamples(trip.id),
      };
    } catch {
      return null;
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
         WHERE deleted_at IS NULL AND record_status = 'completed'
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
  samples: TripSpeedSample[],
  database = getDatabase()
): number => {
  let inserted = 0;
  for (const sample of samples) {
    const result = database.runSync(
      `INSERT OR IGNORE INTO trip_speed_samples
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
    inserted += result.changes;
  }
  return inserted;
};

const enqueueSyncOperationInDatabase = (
  database: ReturnType<typeof getDatabase>,
  input: {
    operationType: SyncOutboxOperation['operationType'];
    entityType: SyncOutboxOperation['entityType'];
    entityId: string;
    payload?: unknown;
  }
): string => {
  const now = nowIso();
  const id = outboxId();
  database.runSync(
    `INSERT INTO sync_outbox
      (id, operation_type, entity_type, entity_id, payload_json, status, attempt_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
    id,
    input.operationType,
    input.entityType,
    input.entityId,
    JSON.stringify(input.payload ?? {}),
    now,
    now
  );
  return id;
};

export const appendTripSpeedSample = async (
  sample: TripSpeedSample
): Promise<void> => {
  insertTripSpeedSamples([sample]);
};

export const createDraftTrip = async (trip: Trip): Promise<void> => {
  const db = getDatabase();
  const now = nowIso();
  db.runSync(
    `INSERT OR REPLACE INTO trips
      (id, started_at, ended_at, total_distance_meters, max_speed_mps, average_speed_mps, units, mount_label, record_status, local_updated_at, deleted_at, cloud_sync_error, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, NULL, NULL, 'local')`,
    trip.id,
    trip.startedAt,
    trip.endedAt,
    trip.totalDistanceMeters,
    trip.maxSpeedMps,
    trip.averageSpeedMps,
    trip.units,
    trip.mountLabel ?? null,
    now
  );
};

export const saveTrip = async (
  trip: Trip,
  samples: TripSpeedSample[] = []
): Promise<void> => {
  const db = getDatabase();
  const now = nowIso();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT OR REPLACE INTO trips
        (id, started_at, ended_at, total_distance_meters, max_speed_mps, average_speed_mps, units, mount_label, record_status, local_updated_at, deleted_at, cloud_sync_error, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, NULL, NULL, 'pending')`,
      trip.id,
      trip.startedAt,
      trip.endedAt,
      trip.totalDistanceMeters,
      trip.maxSpeedMps,
      trip.averageSpeedMps,
      trip.units,
      trip.mountLabel ?? null,
      now
    );

    if (samples.length > 0) {
      db.runSync('DELETE FROM trip_speed_samples WHERE trip_id = ?', trip.id);
      insertTripSpeedSamples(samples, db);
    }

    enqueueSyncOperationInDatabase(db, {
      operationType: 'sync_trip',
      entityType: 'trip',
      entityId: trip.id,
      payload: { tripId: trip.id },
    });
  });
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
  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE trips SET
        started_at = ?,
        ended_at = ?,
        total_distance_meters = ?,
        max_speed_mps = ?,
        average_speed_mps = ?,
        units = ?,
        mount_label = ?,
        local_updated_at = ?,
        cloud_sync_error = NULL,
        sync_status = 'pending'
      WHERE id = ?`,
      trip.startedAt,
      trip.endedAt,
      trip.totalDistanceMeters,
      trip.maxSpeedMps,
      trip.averageSpeedMps,
      trip.units,
      trip.mountLabel ?? null,
      nowIso(),
      trip.id
    );
    enqueueSyncOperationInDatabase(db, {
      operationType: 'sync_trip',
      entityType: 'trip',
      entityId: trip.id,
      payload: { tripId: trip.id },
    });
  });
};

export const deleteTrip = async (id: string): Promise<void> => {
  await softDeleteTrip(id);
};

export const clearTrips = async (): Promise<void> => {
  const db = getDatabase();
  const now = nowIso();
  const rows = db.getAllSync<{ id: string }>(
    `SELECT id FROM trips WHERE deleted_at IS NULL`
  );
  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE trips
       SET deleted_at = ?, local_updated_at = ?, sync_status = 'pending'
       WHERE deleted_at IS NULL`,
      now,
      now
    );
    for (const row of rows) {
      enqueueSyncOperationInDatabase(db, {
        operationType: 'delete_trip',
        entityType: 'trip',
        entityId: row.id,
        payload: { tripId: row.id },
      });
    }
  });
};

export const softDeleteTrip = async (id: string): Promise<void> => {
  const db = getDatabase();
  const now = nowIso();
  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE trips
       SET deleted_at = ?, local_updated_at = ?, sync_status = 'pending'
       WHERE id = ?`,
      now,
      now,
      id
    );
    enqueueSyncOperationInDatabase(db, {
      operationType: 'delete_trip',
      entityType: 'trip',
      entityId: id,
      payload: { tripId: id },
    });
  });
};

export const getUnsyncedTrips =
  async (): Promise<TripWithSpeedSamples[]> => {
    try {
      const db = getDatabase();
      const rows = db.getAllSync<TripRow>(
        `SELECT * FROM trips
         WHERE sync_status IN ('local', 'pending', 'error')
         ORDER BY local_updated_at ASC`
      );

      return rows.map((row) => {
        const trip = rowToTrip(row);
        const samples = db
          .getAllSync<TripSpeedSampleRow>(
            `SELECT * FROM trip_speed_samples
             WHERE trip_id = ?
             ORDER BY sequence ASC, elapsed_ms ASC`,
            trip.id
          )
          .map(rowToTripSpeedSample);
        return { ...trip, speedSamples: samples };
      });
    } catch {
      return [];
    }
  };

export const enqueueSyncOperation = async (input: {
  operationType: SyncOutboxOperation['operationType'];
  entityType: SyncOutboxOperation['entityType'];
  entityId: string;
  payload?: unknown;
}): Promise<string> => {
  return enqueueSyncOperationInDatabase(getDatabase(), input);
};

export const getPendingSyncOperations = async (
  limit = 25
): Promise<SyncOutboxOperation[]> => {
  try {
    const db = getDatabase();
    const rows = db.getAllSync<SyncOutboxRow>(
      `SELECT * FROM sync_outbox
       WHERE status IN ('pending', 'error')
       ORDER BY created_at ASC
       LIMIT ?`,
      Math.max(1, Math.round(limit))
    );
    return rows.map(rowToOutboxOperation);
  } catch {
    return [];
  }
};

export const markSyncOperationDone = async (id: string): Promise<void> => {
  const db = getDatabase();
  db.runSync(
    `UPDATE sync_outbox
     SET status = 'done', last_error = NULL, updated_at = ?
     WHERE id = ?`,
    nowIso(),
    id
  );
};

export const markSyncOperationError = async (
  id: string,
  message: string
): Promise<void> => {
  const db = getDatabase();
  db.runSync(
    `UPDATE sync_outbox
     SET status = 'error',
      attempt_count = attempt_count + 1,
      last_error = ?,
      updated_at = ?
     WHERE id = ?`,
    message,
    nowIso(),
    id
  );
};

export const markTripsSynced = async (
  tripIds: string[],
  syncedAt: string = nowIso()
): Promise<void> => {
  if (tripIds.length === 0) {
    return;
  }
  const db = getDatabase();
  for (const tripId of tripIds) {
    db.runSync(
      `UPDATE trips
       SET sync_status = 'synced',
        cloud_synced_at = ?,
        cloud_sync_error = NULL
       WHERE id = ?`,
      syncedAt,
      tripId
    );
  }
};

export const markTripSyncError = async (
  tripId: string,
  message: string
): Promise<void> => {
  const db = getDatabase();
  db.runSync(
    `UPDATE trips
     SET sync_status = 'error', cloud_sync_error = ?
     WHERE id = ?`,
    message,
    tripId
  );
};

export const getPendingSyncChangeCount = async (): Promise<number> => {
  try {
    const db = getDatabase();
    const row = db.getFirstSync<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM trips
       WHERE sync_status IN ('local', 'pending', 'error')`
    );
    return row?.count ?? 0;
  } catch {
    return 0;
  }
};

export const importTripsMergeOnly = async (
  trips: TripWithSpeedSamples[]
): Promise<ImportTripsMergeResult> => {
  const db = getDatabase();
  const result: ImportTripsMergeResult = {
    tripsFound: trips.length,
    tripsImported: 0,
    tripsSkipped: 0,
    samplesFound: trips.reduce(
      (total, trip) => total + trip.speedSamples.length,
      0
    ),
    samplesImported: 0,
    samplesSkipped: 0,
  };
  const now = nowIso();
  const changedTripIds = new Set<string>();

  db.withTransactionSync(() => {
    for (const trip of trips) {
      const existing = db.getFirstSync<{ id: string }>(
        'SELECT id FROM trips WHERE id = ?',
        trip.id
      );

      if (existing) {
        result.tripsSkipped += 1;
      } else {
        db.runSync(
          `INSERT INTO trips
            (id, started_at, ended_at, total_distance_meters, max_speed_mps, average_speed_mps, units, mount_label, record_status, local_updated_at, deleted_at, cloud_synced_at, cloud_sync_error, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'pending')`,
          trip.id,
          trip.startedAt,
          trip.endedAt,
          trip.totalDistanceMeters,
          trip.maxSpeedMps,
          trip.averageSpeedMps,
          trip.units,
          trip.mountLabel ?? null,
          trip.recordStatus ?? 'completed',
          now
        );
        result.tripsImported += 1;
        changedTripIds.add(trip.id);
      }

      const insertedSamples = insertTripSpeedSamples(
        trip.speedSamples.map((sample) => ({
          ...sample,
          tripId: trip.id,
        })),
        db
      );
      result.samplesImported += insertedSamples;
      result.samplesSkipped += trip.speedSamples.length - insertedSamples;

      if (insertedSamples > 0) {
        changedTripIds.add(trip.id);
        db.runSync(
          `UPDATE trips
           SET local_updated_at = ?, cloud_sync_error = NULL, sync_status = 'pending'
           WHERE id = ?`,
          now,
          trip.id
        );
      }
    }

    for (const tripId of changedTripIds) {
      enqueueSyncOperationInDatabase(db, {
        operationType: 'sync_trip',
        entityType: 'trip',
        entityId: tripId,
        payload: { tripId },
      });
    }
  });

  return result;
};

export const restoreCloudTrips = async (
  trips: TripWithSpeedSamples[]
): Promise<number> => {
  const db = getDatabase();
  let inserted = 0;
  for (const trip of trips) {
    const existing = db.getFirstSync<{ id: string; local_updated_at: string }>(
      'SELECT id, local_updated_at FROM trips WHERE id = ?',
      trip.id
    );
    if (existing) {
      continue;
    }
    const now = nowIso();
    db.runSync(
      `INSERT INTO trips
        (id, started_at, ended_at, total_distance_meters, max_speed_mps, average_speed_mps, units, mount_label, record_status, local_updated_at, deleted_at, cloud_synced_at, cloud_sync_error, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, NULL, ?, NULL, 'synced')`,
      trip.id,
      trip.startedAt,
      trip.endedAt,
      trip.totalDistanceMeters,
      trip.maxSpeedMps,
      trip.averageSpeedMps,
      trip.units,
      trip.mountLabel ?? null,
      trip.localUpdatedAt ?? now,
      trip.cloudSyncedAt ?? now
    );
    insertTripSpeedSamples(trip.speedSamples);
    inserted += 1;
  }
  return inserted;
};
