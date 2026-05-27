import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

import type {
  CompleteTripInput,
  RegisterDeviceInput,
  SampleBatchInput,
  StartTripInput,
} from './contracts';

type DeviceRow = {
  id: string;
  token_hash: string;
};

type TripRow = {
  id: string;
  device_id: string;
  client_trip_id: string;
  started_at: string;
  ended_at: string | null;
  units: string;
  mount_label: string | null;
  total_distance_meters: number | null;
  max_speed_mps: number | null;
  average_speed_mps: number | null;
  final_sequence: number | null;
  created_at: string;
  updated_at: string;
};

type LiveSessionRow = {
  id: string;
  trip_id: string;
  token_hash: string;
  expires_at: string;
};

export type RegisteredDevice = {
  deviceId: string;
  deviceToken: string;
};

export type TripSession = {
  tripId: string;
  liveSessionId: string;
  sessionToken: string;
};

export type BatchResult = {
  inserted: number;
  lastSequence: number;
  duplicate: boolean;
};

const tokenHash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const createToken = (): string => randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

export class TelemetryStore {
  private readonly db: Database.Database;

  constructor(dbPath = 'server/data/v3l0city.sqlite') {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  close() {
    this.db.close();
  }

  registerDevice(input: RegisterDeviceInput): RegisteredDevice {
    const existing = this.db
      .prepare('SELECT id, token_hash FROM devices WHERE install_id = ?')
      .get(input.installId) as DeviceRow | undefined;
    const deviceToken = createToken();
    const now = new Date().toISOString();

    if (existing) {
      this.db
        .prepare(
          `UPDATE devices
           SET token_hash = ?,
            platform = ?,
            app_version = ?,
            build_number = ?,
            expo_push_token = ?,
            native_push_token = ?,
            push_platform = ?,
            updated_at = ?
           WHERE id = ?`
        )
        .run(
          tokenHash(deviceToken),
          input.platform,
          input.appVersion,
          input.buildNumber,
          input.expoPushToken ?? null,
          input.nativePushToken ?? null,
          input.pushPlatform ?? null,
          now,
          existing.id
        );
      return { deviceId: existing.id, deviceToken };
    }

    const deviceId = randomUUID();
    this.db
      .prepare(
        `INSERT INTO devices
          (
            id,
            install_id,
            token_hash,
            platform,
            app_version,
            build_number,
            expo_push_token,
            native_push_token,
            push_platform,
            created_at,
            updated_at
          )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        deviceId,
        input.installId,
        tokenHash(deviceToken),
        input.platform,
        input.appVersion,
        input.buildNumber,
        input.expoPushToken ?? null,
        input.nativePushToken ?? null,
        input.pushPlatform ?? null,
        now,
        now
      );
    return { deviceId, deviceToken };
  }

  authenticateDevice(deviceToken: string): string | null {
    const row = this.db
      .prepare('SELECT id, token_hash FROM devices WHERE token_hash = ?')
      .get(tokenHash(deviceToken)) as DeviceRow | undefined;
    return row?.id ?? null;
  }

  createTrip(deviceId: string, input: StartTripInput): TripSession {
    const now = new Date().toISOString();
    const tripId = input.clientTripId;
    this.db
      .prepare(
        `INSERT INTO trips
          (id, device_id, client_trip_id, started_at, units, mount_label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          updated_at = excluded.updated_at,
          units = excluded.units,
          mount_label = excluded.mount_label`
      )
      .run(
        tripId,
        deviceId,
        input.clientTripId,
        input.startedAt,
        input.units,
        input.mountLabel ?? null,
        now,
        now
      );

    const liveSessionId = randomUUID();
    const sessionToken = createToken();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    this.db
      .prepare(
        `INSERT INTO live_sessions
          (id, trip_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(liveSessionId, tripId, tokenHash(sessionToken), expiresAt, now);

    return { tripId, liveSessionId, sessionToken };
  }

  validateTripAccess(deviceId: string, tripId: string): boolean {
    const row = this.db
      .prepare('SELECT id FROM trips WHERE id = ? AND device_id = ?')
      .get(tripId, deviceId);
    return row != null;
  }

  validateLiveSession(tripId: string, sessionToken: string): LiveSessionRow | null {
    const row = this.db
      .prepare(
        `SELECT id, trip_id, token_hash, expires_at
         FROM live_sessions
         WHERE trip_id = ? AND token_hash = ?`
      )
      .get(tripId, tokenHash(sessionToken)) as LiveSessionRow | undefined;

    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      return null;
    }
    return row;
  }

  insertBatch(tripId: string, batch: SampleBatchInput): BatchResult {
    const existing = this.db
      .prepare('SELECT last_sequence FROM upload_batches WHERE trip_id = ? AND batch_id = ?')
      .get(tripId, batch.batchId) as { last_sequence: number } | undefined;
    if (existing) {
      return { inserted: 0, lastSequence: existing.last_sequence, duplicate: true };
    }

    const insertSample = this.db.prepare(
      `INSERT OR IGNORE INTO trip_samples
        (trip_id, sequence, recorded_at, elapsed_ms, speed_mps, distance_meters,
         heading_degrees, heading_source, heading_accuracy_degrees, heading_quality,
         heading_reasons, source, quality, quality_score, quality_reasons,
         gps_accuracy_meters, fix_age_ms, native_speed_used, is_moving, is_stopped, stale)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertBatch = this.db.prepare(
      `INSERT INTO upload_batches
        (trip_id, batch_id, sample_count, last_sequence, received_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    const updateTrip = this.db.prepare('UPDATE trips SET updated_at = ? WHERE id = ?');
    const now = new Date().toISOString();
    let inserted = 0;
    let lastSequence = 0;

    this.db.transaction(() => {
      for (const sample of batch.samples) {
        const result = insertSample.run(
          tripId,
          sample.sequence,
          sample.recordedAt,
          sample.elapsedMs,
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
          sample.fixAgeMs,
          sample.nativeSpeedUsed ? 1 : 0,
          sample.isMoving ? 1 : 0,
          sample.isStopped ? 1 : 0,
          sample.stale ? 1 : 0
        );
        inserted += Number(result.changes);
        lastSequence = Math.max(lastSequence, sample.sequence);
      }
      insertBatch.run(tripId, batch.batchId, batch.samples.length, lastSequence, now);
      updateTrip.run(now, tripId);
    })();

    return { inserted, lastSequence, duplicate: false };
  }

  completeTrip(tripId: string, input: CompleteTripInput): void {
    this.db
      .prepare(
        `UPDATE trips SET
          ended_at = ?,
          total_distance_meters = ?,
          max_speed_mps = ?,
          average_speed_mps = ?,
          final_sequence = ?,
          updated_at = ?
         WHERE id = ?`
      )
      .run(
        input.endedAt,
        input.totalDistanceMeters,
        input.maxSpeedMps,
        input.averageSpeedMps,
        input.finalSequence,
        new Date().toISOString(),
        tripId
      );
  }

  getTripSummary(tripId: string): (TripRow & { sampleCount: number }) | null {
    const row = this.db
      .prepare(
        `SELECT trips.*,
          (SELECT COUNT(*) FROM trip_samples WHERE trip_samples.trip_id = trips.id) as sampleCount
         FROM trips
         WHERE trips.id = ?`
      )
      .get(tripId) as (TripRow & { sampleCount: number }) | undefined;
    return row ?? null;
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        install_id TEXT NOT NULL UNIQUE,
        token_hash TEXT NOT NULL,
        platform TEXT NOT NULL,
        app_version TEXT NOT NULL,
        build_number TEXT NOT NULL,
        expo_push_token TEXT,
        native_push_token TEXT,
        push_platform TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        client_trip_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        units TEXT NOT NULL,
        mount_label TEXT,
        total_distance_meters REAL,
        max_speed_mps REAL,
        average_speed_mps REAL,
        final_sequence INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS trip_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        recorded_at TEXT NOT NULL,
        elapsed_ms INTEGER NOT NULL,
        speed_mps REAL NOT NULL,
        distance_meters REAL NOT NULL,
        heading_degrees REAL,
        heading_source TEXT NOT NULL DEFAULT 'none',
        heading_accuracy_degrees REAL,
        heading_quality TEXT NOT NULL DEFAULT 'poor',
        heading_reasons TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL,
        quality TEXT NOT NULL,
        quality_score REAL NOT NULL,
        quality_reasons TEXT NOT NULL,
        gps_accuracy_meters REAL,
        fix_age_ms INTEGER,
        native_speed_used INTEGER NOT NULL,
        is_moving INTEGER NOT NULL,
        is_stopped INTEGER NOT NULL,
        stale INTEGER NOT NULL,
        FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
        UNIQUE(trip_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS upload_batches (
        trip_id TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        sample_count INTEGER NOT NULL,
        last_sequence INTEGER NOT NULL,
        received_at TEXT NOT NULL,
        PRIMARY KEY (trip_id, batch_id),
        FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS live_sessions (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_trip_samples_trip_sequence
        ON trip_samples (trip_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_live_sessions_trip_token
        ON live_sessions (trip_id, token_hash);
    `);
    this.addColumnIfMissing('trip_samples', 'heading_source', "heading_source TEXT NOT NULL DEFAULT 'none'");
    this.addColumnIfMissing('trip_samples', 'heading_accuracy_degrees', 'heading_accuracy_degrees REAL');
    this.addColumnIfMissing('trip_samples', 'heading_quality', "heading_quality TEXT NOT NULL DEFAULT 'poor'");
    this.addColumnIfMissing('trip_samples', 'heading_reasons', "heading_reasons TEXT NOT NULL DEFAULT '[]'");
    this.addColumnIfMissing('devices', 'expo_push_token', 'expo_push_token TEXT');
    this.addColumnIfMissing('devices', 'native_push_token', 'native_push_token TEXT');
    this.addColumnIfMissing('devices', 'push_platform', 'push_platform TEXT');
  }

  private columnExists(tableName: string, columnName: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as {
      name: string;
    }[];
    return rows.some((row) => row.name === columnName);
  }

  private addColumnIfMissing(
    tableName: string,
    columnName: string,
    definition: string
  ): void {
    if (!this.columnExists(tableName, columnName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
    }
  }
}
