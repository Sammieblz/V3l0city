import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync,readFileSync,rmSync,rmdirSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { createLocalDatabaseAccess,LOCAL_SCHEMA_VERSION,migrateLocalDatabase } from '../src/database/sqliteMigrations';
import { LocalStorageError } from '../src/database/storageErrors';
import { realSqlite,historicalPersonalSchema,snapshotPersonal } from '../test-support/sqliteFixture';

const appliedAt = '2026-10-28T00:00:00Z';
function expectCode(task: () => unknown, code: string) {
  try { task(); throw new Error('Expected storage operation to fail.'); }
  catch (error) { expect(error).toMatchObject({ code }); }
}
const files: string[] = [];
function fixturePath() { const directory = mkdtempSync(join(tmpdir(),'v3l0city-local-migration-'));files.push(directory);return join(directory,'fixture.sqlite'); }
afterEach(() => {
  for (const directory of files.splice(0)) {
    expect(resolve(directory).startsWith(resolve(tmpdir()))).toBe(true);
    for (const name of ['fixture.sqlite','fixture.sqlite-journal','fixture.sqlite-wal','fixture.sqlite-shm','checkpoint']) rmSync(join(directory,name),{ force: true });
    rmdirSync(directory);
  }
});

test('fresh database atomically receives versioned personal, lifecycle and connected tables', () => {
  const { connection,port } = realSqlite();
  try {
    migrateLocalDatabase(port,appliedAt);
    expect(connection.pragma('user_version',{ simple:true })).toBe(LOCAL_SCHEMA_VERSION);
    expect(connection.pragma('foreign_keys',{ simple:true })).toBe(1);
    expect(connection.prepare('SELECT COUNT(*) AS count FROM local_schema_migrations').get()).toEqual({ count:3 });
    expect(connection.prepare('SELECT * FROM recording_states').all()).toEqual([]);
    expect(connection.prepare('SELECT * FROM recording_gaps').all()).toEqual([]);
    const first = connection.prepare('SELECT * FROM local_schema_migrations').all();
    migrateLocalDatabase(port,'2030-01-01T00:00:00Z');
    expect(connection.prepare('SELECT * FROM local_schema_migrations').all()).toEqual(first);
    expect(connection.pragma('foreign_key_check')).toEqual([]);
  } finally { connection.close(); }
});

test('populated pre-telemetry schema upgrades before indexes while preserving all original data', () => {
  const { connection,port } = realSqlite();
  try {
    historicalPersonalSchema(port);
    const personal = snapshotPersonal(connection);
    migrateLocalDatabase(port,appliedAt);
    expect(personal.read()).toEqual(personal.before);
    expect(connection.prepare('SELECT id,sequence FROM trip_speed_samples ORDER BY id').all())
      .toEqual([{ id:1,sequence:1 },{ id:2,sequence:2 },{ id:3,sequence:1 }]);
    expect(connection.prepare('SELECT DISTINCT local_updated_at FROM trips').all()).toEqual([{ local_updated_at:'2026-01-01T00:00:05Z' }]);
    expect(connection.prepare('SELECT * FROM recording_states').all()).toEqual([]);
    expect(connection.prepare('SELECT COUNT(*) AS count FROM recording_ownership WHERE owner_user_id IS NULL AND adoption_consent_at IS NULL').get()).toEqual({ count:3 });
    expect(connection.prepare("SELECT applied_at FROM schema_migrations WHERE id='old-unrelated-marker'").get()).toEqual({ applied_at:'2025-01-01' });
  } finally { connection.close(); }
});

test('latest legacy database preserves drafts, tombstones, preferences, sample diagnostics and every outbox field', () => {
  const { connection,port } = realSqlite();
  try {
    historicalPersonalSchema(port,{ latest:true });
    const personal = snapshotPersonal(connection);
    migrateLocalDatabase(port,appliedAt);
    expect(personal.read()).toEqual(personal.before);
    migrateLocalDatabase(port,appliedAt);
    expect(personal.read()).toEqual(personal.before);
    expect(connection.pragma('foreign_key_check')).toEqual([]);
  } finally { connection.close(); }
});

test('zero-only unuploaded sequences are repaired without removing rows; ambiguous uploaded or positive collisions retain everything', () => {
  const safe = realSqlite();
  try {
    historicalPersonalSchema(safe.port,{ sequence:true });
    const original = safe.connection.prepare('SELECT * FROM trip_speed_samples ORDER BY id').all() as Record<string,unknown>[];
    migrateLocalDatabase(safe.port);
    const upgraded = safe.connection.prepare('SELECT * FROM trip_speed_samples ORDER BY id').all() as Record<string,unknown>[];
    expect(upgraded.map((row) => Object.fromEntries(Object.keys(original[0]).map((key) => [key,key==='sequence' ? 0 : row[key]])))).toEqual(original);
  } finally { safe.connection.close(); }
  for (const scenario of ['positive','uploaded'] as const) {
    const { connection,port } = realSqlite();
    try {
      historicalPersonalSchema(port,{ sequence:true });
      if (scenario==='positive') connection.exec('UPDATE trip_speed_samples SET sequence=1');
      else connection.exec("ALTER TABLE trip_speed_samples ADD COLUMN uploaded_at TEXT; UPDATE trip_speed_samples SET uploaded_at='2026-01-02' WHERE id=1");
      const personal = snapshotPersonal(connection);
      expectCode(() => migrateLocalDatabase(port),'legacy_sequence_conflict');
      expect(personal.read()).toEqual(personal.before);
      expect(connection.pragma('user_version',{ simple:true })).toBe(0);
      expect(connection.prepare("SELECT name FROM sqlite_master WHERE name='local_schema_migrations'").get()).toBeUndefined();
    } finally { connection.close(); }
  }
});

