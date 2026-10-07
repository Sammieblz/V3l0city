import type { MigrationConnection } from './migrator';

/** Dedicated client outside any transaction. Provision passwords through operator secret tooling. */
export async function grantApplicationRole(connection: MigrationConnection, role: string): Promise<void> {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(role)) throw new Error('Application role must be a bounded lowercase PostgreSQL identifier.');
  await connection.query('BEGIN');
  try {
    await applyApplicationRolePrivileges(connection, role);
    await connection.query('COMMIT');
  } catch (error) {
    // A disconnected client is rolled back by PostgreSQL; retain the original failure.
    try { await connection.query('ROLLBACK'); } catch { /* connection may already be gone */ }
    throw error;
  }
}

async function applyApplicationRolePrivileges(connection: MigrationConnection, role: string): Promise<void> {
  const result = await connection.query(`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolinherit,
    pg_has_role(rolname,current_user,'MEMBER') AS migration_member, current_user AS migration_user,
    EXISTS (SELECT 1 FROM pg_auth_members WHERE member=pg_roles.oid) AS has_memberships
    FROM pg_roles WHERE rolname=$1`, [role]);
  const candidate = result.rows[0];
  if (!candidate || candidate.rolsuper || candidate.rolcreatedb || candidate.rolcreaterole || candidate.rolbypassrls
    || candidate.rolinherit || candidate.has_memberships || candidate.migration_member || candidate.migration_user === role) {
    throw new Error('Application role must exist, be standalone NOINHERIT and cannot acquire migration/administrative privileges.');
  }
  const privilege = await connection.query(`SELECT
    has_schema_privilege($1,'v3l0city','CREATE') AS schema_create,
    EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='v3l0city'
      AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS owns_schema,
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='v3l0city' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS owns_relation,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='v3l0city' AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname=$1)) AS owns_routine,
    EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
      WHERE n.nspname='v3l0city' AND a.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname=$1))
      AND a.is_grantable) AS schema_grant_option,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE n.nspname='v3l0city'
      AND a.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname=$1)) AND a.is_grantable) AS routine_grant_option,
    EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE n.nspname='v3l0city'
      AND a.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname=$1))
      AND (a.is_grantable OR (CASE WHEN c.relkind='S' THEN a.privilege_type NOT IN ('USAGE','SELECT')
        ELSE a.privilege_type NOT IN ('SELECT','INSERT','UPDATE','DELETE') END))) AS unsafe_relation_grant,
    EXISTS (SELECT 1 FROM pg_attribute att JOIN pg_class c ON c.oid=att.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(att.attacl) a
      WHERE n.nspname='v3l0city' AND a.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname=$1))
      AND (a.is_grantable OR a.privilege_type NOT IN ('SELECT','INSERT','UPDATE'))) AS unsafe_column_grant,
    has_table_privilege($1,'v3l0city.schema_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS history_access`, [role]);
  if (!privilege.rows[0] || Object.values(privilege.rows[0]).some(Boolean)) {
    throw new Error('Application role must not own foundation objects or hold pre-existing DDL, grant-option or migration-history privileges.');
  }
  const quoted = `"${role}"`;
  await connection.query(`GRANT USAGE ON SCHEMA v3l0city TO ${quoted}`);
  await connection.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA v3l0city TO ${quoted}`);
  await connection.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA v3l0city TO ${quoted}`);
  await connection.query(`REVOKE ALL ON v3l0city.schema_migrations FROM ${quoted}`);
  await connection.query(`REVOKE UPDATE,DELETE ON v3l0city.audit_log,v3l0city.trip_events,v3l0city.subscription_events FROM ${quoted}`);
  await connection.query(`GRANT UPDATE(processed_at) ON v3l0city.subscription_events TO ${quoted}`);
  // No CREATE, TRUNCATE, ownership, grant option, migration history, or broad default privileges.
}
