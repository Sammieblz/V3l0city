import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { loadMigrations, migrate, migrationChecksum, validateMigrationSql, type MigrationConnection } from './migrator';

describe('portable migration validation', () => {
  it('uses canonical UTF-8/LF checksums and detects content changes', () => {
    assert.equal(migrationChecksum('SELECT 1;\r\n'), migrationChecksum('\uFEFFSELECT 1;\n'));
    assert.notEqual(migrationChecksum('SELECT 1;'), migrationChecksum('SELECT 2;'));
  });

  it('rejects runner-external transaction operations but allows procedural functions and comments', () => {
    for (const sql of ['BEGIN; SELECT 1;', 'SELECT 1; COMMIT;', 'SELECT 1; END;', 'ABORT;',
      "PREPARE TRANSACTION 'outside_runner';", 'SAVEPOINT outside_runner;', 'RELEASE SAVEPOINT outside_runner;',
      'VACUUM;', 'CREATE INDEX CONCURRENTLY x ON y(z);', 'CREATE DATABASE other;']) assert.throws(() => validateMigrationSql(sql), /transactional/);
    assert.doesNotThrow(() => validateMigrationSql("-- BEGIN in comment\nCREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql; SELECT 'COMMIT;';"));
  });

  it('requires unique sequential bounded migrations', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'v3l0city-migrate-'));
    try {
      await writeFile(path.join(directory, '0002_gap.sql'), 'SELECT 1;');
      await assert.rejects(loadMigrations(directory), /sequential/);
      await rm(path.join(directory, '0002_gap.sql'));
      await writeFile(path.join(directory, '0001_initial.sql'), 'SELECT 1;');
      assert.equal((await loadMigrations(directory))[0].version, 1);
      await writeFile(path.join(directory, '0001_duplicate.sql'), 'SELECT 1;');
      await assert.rejects(loadMigrations(directory), /sequential/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('does not open or lock a database for invalid supplied migrations', async () => {
    let calls = 0;
    const connection: MigrationConnection = { async query() { calls++; return { rows: [] }; } };
    await assert.rejects(migrate(connection, []), /No migrations/);
    await assert.rejects(migrate(connection, [{ version: 1, name: '0001_bad.sql', sql: 'SELECT 1;', checksum: 'bad' }]), /checksum/);
    assert.equal(calls, 0);
  });
});
