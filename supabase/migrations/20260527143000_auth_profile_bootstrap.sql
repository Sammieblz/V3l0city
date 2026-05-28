create schema if not exists private;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_username text;
  requested_display_name text;
begin
  requested_username := lower(
    regexp_replace(
      coalesce(new.raw_user_meta_data ->> 'username', ''),
      '[^a-z0-9_]+',
      '_',
      'g'
    )
  );
  requested_username := trim(both '_' from requested_username);

  if char_length(requested_username) < 3 then
    requested_username := 'driver_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  requested_display_name := nullif(
    left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80),
    ''
  );

  insert into public.profiles (
    user_id,
    username,
    display_name,
    sync_enabled,
    leaderboard_opt_in,
    nearby_opt_in
  )
  values (
    new.id,
    left(requested_username, 32),
    coalesce(
      requested_display_name,
      split_part(new.email, '@', 1),
      'V3l0city Driver'
    ),
    false,
    false,
    false
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();
