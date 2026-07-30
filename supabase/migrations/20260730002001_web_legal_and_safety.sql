create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('terms', 'privacy_notice')),
  document_version text not null check (char_length(document_version) between 1 and 64),
  accepted_at timestamptz not null default now(),
  unique (user_id, document_type, document_version)
);

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'impersonation', 'unsafe_driving', 'other')),
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (reporter_id <> target_user_id)
);

create index if not exists legal_acceptances_owner_lookup_idx
  on public.legal_acceptances (user_id, document_type, document_version);

create index if not exists user_reports_reporter_created_idx
  on public.user_reports (reporter_id, created_at desc);

create index if not exists user_reports_operational_queue_idx
  on public.user_reports (status, created_at asc);

alter table public.legal_acceptances enable row level security;
alter table public.user_reports enable row level security;

grant select, insert on public.legal_acceptances to authenticated;
grant select, insert on public.user_reports to authenticated;

create policy "Users read their own legal acceptances"
  on public.legal_acceptances for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users record their own legal acceptances"
  on public.legal_acceptances for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Reporters read their own submitted reports"
  on public.user_reports for select
  to authenticated
  using ((select auth.uid()) = reporter_id);

create policy "Reporters submit reports as themselves"
  on public.user_reports for insert
  to authenticated
  with check (
    (select auth.uid()) = reporter_id
    and reporter_id <> target_user_id
  );
