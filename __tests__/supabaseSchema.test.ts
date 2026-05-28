import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('Supabase cloud schema', () => {
  const migrationsDir = join(process.cwd(), 'supabase/migrations');
  const migration = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(join(migrationsDir, file), 'utf8'))
    .join('\n');

  it('enables RLS and grants authenticated access explicitly', () => {
    for (const table of [
      'profiles',
      'user_devices',
      'cloud_trips',
      'cloud_trip_samples',
      'sync_batches',
      'friendships',
      'leaderboard_entries',
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`
      );
    }
    expect(migration).toContain('grant select on public.profiles to authenticated');
    expect(migration).toContain(
      'grant select, insert, update, delete on public.cloud_trips to authenticated'
    );
  });

  it('keeps friendship and leaderboard data aggregate scoped', () => {
    expect(migration).toContain('Friendship participants can read rows');
    expect(migration).toContain('Signed-in users read aggregate leaderboard entries');
    expect(migration).toContain('cloud_trips_leaderboard_lookup_idx');
    expect(migration).toContain('profiles_leaderboard_nearby_idx');
    expect(migration).not.toContain('route');
  });

  it('creates profile rows from auth sign-up metadata without exposing privileged functions', () => {
    expect(migration).toContain('create schema if not exists private');
    expect(migration).toContain('private.handle_new_auth_user()');
    expect(migration).toContain('new.raw_user_meta_data ->> \'username\'');
    expect(migration).toContain('on_auth_user_created');
    expect(migration).not.toContain('function public.handle_new_auth_user');
  });
});
