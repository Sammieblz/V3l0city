import { LocalStorageError } from './storageErrors';
import { sqliteTransaction, type ClosableSqlitePort, type SqlitePort } from './sqlitePort';

export const LOCAL_SCHEMA_VERSION = 3;
const names = ['personal-baseline', 'recording-lifecycle', 'connected-cache-ownership'] as const;

function columns(database: SqlitePort, table: string): Set<string> {
  return new Set(database.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name));
}
function addColumns(database: SqlitePort, table: string, definitions: readonly string[]): void {
  const existing = columns(database, table);
  for (const definition of definitions) {
    const name = definition.split(' ')[0];
    if (!existing.has(name)) database.execSync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

function personalBaseline(database: SqlitePort, appliedAt: string): void {
  database.execSync(`
    CREATE TABLE IF NOT EXISTS schema_migrations(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS preferences(
      id INTEGER PRIMARY KEY CHECK(id=1),units TEXT NOT NULL DEFAULT 'km/h',mount_index INTEGER NOT NULL DEFAULT 0,
      auto_start INTEGER NOT NULL DEFAULT 0,auto_save INTEGER NOT NULL DEFAULT 0,
      orientation_mode TEXT NOT NULL DEFAULT 'portrait',theme_preference TEXT NOT NULL DEFAULT 'system');
    INSERT OR IGNORE INTO preferences(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS trips(
      id TEXT PRIMARY KEY,started_at TEXT NOT NULL,ended_at TEXT NOT NULL,total_distance_meters REAL NOT NULL DEFAULT 0,
      max_speed_mps REAL NOT NULL DEFAULT 0,average_speed_mps REAL NOT NULL DEFAULT 0,units TEXT NOT NULL DEFAULT 'km/h',
      mount_label TEXT,record_status TEXT NOT NULL DEFAULT 'completed',local_updated_at TEXT NOT NULL DEFAULT '',
      deleted_at TEXT,cloud_synced_at TEXT,cloud_sync_error TEXT,sync_status TEXT NOT NULL DEFAULT 'local');
    CREATE TABLE IF NOT EXISTS trip_speed_samples(
      id INTEGER PRIMARY KEY AUTOINCREMENT,trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL DEFAULT 0,recorded_at TEXT NOT NULL,elapsed_ms INTEGER NOT NULL,speed_mps REAL NOT NULL,
      distance_meters REAL NOT NULL,heading_degrees REAL,heading_source TEXT NOT NULL DEFAULT 'none',
      heading_accuracy_degrees REAL,heading_quality TEXT NOT NULL DEFAULT 'poor',heading_reasons TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'none',quality TEXT NOT NULL DEFAULT 'medium',quality_score REAL NOT NULL DEFAULT 0.5,
      quality_reasons TEXT NOT NULL DEFAULT '[]',gps_accuracy_meters REAL,fix_age_ms INTEGER,
      native_speed_used INTEGER NOT NULL DEFAULT 0,is_moving INTEGER NOT NULL DEFAULT 0,is_stopped INTEGER NOT NULL DEFAULT 0,
      stale INTEGER NOT NULL DEFAULT 0,uploaded_at TEXT,upload_error TEXT);
    CREATE TABLE IF NOT EXISTS sync_outbox(
      id TEXT PRIMARY KEY,operation_type TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'pending',attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  `);
  addColumns(database, 'trips', ["record_status TEXT NOT NULL DEFAULT 'completed'", "local_updated_at TEXT NOT NULL DEFAULT ''",
    'deleted_at TEXT', 'cloud_synced_at TEXT', 'cloud_sync_error TEXT', "sync_status TEXT NOT NULL DEFAULT 'local'"]);
  addColumns(database, 'preferences', ["theme_preference TEXT NOT NULL DEFAULT 'system'"]);
  addColumns(database, 'trip_speed_samples', ["heading_source TEXT NOT NULL DEFAULT 'none'", 'heading_accuracy_degrees REAL',
    "heading_quality TEXT NOT NULL DEFAULT 'poor'", "heading_reasons TEXT NOT NULL DEFAULT '[]'", 'sequence INTEGER NOT NULL DEFAULT 0',
    'quality_score REAL NOT NULL DEFAULT 0.5', "quality_reasons TEXT NOT NULL DEFAULT '[]'", 'gps_accuracy_meters REAL', 'fix_age_ms INTEGER',
    'native_speed_used INTEGER NOT NULL DEFAULT 0', 'uploaded_at TEXT', 'upload_error TEXT']);
  database.runSync(`UPDATE trips SET local_updated_at=COALESCE(NULLIF(ended_at,''),NULLIF(started_at,''),?)
    WHERE local_updated_at IS NULL OR local_updated_at=''`, appliedAt);

  // Only unacknowledged, zero-only legacy groups have an unambiguous local ordering.
  const groups = database.getAllSync<{ trip_id: string }>('SELECT DISTINCT trip_id FROM trip_speed_samples');
  for (const group of groups) {
    const rows = database.getAllSync<{ id: number; sequence: number; uploaded_at: string | null }>(
      'SELECT id,sequence,uploaded_at FROM trip_speed_samples WHERE trip_id=? ORDER BY elapsed_ms,id', group.trip_id);
    const positive = rows.every((row) => Number.isSafeInteger(row.sequence) && row.sequence > 0);
    if (positive && new Set(rows.map((row) => row.sequence)).size === rows.length) continue;
    if (!rows.every((row) => row.sequence === 0 && row.uploaded_at === null)) throw new LocalStorageError('legacy_sequence_conflict');
    rows.forEach((row, index) => database.runSync('UPDATE trip_speed_samples SET sequence=? WHERE id=?', index + 1, row.id));
  }
  database.execSync(`
    CREATE INDEX IF NOT EXISTS idx_trip_speed_samples_trip_id ON trip_speed_samples(trip_id,elapsed_ms);
    CREATE INDEX IF NOT EXISTS idx_trip_speed_samples_upload ON trip_speed_samples(uploaded_at,trip_id,sequence);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_speed_samples_unique_sequence ON trip_speed_samples(trip_id,sequence);
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status,created_at);
  `);
  for (const id of ['2026-05-19-trip-speed-sample-telemetry','2026-05-26-trip-heading-diagnostics',
    '2026-05-27-offline-cloud-sync','2026-07-29-theme-preference']) {
    database.runSync('INSERT OR IGNORE INTO schema_migrations(id,applied_at) VALUES(?,?)', id, appliedAt);
  }
}

function recordingLifecycle(database: SqlitePort): void {
  database.execSync(`
    CREATE TABLE recording_states(
      trip_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
      state TEXT NOT NULL CHECK(state IN('recording','paused','completed')),checkpoint_at TEXT NOT NULL,
      last_sample_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_sample_sequence>=0),last_sample_recorded_at TEXT,
      last_sample_elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK(last_sample_elapsed_ms>=0));
    CREATE TABLE recording_gaps(
      id TEXT PRIMARY KEY,trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      reason TEXT NOT NULL CHECK(reason IN('restart','background','paused','permission','sensor','storage','sampling')),
      started_at TEXT NOT NULL,ended_at TEXT);
    CREATE INDEX idx_recording_gaps_trip ON recording_gaps(trip_id,started_at,id);
    CREATE UNIQUE INDEX idx_recording_gaps_open ON recording_gaps(trip_id) WHERE ended_at IS NULL;
  `);
}

function connectedFoundation(database: SqlitePort, preservePreferences: boolean): void {
  database.execSync(`
    CREATE TABLE recording_ownership(
      recording_id TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
      owner_provider TEXT CHECK(owner_provider IN('owned','legacy-supabase')),owner_user_id TEXT,adoption_consent_at TEXT,
      CHECK((owner_provider IS NULL)=(owner_user_id IS NULL)),CHECK(adoption_consent_at IS NULL OR owner_user_id IS NOT NULL));
    INSERT INTO recording_ownership(recording_id) SELECT id FROM trips;
    CREATE TABLE local_import_receipts(source_key TEXT PRIMARY KEY,source_digest TEXT NOT NULL CHECK(length(source_digest)=64),imported_at TEXT NOT NULL);
    CREATE TABLE local_storage_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE connected_cache_scopes(
      provider TEXT NOT NULL CHECK(provider IN('owned','legacy-supabase')),user_id TEXT NOT NULL,
      generation INTEGER NOT NULL CHECK(generation>0),active INTEGER NOT NULL CHECK(active IN(0,1)),
      PRIMARY KEY(provider,user_id));
    CREATE UNIQUE INDEX idx_connected_cache_active ON connected_cache_scopes(active) WHERE active=1;
    CREATE TABLE connected_cache_entities(
      provider TEXT NOT NULL,user_id TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,parent_id TEXT,
      revision INTEGER NOT NULL CHECK(revision>0),payload_json TEXT NOT NULL CHECK(length(payload_json)<=65536),
      expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>=0),stored_at_ms INTEGER NOT NULL,
      PRIMARY KEY(provider,user_id,kind,entity_id),
      FOREIGN KEY(provider,user_id) REFERENCES connected_cache_scopes(provider,user_id));
    CREATE INDEX idx_connected_cache_parent ON connected_cache_entities(provider,user_id,kind,parent_id,entity_id);
    CREATE INDEX idx_connected_cache_expiry ON connected_cache_entities(provider,user_id,expires_at_ms);
    CREATE TABLE connected_cache_references(
      provider TEXT NOT NULL,user_id TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,subject_user_id TEXT NOT NULL,
      PRIMARY KEY(provider,user_id,kind,entity_id,subject_user_id),
      FOREIGN KEY(provider,user_id,kind,entity_id) REFERENCES connected_cache_entities(provider,user_id,kind,entity_id) ON DELETE CASCADE);
    CREATE INDEX idx_connected_cache_subject ON connected_cache_references(provider,user_id,subject_user_id,kind,entity_id);
    CREATE TABLE connected_cache_barriers(
      provider TEXT NOT NULL,user_id TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),
      is_tombstone INTEGER NOT NULL DEFAULT 1 CHECK(is_tombstone IN(0,1)),
      PRIMARY KEY(provider,user_id,kind,entity_id),
      FOREIGN KEY(provider,user_id) REFERENCES connected_cache_scopes(provider,user_id));
    CREATE TABLE connected_cache_sync_state(
      provider TEXT NOT NULL,user_id TEXT NOT NULL,stream TEXT NOT NULL,cursor TEXT NOT NULL,
      PRIMARY KEY(provider,user_id,stream),FOREIGN KEY(provider,user_id) REFERENCES connected_cache_scopes(provider,user_id));
    CREATE TABLE connected_outbox(
      provider TEXT NOT NULL,user_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,generation INTEGER NOT NULL CHECK(generation>0),
      payload_json TEXT NOT NULL CHECK(length(payload_json)<=65536),state TEXT NOT NULL CHECK(state IN('queued','blocked','done')),
      created_at_ms INTEGER NOT NULL,PRIMARY KEY(provider,user_id,idempotency_key),
      FOREIGN KEY(provider,user_id) REFERENCES connected_cache_scopes(provider,user_id));
    CREATE INDEX idx_connected_outbox_pending ON connected_outbox(provider,user_id,state,generation,created_at_ms,idempotency_key);
  `);
  database.runSync('INSERT INTO local_storage_metadata(key,value) VALUES(?,?)', 'legacy_preferences_can_import', preservePreferences ? '0' : '1');
}

function validateSchema(database: SqlitePort): void {
  const required: Record<string, string[]> = {
    preferences: ['id','theme_preference'], trips: ['id','record_status','local_updated_at','deleted_at','sync_status'],
    trip_speed_samples: ['id','trip_id','sequence','uploaded_at','heading_source'], sync_outbox: ['id','status','payload_json'],
    recording_states: ['trip_id','state','last_sample_elapsed_ms'], recording_gaps: ['id','trip_id','reason'],
    recording_ownership: ['recording_id','owner_provider','owner_user_id','adoption_consent_at'],
    local_import_receipts: ['source_key','source_digest'], local_storage_metadata: ['key','value'],
    connected_cache_scopes: ['provider','user_id','generation','active'],
    connected_cache_entities: ['provider','user_id','kind','entity_id','revision','expires_at_ms'],
    connected_cache_barriers: ['provider','user_id','kind','entity_id','revision'],
    connected_cache_references: ['provider','user_id','subject_user_id'], connected_cache_sync_state: ['provider','user_id','cursor'],
    connected_outbox: ['provider','user_id','idempotency_key','generation','state'],
  };
  for (const [table, expected] of Object.entries(required)) {
    const actual = columns(database, table);
    if (expected.some((name) => !actual.has(name))) throw new LocalStorageError('migration_history_conflict');
  }
  if (database.getAllSync('PRAGMA foreign_key_check').length) throw new LocalStorageError('migration_failed');
}

export function migrateLocalDatabase(database: SqlitePort, appliedAt = new Date().toISOString()): void {
  const version = database.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  if (!Number.isSafeInteger(version) || version < 0 || version > LOCAL_SCHEMA_VERSION) throw new LocalStorageError('unsupported_schema');
  const historyExists = database.getFirstSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='local_schema_migrations'");
  const history = historyExists ? database.getAllSync<{ version: number; name: string }>('SELECT version,name FROM local_schema_migrations ORDER BY version') : [];
  if (history.length !== version || history.some((row, index) => row.version !== index + 1 || row.name !== names[index])) {
    throw new LocalStorageError('migration_history_conflict');
  }
  database.execSync('PRAGMA foreign_keys=ON');
  if (version === LOCAL_SCHEMA_VERSION) { validateSchema(database); return; }
  const preferencesExisted = database.getFirstSync("SELECT name FROM sqlite_master WHERE type='table' AND name='preferences'") != null;
  try {
    sqliteTransaction(database, () => {
      database.execSync('CREATE TABLE IF NOT EXISTS local_schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,applied_at TEXT NOT NULL)');
      const apply = [() => personalBaseline(database, appliedAt), () => recordingLifecycle(database), () => connectedFoundation(database, preferencesExisted)];
      for (let current = version; current < LOCAL_SCHEMA_VERSION; current++) {
        apply[current]();
        database.runSync('INSERT INTO local_schema_migrations(version,name,applied_at) VALUES(?,?,?)', current + 1, names[current], appliedAt);
      }
      validateSchema(database);
      database.execSync(`PRAGMA user_version=${LOCAL_SCHEMA_VERSION}`);
    });
  } catch (error) {
    if (error instanceof LocalStorageError) throw error;
    throw new LocalStorageError('migration_failed', { cause: error });
  }
}

/** Publish only a fully initialized connection; failed candidates are closed, never deleted. */
export function createLocalDatabaseAccess<T extends ClosableSqlitePort>(open: () => T, initialize: (database: T) => void = migrateLocalDatabase) {
  let database: T | null = null;
  return {
    get(): T {
      if (database) return database;
      let candidate: T | undefined;
      try {
        candidate = open(); initialize(candidate); database = candidate; return candidate;
      } catch (error) {
        try { candidate?.closeSync(); } catch { /* Preserve the initialization failure. */ }
        database = null;
        if (error instanceof LocalStorageError) throw error;
        throw new LocalStorageError('storage_unavailable', { cause: error });
      }
    },
  };
}
