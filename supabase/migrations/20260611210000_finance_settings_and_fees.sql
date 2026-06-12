-- ============================================================================
-- Finance data layer — settings + channel fee rules
--
-- finance_settings: one editable row per org (singleton-per-tenant) holding the
-- business's default labor rate, mileage reimbursement rate, home state and
-- timezone. channel_fee_rules: editable marketplace fee ESTIMATES (Etsy /
-- Shopify / eBay) used to approximate net proceeds — user-editable estimates,
-- NOT authoritative rates.
--
-- Both are manager-gated like every other financial table; org_id is
-- stamped/validated by private.enforce_row_org and updated_at maintained by
-- public.set_updated_at, matching public.recurring_expenses.
-- ============================================================================

create table if not exists public.finance_settings (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  user_id            uuid not null,
  default_labor_rate numeric not null default 0,   -- $/hour; set per business
  mileage_rate_cents int     not null default 70,  -- IRS standard mileage rate (¢/mi), editable
  home_state         text    not null default 'AZ',
  timezone           text    not null default 'America/Phoenix',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id)
);
create index if not exists finance_settings_org_idx on public.finance_settings(org_id);
alter table public.finance_settings enable row level security;

create table if not exists public.channel_fee_rules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null,
  channel         text not null check (channel in ('etsy','shopify','ebay')),
  percent_fee     numeric not null default 0,  -- transaction / final-value %, e.g. 6.5 = 6.5%
  fixed_fee       numeric not null default 0,  -- per-order fixed $
  payment_percent numeric not null default 0,  -- payment-processing %
  payment_fixed   numeric not null default 0,  -- payment-processing fixed $
  listing_fee     numeric not null default 0,  -- per-listing $
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists channel_fee_rules_org_idx on public.channel_fee_rules(org_id);
create unique index if not exists channel_fee_rules_org_channel_idx
  on public.channel_fee_rules(org_id, channel);
alter table public.channel_fee_rules enable row level security;

comment on table public.channel_fee_rules is
  'User-editable marketplace fee ESTIMATES used to approximate net proceeds. Not authoritative rates — surface as editable estimates in the UI.';

-- updated_at + enforce_row_org triggers and manager-gated RLS, identical pattern
-- to public.recurring_expenses.
do $$
declare t text;
begin
  foreach t in array array['finance_settings','channel_fee_rules'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I '
      'for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);

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

-- Seed one settings row + the three fee-rule rows per existing org. Resolve a
-- user_id from the org owner (created_by, else earliest owner membership). Runs
-- as postgres (auth.uid() is null) so enforce_row_org passes the row through.
with org_owner as (
  select o.id as org_id,
         coalesce(
           o.created_by,
           (select m.user_id from public.org_memberships m
             where m.org_id = o.id and m.role = 'owner'
             order by m.created_at limit 1)
         ) as user_id
  from public.organizations o
)
insert into public.finance_settings (org_id, user_id)
select ow.org_id, ow.user_id
from org_owner ow
where ow.user_id is not null
  and not exists (select 1 from public.finance_settings f where f.org_id = ow.org_id);

with org_owner as (
  select o.id as org_id,
         coalesce(
           o.created_by,
           (select m.user_id from public.org_memberships m
             where m.org_id = o.id and m.role = 'owner'
             order by m.created_at limit 1)
         ) as user_id
  from public.organizations o
),
defaults(channel, percent_fee, fixed_fee, payment_percent, payment_fixed, listing_fee) as (
  values
    ('etsy',    6.5,   0,    3.0, 0.25, 0.20),
    ('shopify', 0,     0,    2.9, 0.30, 0),
    ('ebay',    13.25, 0.30, 0,   0,    0)
)
insert into public.channel_fee_rules
  (org_id, user_id, channel, percent_fee, fixed_fee, payment_percent, payment_fixed, listing_fee)
select ow.org_id, ow.user_id, d.channel,
       d.percent_fee, d.fixed_fee, d.payment_percent, d.payment_fixed, d.listing_fee
from org_owner ow
cross join defaults d
where ow.user_id is not null
  and not exists (
    select 1 from public.channel_fee_rules c
    where c.org_id = ow.org_id and c.channel = d.channel
  );
