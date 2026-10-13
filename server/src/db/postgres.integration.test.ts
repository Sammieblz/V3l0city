import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Client } from 'pg';
import { loadMigrations, migrate, migrationChecksum, type Migration, type MigrationConnection } from './migrator';
import { grantApplicationRole } from './roles';

const connectionString = process.env.TEST_DATABASE_URL;
const migrationsDirectory = process.env.MIGRATIONS_DIRECTORY ?? path.resolve(process.cwd(), 'server/migrations');
const role = `v3l0city_app_test_${process.pid}`;
const outsider = `v3l0city_outsider_test_${process.pid}`;
let client: Client;
let migrations: Migration[];
const users = [randomUUID(), randomUUID(), randomUUID()];
const trips = [randomUUID(), randomUUID()];

async function connect(): Promise<Client> {
  const next = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await next.connect();
  return next;
}
async function expectSqlState(sql: string, values: unknown[], expected: string) {
  await assert.rejects(client.query(sql, values), (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === expected));
}
async function createTrip(id: string, owner: string) {
  await client.query('BEGIN');
  try {
    await client.query('INSERT INTO v3l0city.trips(id,host_id,title) VALUES ($1,$2,$3)', [id, owner, 'Synthetic trip']);
    await client.query("INSERT INTO v3l0city.trip_memberships(trip_id,user_id,role,state) VALUES ($1,$2,'host','joined')", [id, owner]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

describe('ordinary PostgreSQL foundation (explicit isolated TEST_DATABASE_URL)', { skip: !connectionString }, () => {
  before(async () => {
    client = await connect();
    const actual = await client.query('SELECT current_database() AS database');
    if (!/^[a-z0-9_]+_test$/.test(String(actual.rows[0].database))) {
      await client.end();
      throw new Error('Destructive integration fixtures require a dedicated database ending _test.');
    }
    await client.query('DROP SCHEMA IF EXISTS v3l0city CASCADE');
    migrations = await loadMigrations(migrationsDirectory);
    assert.deepEqual(await migrate(client, migrations), { applied: [1], alreadyApplied: [] });
    for (let index = 0; index < users.length; index++) await client.query('INSERT INTO v3l0city.users(id,email,handle,display_name) VALUES ($1,$2,$3,$4)', [users[index], `fixture${index}@example.test`, `fixture_${index}`, `Fixture ${index}`]);
    await createTrip(trips[0], users[0]);
    await createTrip(trips[1], users[1]);
  });

  after(async () => {
    if (!client) return;
    await client.query('RESET ROLE');
    await client.query('DROP SCHEMA IF EXISTS v3l0city CASCADE');
    await client.query(`DROP ROLE IF EXISTS "${role}"`);
    await client.query(`DROP ROLE IF EXISTS "${outsider}"`);
    await client.end();
  });

  it('bootstraps without extensions, preserves repeated application and refuses checksum drift', async () => {
    assert.deepEqual(await migrate(client, migrations), { applied: [], alreadyApplied: [1] });
    const changed = { ...migrations[0], sql: `${migrations[0].sql}\n-- changed` };
    changed.checksum = migrationChecksum(changed.sql);
    await assert.rejects(migrate(client, [changed]), /Applied migration changed/);
    const extension = await client.query("SELECT count(*)::int AS count FROM pg_extension WHERE extname NOT IN ('plpgsql')");
    assert.equal(extension.rows[0].count, 0);
    const tables = await client.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='v3l0city'");
    assert.ok(tables.rows[0].count >= 25);
  });

  it('enforces owner-scoped device, vehicle and backup keys plus participant authorship', async () => {
    const device = randomUUID(), vehicle = randomUUID(), media = randomUUID();
    await client.query("INSERT INTO v3l0city.devices(id,user_id,platform) VALUES ($1,$2,'ios')", [device, users[0]]);
    await expectSqlState('INSERT INTO v3l0city.auth_sessions(id,user_id,device_id,refresh_token_hash,expires_at) VALUES ($1,$2,$3,$4,clock_timestamp()+interval\'1 hour\')', [randomUUID(), users[1], device, 'a'.repeat(64)], '23503');
    await client.query("INSERT INTO v3l0city.vehicles(id,owner_id,nickname,type,marker_key) VALUES ($1,$2,'Fixture','car','default')", [vehicle, users[0]]);
    await expectSqlState("INSERT INTO v3l0city.trip_memberships(trip_id,user_id,role,state,vehicle_id) VALUES ($1,$2,'member','joined',$3)", [trips[0], users[1], vehicle], '23503');
    await expectSqlState("INSERT INTO v3l0city.trip_messages(id,trip_id,author_id,kind,body) VALUES ($1,$2,$3,'user','hello')", [randomUUID(), trips[0], users[2]], '23503');
    await client.query("INSERT INTO v3l0city.media_objects(id,owner_id,object_key,purpose,state) VALUES ($1,$2,$3,'trip_backup','ready')", [media, users[0], `fixture/${media}`]);
    await expectSqlState('INSERT INTO v3l0city.cloud_trip_backups(id,owner_id,local_trip_id,media_object_id,format_version,consented_at) VALUES ($1,$2,$3,$4,1,clock_timestamp())', [randomUUID(), users[1], randomUUID(), media], '23503');
    const originalLocalId = '1728150645123';
    const backup = await client.query('INSERT INTO v3l0city.cloud_trip_backups(id,owner_id,local_trip_id,media_object_id,format_version,consented_at) VALUES ($1,$2,$3,$4,1,clock_timestamp()) RETURNING local_trip_id', [randomUUID(), users[0], originalLocalId, media]);
    assert.equal(backup.rows[0].local_trip_id, originalLocalId);
    await expectSqlState('INSERT INTO v3l0city.cloud_trip_backups(id,owner_id,local_trip_id,media_object_id,format_version,consented_at) VALUES ($1,$2,$3,$4,1,clock_timestamp())', [randomUUID(), users[0], '', media], '23514');
  });

  it('enforces normalized relationship uniqueness, lifecycle, coordinates and revision changes', async () => {
    await expectSqlState('INSERT INTO v3l0city.blocks(blocker_id,blocked_id) VALUES ($1,$1)', [users[0]], '23514');
    await client.query('INSERT INTO v3l0city.buddy_requests(id,requester_id,addressee_id) VALUES ($1,$2,$3)', [randomUUID(), users[0], users[1]]);
    await expectSqlState('INSERT INTO v3l0city.buddy_requests(id,requester_id,addressee_id) VALUES ($1,$2,$3)', [randomUUID(), users[1], users[0]], '23505');
    await expectSqlState("UPDATE v3l0city.trips SET state='ended',revision=revision+1 WHERE id=$1", [trips[0]], '23514');
    await expectSqlState("INSERT INTO v3l0city.trip_waypoints(id,trip_id,creator_id,kind,title,latitude,longitude,ordinal) VALUES ($1,$2,$3,'fuel','Fuel',91,0,0)", [randomUUID(), trips[0], users[0]], '23514');
    await expectSqlState("UPDATE v3l0city.users SET display_name='changed' WHERE id=$1", [users[0]], '23514');
    await client.query("UPDATE v3l0city.users SET display_name='changed',revision=revision+1 WHERE id=$1", [users[0]]);
    assert.equal((await client.query('SELECT revision FROM v3l0city.users WHERE id=$1', [users[0]])).rows[0].revision, '2');
  });

  it('proves application least privilege and no public schema access, without claiming row authorization', async () => {
    await client.query(`CREATE ROLE "${role}" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await client.query(`CREATE ROLE "${outsider}" LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    await grantApplicationRole(client, role);
    await client.query(`SET ROLE "${role}"`);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM v3l0city.users')).rows[0].count, 3);
    await expectSqlState('SELECT * FROM v3l0city.schema_migrations', [], '42501');
    await expectSqlState('CREATE TABLE v3l0city.unauthorized_table(id int)', [], '42501');
    await expectSqlState('ALTER TABLE v3l0city.users ADD COLUMN unauthorized text', [], '42501');
    await expectSqlState('TRUNCATE v3l0city.users CASCADE', [], '42501');
    await expectSqlState('DELETE FROM v3l0city.audit_log', [], '42501');
    await client.query('RESET ROLE');
    await client.query(`SET ROLE "${outsider}"`);
    await expectSqlState('SELECT * FROM v3l0city.users', [], '42501');
    await client.query('RESET ROLE');
    await assert.rejects(grantApplicationRole(client, 'postgres'), /administrative/);
    await assert.rejects(grantApplicationRole(client, 'bad;drop'), /identifier/);
    // NOINHERIT alone does not prevent SET ROLE; even ordinary memberships are rejected.
    await client.query(`GRANT "${outsider}" TO "${role}"`);
    await assert.rejects(grantApplicationRole(client, role), /standalone/);
    await client.query(`REVOKE "${outsider}" FROM "${role}"`);
    await client.query(`GRANT CREATE ON SCHEMA v3l0city TO "${role}"`);
    await assert.rejects(grantApplicationRole(client, role), /pre-existing DDL/);
    await client.query(`REVOKE CREATE ON SCHEMA v3l0city FROM "${role}"`);
    await client.query(`GRANT TRUNCATE ON v3l0city.users TO "${role}"`);
    await assert.rejects(grantApplicationRole(client, role), /pre-existing DDL/);
    await client.query(`REVOKE TRUNCATE ON v3l0city.users FROM "${role}"`);
    await client.query(`GRANT SELECT ON v3l0city.users TO "${role}" WITH GRANT OPTION`);
    await assert.rejects(grantApplicationRole(client, role), /grant-option/);
    await client.query(`REVOKE GRANT OPTION FOR SELECT ON v3l0city.users FROM "${role}"`);
    await client.query(`GRANT USAGE ON SCHEMA v3l0city TO "${role}" WITH GRANT OPTION`);
    await assert.rejects(grantApplicationRole(client, role), /grant-option/);
    await client.query(`REVOKE GRANT OPTION FOR USAGE ON SCHEMA v3l0city FROM "${role}"`);
    await client.query(`GRANT SELECT(email) ON v3l0city.users TO "${role}" WITH GRANT OPTION`);
    await assert.rejects(grantApplicationRole(client, role), /grant-option/);
    await client.query(`REVOKE GRANT OPTION FOR SELECT(email) ON v3l0city.users FROM "${role}"`);
    await client.query(`GRANT SELECT ON v3l0city.schema_migrations TO "${role}"`);
    await assert.rejects(grantApplicationRole(client, role), /migration-history/);
    await client.query(`REVOKE SELECT ON v3l0city.schema_migrations FROM "${role}"`);
    const migrationRole = (await client.query('SELECT current_user AS name')).rows[0].name as string;
    assert.match(migrationRole, /^[a-z][a-z0-9_]*$/);
    await client.query(`ALTER TABLE v3l0city.users OWNER TO "${role}"`);
    await assert.rejects(grantApplicationRole(client, role), /own foundation objects/);
    await client.query(`ALTER TABLE v3l0city.users OWNER TO "${migrationRole}"`);
    await client.query(`ALTER FUNCTION v3l0city.enforce_revision() OWNER TO "${role}"`);
    await assert.rejects(grantApplicationRole(client, role), /own foundation objects/);
    await client.query(`ALTER FUNCTION v3l0city.enforce_revision() OWNER TO "${migrationRole}"`);
    await client.query(`ALTER SCHEMA v3l0city OWNER TO "${role}"`);
    await assert.rejects(grantApplicationRole(client, role), /own foundation objects/);
    await client.query(`ALTER SCHEMA v3l0city OWNER TO "${migrationRole}"`);
    await grantApplicationRole(client, role);
  });

  it('rolls back every provisioning grant when a real SQL error occurs after broad temporary grants', async () => {
    // An existing safe read grant must survive unchanged; provisioning must not leak new rights.
    await client.query(`GRANT SELECT ON v3l0city.users TO "${outsider}"`);
    async function aclSnapshot() {
      return (await client.query(`SELECT n.nspacl::text AS schema_acl,
        ARRAY(SELECT c.oid::text||':'||COALESCE(c.relacl::text,'') FROM pg_class c
          WHERE c.relnamespace=n.oid ORDER BY c.oid) AS relation_acl,
        ARRAY(SELECT att.attrelid::text||':'||att.attnum::text||':'||COALESCE(att.attacl::text,'')
          FROM pg_attribute att JOIN pg_class c ON c.oid=att.attrelid
          WHERE c.relnamespace=n.oid ORDER BY att.attrelid,att.attnum) AS column_acl
        FROM pg_namespace n WHERE n.nspname='v3l0city'`)).rows;
    }
    const before = await aclSnapshot();
    let injected = false;
    const failing: MigrationConnection = {
      async query(text, values) {
        if (text.startsWith('GRANT USAGE,SELECT ON ALL SEQUENCES')) {
          injected = true;
          assert.equal((await client.query("SELECT has_table_privilege($1,'v3l0city.schema_migrations','SELECT') AS allowed", [outsider])).rows[0].allowed, true);
          return client.query('SELECT 1/0'); // Actual PostgreSQL error, not a mocked rejection.
        }
        return client.query(text, values);
      },
    };
    await assert.rejects(grantApplicationRole(failing, outsider), (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === '22012'));
    assert.equal(injected, true);
    assert.deepEqual(await aclSnapshot(), before);
    const access = await client.query(`SELECT
      has_table_privilege($1,'v3l0city.schema_migrations','SELECT') AS history,
      has_table_privilege($1,'v3l0city.audit_log','DELETE') AS audit_delete,
      has_table_privilege($1,'v3l0city.users','SELECT') AS original_read`, [outsider]);
    assert.deepEqual(access.rows[0], { history: false, audit_delete: false, original_read: true });
  });

  it('records actual cursor-query plan with representative persisted messages', async () => {
    await client.query(`INSERT INTO v3l0city.trip_messages(id,trip_id,author_id,kind,body,created_at)
      SELECT md5('message-'||n::text)::uuid,CASE WHEN n <= 1000 THEN $1::uuid ELSE $2::uuid END,
      CASE WHEN n <= 1000 THEN $3::uuid ELSE $4::uuid END,'user','Synthetic body',
      timestamptz '2026-10-06T00:00:00Z'+n*interval '1 second' FROM generate_series(1,10000) n`, [trips[0], trips[1], users[0], users[1]]);
    await client.query('ANALYZE v3l0city.trip_messages');
    const explain = await client.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id,body FROM v3l0city.trip_messages
      WHERE trip_id=$1 AND deleted_at IS NULL AND (created_at,id) > ($2::timestamptz,$3::uuid)
      ORDER BY created_at,id LIMIT 20`, [trips[0], '2026-10-06T00:05:00Z', '00000000-0000-0000-0000-000000000000']);
    const plan = explain.rows[0]['QUERY PLAN'];
    assert.match(JSON.stringify(plan), /trip_messages_cursor/);
    assert.equal(plan[0].Plan['Actual Rows'], 20);
    process.stdout.write(`PostgreSQL cursor evidence: ${JSON.stringify({ index: 'trip_messages_cursor', rows: plan[0].Plan['Actual Rows'], executionMs: plan[0]['Execution Time'] })}\n`);
  });

  it('serializes concurrent migrators and rolls back failed migration plus history', async () => {
    const sql = 'SELECT pg_sleep(0.2); CREATE TABLE v3l0city.migration_concurrency_fixture(id integer PRIMARY KEY);';
    const second = { version: 2, name: '0002_concurrency.sql', sql, checksum: migrationChecksum(sql) };
    const a = await connect(), b = await connect();
    try {
      const results = await Promise.all([migrate(a, [...migrations, second]), migrate(b, [...migrations, second])]);
      assert.equal(results.reduce((count, result) => count + result.applied.length, 0), 1);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM v3l0city.schema_migrations WHERE version=2')).rows[0].count, 1);
      const failedSql = 'CREATE TABLE v3l0city.should_rollback(id int); SELECT missing_fixture_function();';
      const third = { version: 3, name: '0003_failure.sql', sql: failedSql, checksum: migrationChecksum(failedSql) };
      await assert.rejects(migrate(a, [...migrations, second, third]), /rolled back/);
      assert.equal((await client.query("SELECT to_regclass('v3l0city.should_rollback') AS relation")).rows[0].relation, null);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM v3l0city.schema_migrations WHERE version=3')).rows[0].count, 0);
      const recoverySql = 'CREATE TABLE v3l0city.recovered_migration(id int);';
      assert.deepEqual(await migrate(b, [...migrations, second, { ...third, sql: recoverySql, checksum: migrationChecksum(recoverySql) }]), { applied: [3], alreadyApplied: [1, 2] });
    } finally { await a.end(); await b.end(); }
  });

  it('rolls back a terminated migration session and automatically releases its advisory lock', async () => {
    const history = await client.query('SELECT version,name,checksum FROM v3l0city.schema_migrations ORDER BY version');
    assert.equal(history.rows.length, 3);
    const secondSql = 'SELECT pg_sleep(0.2); CREATE TABLE v3l0city.migration_concurrency_fixture(id integer PRIMARY KEY);';
    const thirdSql = 'CREATE TABLE v3l0city.recovered_migration(id int);';
    const previous = [...migrations,
      { version: 2, name: '0002_concurrency.sql', sql: secondSql, checksum: migrationChecksum(secondSql) },
      { version: 3, name: '0003_failure.sql', sql: thirdSql, checksum: migrationChecksum(thirdSql) },
    ];
    const interruptedSql = 'CREATE TABLE v3l0city.interruption_fixture(id int); SELECT pg_sleep(10);';
    const fourth = { version: 4, name: '0004_interruption.sql', sql: interruptedSql, checksum: migrationChecksum(interruptedSql) };
    const interrupted = await connect();
    interrupted.on('error', () => { /* Expected isolated-fixture connection termination. */ });
    const pid = (await interrupted.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const rejected = assert.rejects(migrate(interrupted, [...previous, fourth]));
    try {
      let sleeping = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const active = await client.query('SELECT wait_event FROM pg_stat_activity WHERE pid=$1', [pid]);
        if (active.rows[0]?.wait_event === 'PgSleep') { sleeping = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(sleeping, true, 'Fixture must actually enter its transaction before termination.');
      assert.equal((await client.query('SELECT pg_terminate_backend($1) AS terminated', [pid])).rows[0].terminated, true);
      await rejected;
      assert.equal((await client.query("SELECT to_regclass('v3l0city.interruption_fixture') AS relation")).rows[0].relation, null);
      assert.equal((await client.query('SELECT count(*)::int AS count FROM v3l0city.schema_migrations WHERE version=4')).rows[0].count, 0);
      const recoverySql = 'CREATE TABLE v3l0city.interruption_recovery(id int);';
      assert.deepEqual(await migrate(client, [...previous, { ...fourth, sql: recoverySql, checksum: migrationChecksum(recoverySql) }], { lockTimeoutMs: 1_000 }), { applied: [4], alreadyApplied: [1, 2, 3] });
    } finally { await interrupted.end(); }
  });
});
