import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface Migration { version: number; name: string; sql: string; checksum: string }
export interface MigrationConnection {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
export class MigrationError extends Error {
  constructor(public readonly code: 'INVALID_MIGRATION' | 'CHECKSUM_MISMATCH' | 'HISTORY_MISMATCH' | 'MIGRATION_FAILED', message: string, options?: ErrorOptions) {
    super(message, options); this.name = 'MigrationError';
  }
}

export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

export function validateMigrationSql(sql: string): void {
  // Mask strings/functions/comments before checking runner-owned transaction commands.
  const policyText = sql.replace(/\$([A-Za-z_][A-Za-z_0-9]*)?\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/'(?:''|[^'])*'/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ');
  if (/(?:^|;)\s*(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|PREPARE\s+TRANSACTION|SAVEPOINT|RELEASE\s+SAVEPOINT|VACUUM|CREATE\s+DATABASE|DROP\s+DATABASE|ALTER\s+SYSTEM)\b/i.test(policyText)
    || /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(policyText)) {
    throw new MigrationError('INVALID_MIGRATION', 'Migrations must be transactional; runner owns transaction boundaries.');
  }
}

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  if (!names.length) throw new MigrationError('INVALID_MIGRATION', 'No SQL migrations found.');
  const migrations: Migration[] = [];
  for (const name of names) {
    const match = /^(\d{4})_[a-z][a-z0-9_]*\.sql$/.exec(name);
    if (!match || Number(match[1]) !== migrations.length + 1) throw new MigrationError('INVALID_MIGRATION', 'Migration versions must be unique, sequential and start at 0001.');
    const sql = (await readFile(path.join(directory, name), 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (!sql.trim() || Buffer.byteLength(sql, 'utf8') > 1_048_576) throw new MigrationError('INVALID_MIGRATION', 'Migration is empty or exceeds the bounded SQL file size.');
    validateMigrationSql(sql);
    migrations.push({ version: Number(match[1]), name, sql, checksum: migrationChecksum(sql) });
  }
  return migrations;
}

/** Dedicated connected client only: session advisory lock must remain on one connection. */
export async function migrate(connection: MigrationConnection, migrations: readonly Migration[], options: { lockTimeoutMs?: number } = {}): Promise<{ applied: number[]; alreadyApplied: number[] }> {
  const timeout = options.lockTimeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) throw new MigrationError('INVALID_MIGRATION', 'Invalid migration lock timeout.');
  for (let index = 0; index < migrations.length; index++) {
    const item = migrations[index];
    if (item.version !== index + 1 || item.checksum !== migrationChecksum(item.sql)) throw new MigrationError('INVALID_MIGRATION', 'Invalid migration sequence or checksum.');
    validateMigrationSql(item.sql);
  }
  if (!migrations.length) throw new MigrationError('INVALID_MIGRATION', 'No migrations supplied.');
  let locked = false;
  let failed = false;
  const result = { applied: [] as number[], alreadyApplied: [] as number[] };
  try {
    await connection.query("SELECT set_config('lock_timeout',$1,false)", [`${timeout}ms`]);
    await connection.query('SELECT pg_advisory_lock($1,$2)', [1_443_202_600, 2_000]);
    locked = true;
    await connection.query('BEGIN');
    try {
      await connection.query('CREATE SCHEMA IF NOT EXISTS v3l0city');
      await connection.query(`CREATE TABLE IF NOT EXISTS v3l0city.schema_migrations (
        version integer PRIMARY KEY CHECK (version > 0), name text NOT NULL UNIQUE,
        checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp(), duration_ms integer NOT NULL CHECK (duration_ms >= 0)
      )`);
      await connection.query('REVOKE ALL ON v3l0city.schema_migrations FROM PUBLIC');
      await connection.query('COMMIT');
    } catch (error) { await connection.query('ROLLBACK'); throw error; }
    const history = await connection.query('SELECT version,name,checksum FROM v3l0city.schema_migrations ORDER BY version');
    for (let index = 0; index < history.rows.length; index++) {
      const row = history.rows[index];
      const migration = migrations[index];
      if (!migration || row.version !== migration.version || row.name !== migration.name) throw new MigrationError('HISTORY_MISMATCH', 'Applied migration history is missing, renamed or out of sequence.');
      if (row.checksum !== migration.checksum) throw new MigrationError('CHECKSUM_MISMATCH', `Applied migration changed: ${migration.name}`);
      result.alreadyApplied.push(migration.version);
    }
    for (const migration of migrations.slice(history.rows.length)) {
      const started = performance.now();
      await connection.query('BEGIN');
      try {
        await connection.query(migration.sql);
        await connection.query('INSERT INTO v3l0city.schema_migrations(version,name,checksum,duration_ms) VALUES ($1,$2,$3,$4)', [
          migration.version, migration.name, migration.checksum, Math.max(0, Math.round(performance.now() - started)),
        ]);
        await connection.query('COMMIT');
        result.applied.push(migration.version);
      } catch (error) {
        await connection.query('ROLLBACK');
        throw new MigrationError('MIGRATION_FAILED', `Migration rolled back: ${migration.name}`, { cause: error });
      }
    }
    return result;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (locked) {
      try { await connection.query('SELECT pg_advisory_unlock($1,$2)', [1_443_202_600, 2_000]); }
      catch (error) { if (!failed) throw error; }
    }
  }
}
