import path from 'node:path';
import { Client } from 'pg';
import { loadMigrations, migrate, MigrationError } from './migrator';
import { grantApplicationRole } from './roles';

export async function runMigrationCli(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required for an explicit PostgreSQL migration.');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  const directory = process.env.MIGRATIONS_DIRECTORY ?? path.resolve(__dirname, '../../migrations');
  const migrations = await loadMigrations(directory);
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000, application_name: 'v3l0city-migrator' });
  await client.connect();
  try {
    const result = await migrate(client, migrations);
    if (process.env.DATABASE_APP_ROLE) await grantApplicationRole(client, process.env.DATABASE_APP_ROLE);
    process.stdout.write(`${JSON.stringify({ status: 'migrated', applied: result.applied, alreadyApplied: result.alreadyApplied })}\n`);
  } finally { await client.end(); }
}

if (require.main === module) runMigrationCli().catch((error: unknown) => {
  // Avoid connection URLs, SQL detail, raw credentials and provider payloads in CLI output.
  const message = error instanceof MigrationError ? `${error.code}: ${error.message}` : 'PostgreSQL migration failed; check configuration and operator diagnostics.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
