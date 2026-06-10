-- ============================================================================
-- Phase 2 — Collaboration layer
--
--   1. Task assignment: tasks.assigned_to (a teammate in the same org).
--   2. Activity log: immutable, org-scoped audit trail of who did what.
--   3. Realtime: add org data tables to the supabase_realtime publication so
--      the frontend can live-refresh when a teammate changes shared data.
--      (Realtime applies RLS: INSERT/UPDATE events are only delivered to
--      subscribers whose SELECT policies pass.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Task assignment
-- ---------------------------------------------------------------------------
alter table public.tasks
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;
create index if not exists tasks_assigned_idx on public.tasks(assigned_to);

-- ---------------------------------------------------------------------------
-- 2. Activity log (insert-only; no update/delete policies → immutable for
--    org members; org_id is stamped/validated by enforce_row_org)
-- ---------------------------------------------------------------------------
create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  summary     text,
  created_at  timestamptz not null default now()
);
alter table public.activity_log enable row level security;
create index if not exists activity_log_org_time_idx
  on public.activity_log(org_id, created_at desc);

drop trigger if exists activity_log_enforce_org on public.activity_log;
create trigger activity_log_enforce_org
  before insert or update on public.activity_log
  for each row execute function private.enforce_row_org();

drop policy if exists "activity_log org read" on public.activity_log;
create policy "activity_log org read" on public.activity_log
  for select to authenticated
  using (org_id in (select private.user_org_ids()));

drop policy if exists "activity_log org insert" on public.activity_log;
create policy "activity_log org insert" on public.activity_log
  for insert to authenticated
  with check (
    org_id in (select private.user_org_ids())
    and actor_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 3. Realtime publication membership (idempotent)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  rt_tables text[] := array[
    'cultivars','customers','expenses','inventory','licenses','listings',
    'mortality_events','order_items','orders','plant_photos','print_jobs',
    'propagation_batches','qr_codes','shipments','subscriptions','supplies',
    'tasks','vendors','activity_log','org_memberships'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;  -- publication absent (self-hosted edge case) → nothing to do
  end if;
  foreach t in array rt_tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
