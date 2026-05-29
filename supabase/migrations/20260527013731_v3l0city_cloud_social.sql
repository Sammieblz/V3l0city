create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username = lower(username) and char_length(username) between 3 and 32),
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  sync_enabled boolean not null default false,
  leaderboard_opt_in boolean not null default false,
  nearby_opt_in boolean not null default false,
  coarse_location_hash text,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username));

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  install_id text not null,
  platform text not null,
  app_version text,
  build_number text,
  expo_push_token text,
  native_push_token text,
  push_platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, install_id)
);

create table if not exists public.cloud_trips (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  total_distance_meters double precision not null default 0,
  max_speed_mps double precision not null default 0,
  average_speed_mps double precision not null default 0,
  units text not null check (units in ('km/h', 'MPH')),
  mount_label text,
  record_status text not null default 'completed',
  local_updated_at timestamptz not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.cloud_trip_samples (
  user_id uuid not null,
  trip_id text not null,
  sequence integer not null,
  recorded_at timestamptz not null,
  elapsed_ms integer not null,
  speed_mps double precision not null,
  distance_meters double precision not null,
  heading_degrees double precision,
  heading_source text not null default 'none',
  heading_accuracy_degrees double precision,
  heading_quality text not null default 'poor',
  heading_reasons jsonb not null default '[]'::jsonb,
  source text not null,
  quality text not null,
  quality_score double precision not null,
  quality_reasons jsonb not null default '[]'::jsonb,
  gps_accuracy_meters double precision,
  fix_age_ms integer,
  native_speed_used boolean not null default false,
  is_moving boolean not null default false,
  is_stopped boolean not null default false,
  stale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, trip_id, sequence),
  foreign key (user_id, trip_id)
    references public.cloud_trips(user_id, id)
    on delete cascade
);

create table if not exists public.sync_batches (
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id text not null,
  operation text not null,
  last_sequence integer,
  received_at timestamptz not null default now(),
  primary key (user_id, batch_id)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_unique
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create table if not exists public.leaderboard_entries (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  metric text not null check (metric in ('distance', 'average_speed', 'max_speed', 'trip_count')),
  period text not null check (period in ('week', 'month', 'all_time')),
  scope text not null check (scope in ('global', 'friends', 'nearby')),
  value double precision not null default 0,
  unit text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, metric, period, scope)
);

alter table public.profiles enable row level security;
alter table public.user_devices enable row level security;
alter table public.cloud_trips enable row level security;
alter table public.cloud_trip_samples enable row level security;
alter table public.sync_batches enable row level security;
alter table public.friendships enable row level security;
alter table public.leaderboard_entries enable row level security;

grant select on public.profiles to authenticated;
grant insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_devices to authenticated;
grant select, insert, update, delete on public.cloud_trips to authenticated;
grant select, insert, update, delete on public.cloud_trip_samples to authenticated;
grant select, insert, update, delete on public.sync_batches to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update on public.leaderboard_entries to authenticated;

create policy "Profiles are visible to signed-in users"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) is not null);

create policy "Users insert their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their devices"
  on public.user_devices for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their cloud trips"
  on public.cloud_trips for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their cloud trip samples"
  on public.cloud_trip_samples for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users manage their sync batches"
  on public.sync_batches for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Friendship participants can read rows"
  on public.friendships for select
  to authenticated
  using (
    (select auth.uid()) = requester_id
    or (select auth.uid()) = addressee_id
  );

create policy "Users create outbound friend requests"
  on public.friendships for insert
  to authenticated
  with check ((select auth.uid()) = requester_id);

create policy "Participants update friendship rows"
  on public.friendships for update
  to authenticated
  using (
    (select auth.uid()) = requester_id
    or (select auth.uid()) = addressee_id
  )
  with check (
    (select auth.uid()) = requester_id
    or (select auth.uid()) = addressee_id
  );

create policy "Signed-in users read aggregate leaderboard entries"
  on public.leaderboard_entries for select
  to authenticated
  using ((select auth.uid()) is not null);

create policy "Users write their own leaderboard entries"
  on public.leaderboard_entries for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own leaderboard entries"
  on public.leaderboard_entries for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
