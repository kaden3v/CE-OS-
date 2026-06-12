-- ============================================================================
-- Finance data layer — purchase / run / mileage ledgers + price history
--
-- supply_purchases: a buy of a supply, linked to the expense it generated.
-- production_run_supplies: supplies consumed by a run with a cost snapshot.
--   NOTE: overlaps the existing public.production_run_items (added in
--   20260610110000_p2_production_cogs.sql). Created here per the finance spec;
--   the UI currently writes production_run_items. Consolidate to a single table
--   before wiring new UI to avoid divergent COGS.
-- subscription_price_history: price changes over time. FK references
--   public.subscriptions (CUSTOMER subscriptions) per the spec. The finance
--   "Subscriptions" page actually reads public.recurring_expenses — repoint the
--   FK there if price history is meant for the business's own recurring bills.
-- mileage_log: deductible business trips (miles × finance_settings.mileage_rate).
--
-- production_runs gains labor_type + a stored unit_cost. Every table is
-- manager-gated; the snapshot/ledger tables are append-only (no updated_at).
-- ============================================================================

alter table public.production_runs
  add column if not exists labor_type text not null default 'owner',
  add column if not exists unit_cost  numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'production_runs_labor_type_check'
  ) then
    alter table public.production_runs
      add constraint production_runs_labor_type_check
      check (labor_type in ('owner','hired'));
  end if;
end $$;

create table if not exists public.supply_purchases (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  user_id       uuid not null,
  supply_id     uuid references public.supplies(id) on delete set null,
  vendor_id     uuid references public.vendors(id) on delete set null,
  qty           numeric not null default 0,
  total_cost    numeric not null default 0,
  purchase_date date not null default current_date,
  expense_id    uuid references public.expenses(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists supply_purchases_org_idx on public.supply_purchases(org_id);
create index if not exists supply_purchases_supply_idx on public.supply_purchases(supply_id);
alter table public.supply_purchases enable row level security;

create table if not exists public.production_run_supplies (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  user_id            uuid not null,
  run_id             uuid not null references public.production_runs(id) on delete cascade,
  supply_id          uuid references public.supplies(id) on delete set null,
  qty                numeric not null default 0,
  unit_cost_snapshot numeric not null default 0,
  created_at         timestamptz not null default now()
);
create index if not exists production_run_supplies_org_idx on public.production_run_supplies(org_id);
create index if not exists production_run_supplies_run_idx on public.production_run_supplies(run_id);
alter table public.production_run_supplies enable row level security;

create table if not exists public.subscription_price_history (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  amount          numeric not null default 0,
  effective_date  date not null default current_date,
  created_at      timestamptz not null default now()
);
create index if not exists subscription_price_history_org_idx on public.subscription_price_history(org_id);
create index if not exists subscription_price_history_sub_idx on public.subscription_price_history(subscription_id);
alter table public.subscription_price_history enable row level security;

create table if not exists public.mileage_log (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null,
  trip_date  date not null default current_date,
  miles      numeric not null default 0,
  purpose    text,
  round_trip boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists mileage_log_org_idx on public.mileage_log(org_id);
alter table public.mileage_log enable row level security;

-- enforce_row_org + manager-gated RLS for every new ledger table.
do $$
declare t text;
begin
  foreach t in array array[
    'supply_purchases','production_run_supplies','subscription_price_history','mileage_log'
  ] loop
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
