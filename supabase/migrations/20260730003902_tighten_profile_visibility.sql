drop policy if exists "Profiles are visible to signed-in users" on public.profiles;

create policy "Users read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);
