-- ============================================================================
-- Recurring business expenses (subscriptions the BUSINESS pays — Shopify,
-- QuickBooks, software, etc.). Distinct from public.subscriptions, which tracks
-- CUSTOMER subscriptions (Rosette+ tier).
--
-- Manager-gated like the other financial tables; org_id stamped/validated by
-- enforce_row_org; updated_at maintained by set_updated_at. Actual payments are
-- logged as normal `expenses` rows from the UI so they flow into the Tax Report.
-- ============================================================================

create table if not exists public.recurring_expenses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organizations(id) on delete cascade,
  user_id       uuid not null,
  vendor_id     uuid references public.vendors(id) on delete set null,
  name          text not null,
  category      text,
  amount        numeric not null default 0,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','quarterly','yearly')),
  status        text not null default 'active' check (status in ('active','cancelled')),
  started_on    date not null default current_date,
  next_renewal  date,
  cancelled_at  timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists recurring_expenses_org_idx on public.recurring_expenses(org_id);
create index if not exists recurring_expenses_vendor_idx on public.recurring_expenses(vendor_id);
alter table public.recurring_expenses enable row level security;

drop trigger if exists recurring_expenses_set_updated_at on public.recurring_expenses;
create trigger recurring_expenses_set_updated_at
  before update on public.recurring_expenses
  for each row execute function public.set_updated_at();

drop trigger if exists recurring_expenses_enforce_org on public.recurring_expenses;
create trigger recurring_expenses_enforce_org
  before insert or update on public.recurring_expenses
  for each row execute function private.enforce_row_org();

drop policy if exists "recurring_expenses org access" on public.recurring_expenses;
create policy "recurring_expenses org access" on public.recurring_expenses
  for all to authenticated
  using (org_id in (select private.user_org_ids())
         and private.user_role_in(org_id) in ('owner','manager'))
  with check (org_id in (select private.user_org_ids())
         and private.user_role_in(org_id) in ('owner','manager'));