test('failed initialization rolls back schema, closes its candidate and opens a fresh successful connection on retry', () => {
  const path = fixturePath();
  const seed = realSqlite(path); historicalPersonalSchema(seed.port); seed.connection.close();
  const opened: ReturnType<typeof realSqlite>[] = [];
  let fail = true;
  const access = createLocalDatabaseAccess(() => { const next=realSqlite(path);opened.push(next);return next.port; },(port) => {
    migrateLocalDatabase({ ...port,execSync(sql) { if (fail && sql.includes('CREATE TABLE recording_states')) { fail=false;throw new Error('private-injected-driver-error'); } port.execSync(sql); } });
  });
  expectCode(() => access.get(),'migration_failed');
  expect(opened[0].connection.open).toBe(false);
  const check = realSqlite(path);
  expect(check.connection.pragma('user_version',{ simple:true })).toBe(0);
  expect(check.connection.prepare("SELECT name FROM sqlite_master WHERE name='recording_states'").get()).toBeUndefined();
  check.connection.close();
  const ready = access.get();
  expect(access.get()).toBe(ready);
  expect(opened).toHaveLength(2);
  expect(opened[1].connection.prepare('SELECT COUNT(*) AS count FROM trips').get()).toEqual({ count:3 });
  opened[1].connection.close();
});

test('future versions and inconsistent history fail without schema mutation or recovery deletion', () => {
  const { connection,port } = realSqlite();
  try {
    historicalPersonalSchema(port,{ latest:true });
    const schema = connection.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
    connection.pragma(`user_version=${LOCAL_SCHEMA_VERSION+1}`);
    expectCode(() => migrateLocalDatabase(port),'unsupported_schema');
    expect(connection.prepare('SELECT sql FROM sqlite_master ORDER BY name').all()).toEqual(schema);
    connection.pragma('user_version=1');
    expectCode(() => migrateLocalDatabase(port),'migration_history_conflict');
    expect(connection.prepare('SELECT sql FROM sqlite_master ORDER BY name').all()).toEqual(schema);
  } finally { connection.close(); }
});

test('actual SQLITE_FULL during an upgrade rolls back and preserves the old file for a later retry', () => {
  const path = fixturePath();
  const { connection,port } = realSqlite(path);
  historicalPersonalSchema(port,{ latest:true });
  const personal = snapshotPersonal(connection);
  const pageCount = connection.pragma('page_count',{ simple:true }) as number;
  connection.pragma(`max_page_count=${pageCount}`);
  let failure: unknown;
  try { migrateLocalDatabase(port); } catch (error) { failure=error; }
  expect(failure).toBeInstanceOf(LocalStorageError);
  expect((failure as Error & { cause:{ code:string } }).cause).toMatchObject({ code:'SQLITE_FULL' });
  expect(personal.read()).toEqual(personal.before);
  expect(connection.pragma('user_version',{ simple:true })).toBe(0);
  connection.close();
  expect(existsSync(path)).toBe(true);
  const reopened = realSqlite(path);
  try { migrateLocalDatabase(reopened.port);expect(reopened.connection.prepare('SELECT COUNT(*) AS count FROM trips').get()).toEqual({ count:3 }); }
  finally { reopened.connection.close(); }
});

test('process termination after real migration DDL recovers its hot journal and resumes on reopen', async () => {
  const path = fixturePath();
  const marker = join(path,'..','checkpoint');
  const seeded = realSqlite(path); historicalPersonalSchema(seeded.port,{ latest:true });
  const original = snapshotPersonal(seeded.connection).before; seeded.connection.close();
  const program = `
    const fs=require('node:fs');const ts=require(process.argv[1]);const Database=require(process.argv[2]);
    require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
    const {migrateLocalDatabase}=require(process.argv[3]);const db=new Database(process.argv[4]);
    const port={execSync(sql){db.exec(sql);if(sql.includes('CREATE TABLE recording_states')){fs.writeFileSync(process.argv[5],'after-lifecycle-ddl');process.kill(process.pid,'SIGKILL');}},
      runSync(sql,...p){const r=db.prepare(sql).run(...p);return {changes:r.changes,lastInsertRowId:Number(r.lastInsertRowid)}},
      getAllSync(sql,...p){return db.prepare(sql).all(...p)},getFirstSync(sql,...p){return db.prepare(sql).get(...p)||null}};
    migrateLocalDatabase(port);
  `;
  const child = spawn(process.execPath,['-e',program,require.resolve('typescript'),require.resolve('better-sqlite3'),
    resolve(__dirname,'../src/database/sqliteMigrations.ts'),path,marker],{ stdio:['ignore','pipe','pipe'],windowsHide:true });
  let errors='';child.stderr.on('data',(chunk:Buffer)=>{errors+=chunk.toString();});
  const [code,signal] = await once(child,'exit');
  expect(code!==0 || signal!==null).toBe(true);
  expect(errors).toBe('');
  expect(readFileSync(marker,'utf8')).toBe('after-lifecycle-ddl');
  const reopened = realSqlite(path);
  try {
    expect(reopened.connection.pragma('user_version',{ simple:true })).toBe(0);
    expect(reopened.connection.prepare("SELECT name FROM sqlite_master WHERE name='recording_states'").get()).toBeUndefined();
    expect(snapshotPersonal(reopened.connection).before).toEqual(original);
    migrateLocalDatabase(reopened.port);
    expect(snapshotPersonal(reopened.connection).before).toEqual(original);
  } finally { reopened.connection.close(); }
});
