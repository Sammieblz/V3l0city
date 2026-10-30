import Database from 'better-sqlite3';
import type { ClosableSqlitePort } from '../src/database/sqlitePort';

export function realSqlite(path = ':memory:') {
  const connection = new Database(path);
  const port: ClosableSqlitePort = {
    execSync: (sql) => { connection.exec(sql); },
    runSync: (sql, ...parameters) => {
      const result = connection.prepare(sql).run(...parameters);
      return { changes: result.changes,lastInsertRowId: Number(result.lastInsertRowid) };
    },
    getAllSync: <T>(sql: string, ...parameters: unknown[]) => connection.prepare(sql).all(...parameters) as T[],
    getFirstSync: <T>(sql: string, ...parameters: unknown[]) => (connection.prepare(sql).get(...parameters) ?? null) as T | null,
    withTransactionSync: (task) => { connection.transaction(task).immediate(); },
    closeSync: () => { connection.close(); },
  };
  return { connection,port };
}

/** Frozen old shapes, not production's final CREATE statements. */
export function historicalPersonalSchema(database: ClosableSqlitePort, options: { sequence?: boolean;latest?: boolean } = {}) {
  const sequence = options.sequence || options.latest ? ',sequence INTEGER NOT NULL DEFAULT 0' : '';
  const sampleExtras = options.latest ? `,heading_source TEXT NOT NULL DEFAULT 'none',heading_accuracy_degrees REAL,
    heading_quality TEXT NOT NULL DEFAULT 'poor',heading_reasons TEXT NOT NULL DEFAULT '[]',quality_score REAL NOT NULL DEFAULT 0.5,
    quality_reasons TEXT NOT NULL DEFAULT '[]',gps_accuracy_meters REAL,fix_age_ms INTEGER,native_speed_used INTEGER NOT NULL DEFAULT 0,
    uploaded_at TEXT,upload_error TEXT` : '';
  const tripExtras = options.latest ? `,record_status TEXT NOT NULL DEFAULT 'completed',local_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT,cloud_synced_at TEXT,cloud_sync_error TEXT,sync_status TEXT NOT NULL DEFAULT 'local'` : '';
  database.execSync(`
    CREATE TABLE schema_migrations(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES('old-unrelated-marker','2025-01-01');
    CREATE TABLE preferences(id INTEGER PRIMARY KEY CHECK(id=1),units TEXT NOT NULL DEFAULT 'km/h',mount_index INTEGER NOT NULL DEFAULT 0,
      auto_start INTEGER NOT NULL DEFAULT 0,auto_save INTEGER NOT NULL DEFAULT 0,orientation_mode TEXT NOT NULL DEFAULT 'portrait'
      ${options.latest ? ",theme_preference TEXT NOT NULL DEFAULT 'system'" : ''});
    INSERT INTO preferences(id,units,mount_index,auto_start,auto_save,orientation_mode) VALUES(1,'MPH',3,1,1,'landscape');
    CREATE TABLE trips(id TEXT PRIMARY KEY,started_at TEXT NOT NULL,ended_at TEXT NOT NULL,total_distance_meters REAL NOT NULL DEFAULT 0,
      max_speed_mps REAL NOT NULL DEFAULT 0,average_speed_mps REAL NOT NULL DEFAULT 0,units TEXT NOT NULL DEFAULT 'km/h',mount_label TEXT ${tripExtras});
    CREATE TABLE trip_speed_samples(id INTEGER PRIMARY KEY AUTOINCREMENT,trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      recorded_at TEXT NOT NULL,elapsed_ms INTEGER NOT NULL,speed_mps REAL NOT NULL,distance_meters REAL NOT NULL,heading_degrees REAL,
      source TEXT NOT NULL DEFAULT 'none',quality TEXT NOT NULL DEFAULT 'medium',is_moving INTEGER NOT NULL DEFAULT 0,
      is_stopped INTEGER NOT NULL DEFAULT 0,stale INTEGER NOT NULL DEFAULT 0 ${sequence} ${sampleExtras});
    CREATE TABLE sync_outbox(id TEXT PRIMARY KEY,operation_type TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'pending',attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  `);
  for (const [index, id] of ['1728150645123','personal-completed','personal-deleted'].entries()) {
    database.runSync(`INSERT INTO trips(id,started_at,ended_at,total_distance_meters,max_speed_mps,average_speed_mps,units,mount_label)
      VALUES(?,?,?,?,?,?,?,?)`, id,'2026-01-01T00:00:00Z','2026-01-01T00:00:05Z',index + 1,10,5,'MPH','Handlebar');
  }
  database.execSync(`INSERT INTO trip_speed_samples(trip_id,recorded_at,elapsed_ms,speed_mps,distance_meters,heading_degrees)
    VALUES('1728150645123','2026-01-01T00:00:01Z',1000,7,1,90),
      ('1728150645123','2026-01-01T00:00:01Z',1000,8,2,91),
      ('personal-completed','2026-01-01T00:00:02Z',2000,9,3,92);
    INSERT INTO sync_outbox VALUES('legacy-pending','sync_trip','trip','personal-completed','{"tripId":"personal-completed"}',
      'pending',3,'offline','2026-01-01','2026-01-02');
    INSERT INTO sync_outbox VALUES('legacy-error','delete_trip','trip','personal-deleted','{"tripId":"personal-deleted"}',
      'error',5,'retry later','2026-01-02','2026-01-03');
    INSERT INTO sync_outbox VALUES('legacy-done','sync_trip','trip','1728150645123','{}','done',1,NULL,'2026-01-01','2026-01-01');`);
  if (options.latest) database.execSync(`UPDATE trip_speed_samples SET sequence=id,quality_score=0.87,
    quality_reasons='["preserved"]',heading_reasons='["course"]',native_speed_used=1;
    UPDATE trip_speed_samples SET uploaded_at='2026-01-02',upload_error='preserve-upload-error' WHERE id=1;
    UPDATE trips SET record_status='draft' WHERE id='1728150645123';
    UPDATE trips SET deleted_at='2026-01-03',sync_status='error',cloud_sync_error='preserve-sync-error' WHERE id='personal-deleted';
    UPDATE trips SET cloud_synced_at='2026-01-02',sync_status='synced' WHERE id='personal-completed';
    UPDATE preferences SET theme_preference='dark';
    CREATE UNIQUE INDEX idx_trip_speed_samples_unique_sequence ON trip_speed_samples(trip_id,sequence);`);
}

export function snapshotPersonal(connection: Database.Database) {
  const columns = Object.fromEntries(['preferences','trips','trip_speed_samples','sync_outbox'].map((table) => [table,
    (connection.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name)]));
  const read = () => Object.fromEntries(Object.entries(columns).map(([table, names]) => [table,
    connection.prepare(`SELECT ${names.map((name) => `"${name.replace(/"/g, '""')}"`).join(',')} FROM ${table} ORDER BY rowid`).all()]));
  return { before: read(),read };
}
