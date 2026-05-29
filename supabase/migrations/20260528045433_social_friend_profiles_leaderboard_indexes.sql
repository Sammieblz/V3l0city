create index if not exists friendships_requester_status_idx
  on public.friendships (requester_id, status, updated_at desc);

create index if not exists friendships_addressee_status_idx
  on public.friendships (addressee_id, status, updated_at desc);

create index if not exists profiles_leaderboard_nearby_idx
  on public.profiles (leaderboard_opt_in, nearby_opt_in, coarse_location_hash)
  where leaderboard_opt_in = true;

create index if not exists cloud_trips_leaderboard_lookup_idx
  on public.cloud_trips (user_id, started_at desc)
  where deleted_at is null and record_status = 'completed';

create index if not exists cloud_trips_completed_started_idx
  on public.cloud_trips (started_at desc)
  where deleted_at is null and record_status = 'completed';
