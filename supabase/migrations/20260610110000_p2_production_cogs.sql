-- ============================================================================
-- P2 — Production runs → real COGS
--
-- A production run records "we potted up N plants of cultivar X" and which
-- supplies it consumed (with unit costs snapshotted at run time) plus labor.
-- This is the basis for bottom-up COGS: cultivar margin = revenue − run costs.
--
-- Both tables are manager-gated like the other financial tables (they carry
-- unit costs). Supply stock decrements happen client-side by the manager
-- logging the run; the snapshot columns keep history immune to later price
-- edits. enforce_row_org stamps/validates org_id as everywhere else.
-- ============================================================================

create table if not exists public.production_runs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations(id) on delete cascade,
  user_id     uuid not null,
  cultivar_id uuid references public.cultivars(id) on delete set null,
  batch_id    uuid references public.propagation_batches(id) on delete set null,
  description text,
  quantity    int not null default 0,
  labor_hours numeric not null default 0,
  labor_rate  numeric not null default 0,
  run_on      date not null default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists production_runs_org_idx on public.production_runs(org_id);
create index if not exists production_runs_cultivar_idx on public.production_runs(cultivar_id);
alter table public.production_runs enable row level security;

create table if not exists public.production_run_items (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organizations(id) on delete cascade,
  user_id       uuid not null,
  run_id        uuid not null references public.production_runs(id) on delete cascade,
  supply_id     uuid references public.supplies(id) on delete set null,
  name_snapshot text not null,
  qty_used      numeric not null default 0,
  unit_cost     numeric not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists production_run_items_org_idx on public.production_run_items(org_id);
create index if not exists production_run_items_run_idx on public.production_run_items(run_id);
alter table public.production_run_items enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['production_runs','production_run_items'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_enforce_org', t);
    execute format(
      'create trigger %I before insert or update on public.%I '
      'for each row execute function private.enforce_row_org()',
      t || '_enforce_org', t);
    execute format('drop policy if exists %I on public.%I', t || ' org access', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (org_id in (select private.user_org_ids()) '
      '       and private.user_role_in(org_id) in (''owner'',''manager'')) '
      'with check (org_id in (select private.user_org_ids()) '
      '       and private.user_role_in(org_id) in (''owner'',''manager''))',
      t || ' org access', t);
  end loop;
end $$;
