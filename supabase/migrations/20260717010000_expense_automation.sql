-- ============================================================================
-- Expense automation pass: make expense logging essentially automatic.
--
-- 1. Review queue    — expenses.needs_review: imported rows get a human glance
--    (Monarch-style) instead of silently landing categorized-by-guess.
-- 2. CSV provenance  — expense_import_batches + expenses.import_batch_id (undo
--    a whole import) and a 'csv' source discriminator so imported rows are
--    distinguishable from hand-entered ones. Rows imported from CSV carry a
--    deterministic external_id (csv:{org8}:{date}:{cents}:{memo-slug}) so the
--    existing unique external_id index makes re-imports idempotent.
-- 3. Rules           — expense_rules: user-authored auto-categorization
--    ("memo contains AMZN → Packaging"), applied client-side at import/entry.
-- 4. Recurring, on   — log_subscription_charge now snapshots BOTH tax lines
--    (schedule_f_category was missing — Schedule F is the org default!),
--    honors the org's per-category overrides, and labels the vendor; auto_log
--    defaults ON, existing active subscriptions are flipped ON, and a pg_cron
--    job finally calls process_due_subscriptions() daily (the worker existed
--    but nothing scheduled it — renewals have been sitting stale).
-- 5. finance_alerts  — adds a needs_review count; also lands the prod hotfix
--    (synced sources aren't "missing a vendor") in the repo, extended to 'csv'.
-- 6. Data fix        — "Seeds" now maps to Schedule F "Seeds and plants"
--    (was falling through to "Other expenses"); mirrors scheduleF.ts.
-- ============================================================================

-- 1. Review queue state ------------------------------------------------------

alter table public.expenses
  add column if not exists needs_review boolean not null default false;

-- 2. CSV import provenance ---------------------------------------------------

create table if not exists public.expense_import_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  file_name text not null default '',
  row_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.expense_import_batches enable row level security;

drop policy if exists "expense_import_batches org access" on public.expense_import_batches;
create policy "expense_import_batches org access" on public.expense_import_batches
  for all to authenticated
  using (org_id in (select private.user_org_ids())
         and private.user_role_in(org_id) in ('owner','manager'))
  with check (org_id in (select private.user_org_ids())
              and private.user_role_in(org_id) in ('owner','manager'));

drop trigger if exists expense_import_batches_org on public.expense_import_batches;
create trigger expense_import_batches_org
  before insert or update on public.expense_import_batches
  for each row execute function private.enforce_row_org();

alter table public.expenses
  add column if not exists import_batch_id uuid references public.expense_import_batches(id) on delete set null;
create index if not exists expenses_import_batch_idx
  on public.expenses (import_batch_id) where import_batch_id is not null;

do $$
begin
  alter table public.expenses drop constraint if exists expenses_source_check;
  alter table public.expenses
    add constraint expenses_source_check
    check (source in ('manual','subscription','supply_purchase','mileage','etsy','csv'));
end $$;

-- 3. Auto-categorization rules ----------------------------------------------
-- Matching runs client-side (src/lib/expenseRules.ts) at the CSV/scan/manual
-- write paths; the table is just durable, org-scoped rule storage. Synced Etsy
-- rows arrive pre-classified and skip rules entirely.

create table if not exists public.expense_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  priority integer not null default 100,
  match_field text not null default 'any' check (match_field in ('memo','vendor','any')),
  match_value text not null check (length(trim(match_value)) > 0),
  amount_min numeric check (amount_min is null or amount_min >= 0),
  amount_max numeric check (amount_max is null or amount_max >= 0),
  set_category text not null check (length(trim(set_category)) > 0),
  set_vendor_id uuid references public.vendors(id) on delete set null,
  mark_reviewed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expense_rules_org_idx on public.expense_rules (org_id, priority);

alter table public.expense_rules enable row level security;

drop policy if exists "expense_rules org access" on public.expense_rules;
create policy "expense_rules org access" on public.expense_rules
  for all to authenticated
  using (org_id in (select private.user_org_ids())
         and private.user_role_in(org_id) in ('owner','manager'))
  with check (org_id in (select private.user_org_ids())
              and private.user_role_in(org_id) in ('owner','manager'));

drop trigger if exists expense_rules_org on public.expense_rules;
create trigger expense_rules_org
  before insert or update on public.expense_rules
  for each row execute function private.enforce_row_org();

drop trigger if exists expense_rules_updated_at on public.expense_rules;
create trigger expense_rules_updated_at
  before update on public.expense_rules
  for each row execute function public.set_updated_at();

-- 4. Recurring subscriptions: complete the tax snapshot, then turn it on -----

-- Rewrite: adds schedule_f_category (was NULL on every subscription expense —
-- the org files Schedule F), honors finance_settings.expense_categories
-- overrides for both lines, and stamps vendor_name with the subscription name
-- when no vendor is linked (the ledger's vendor column was blank).
-- Fallback CASEs mirror src/lib/scheduleC.ts / src/lib/scheduleF.ts — keep in sync.
create or replace function public.log_subscription_charge(p_id uuid)
returns date
language plpgsql
security invoker
set search_path = public
as $$
declare
  s public.recurring_expenses%rowtype;
  v_base date;
  v_new  date;
  v_step interval;
  v_key  text;
  v_book_c text;
  v_book_f text;
  v_sched_c text;
  v_sched_f text;
begin
  select * into s from public.recurring_expenses where id = p_id;
  if s.id is null then raise exception 'subscription not found'; end if;

  v_base := coalesce(s.next_renewal, (now() at time zone 'America/Phoenix')::date);
  v_step := case s.billing_cycle
              when 'yearly' then interval '1 year'
              when 'quarterly' then interval '3 months'
              else interval '1 month' end;
  v_new := (v_base + v_step)::date;

  v_key := lower(trim(coalesce(s.category, '')));

  -- Org-book override (finance_settings.expense_categories jsonb), if present.
  select nullif(trim(c->>'scheduleC'), ''), nullif(trim(c->>'scheduleF'), '')
    into v_book_c, v_book_f
    from public.finance_settings fs,
         jsonb_array_elements(coalesce(fs.expense_categories, '[]'::jsonb)) c
   where fs.org_id = s.org_id
     and lower(trim(coalesce(c->>'name', ''))) = v_key
   limit 1;

  v_sched_c := coalesce(v_book_c, case v_key
                 when 'soil and media'        then 'Supplies'
                 when 'packaging'             then 'Supplies'
                 when 'tools'                 then 'Supplies'
                 when 'utilities'             then 'Utilities'
                 when 'marketing'             then 'Advertising'
                 when 'marketplace fees'      then 'Commissions and fees'
                 when 'permits and licenses'  then 'Taxes and licenses'
                 else 'Other expenses' end);

  v_sched_f := coalesce(v_book_f, case v_key
                 when 'soil and media'        then 'Supplies'
                 when 'packaging'             then 'Supplies'
                 when 'tools'                 then 'Supplies'
                 when 'utilities'             then 'Utilities'
                 when 'permits and licenses'  then 'Taxes'
                 when 'shipping'              then 'Freight and trucking'
                 when 'fertilizer'            then 'Fertilizers and lime'
                 when 'chemicals'             then 'Chemicals'
                 when 'plants'                then 'Seeds and plants'
                 when 'seeds'                 then 'Seeds and plants'
                 when 'seeds and plants'      then 'Seeds and plants'
                 else 'Other expenses' end);

  insert into public.expenses
    (org_id, user_id, amount, occurred_on, category,
     schedule_c_category, schedule_f_category,
     vendor_id, vendor_name, source, deductible, description)
  values
    (s.org_id, s.user_id, s.amount, v_base, coalesce(s.category, 'Subscription'),
     v_sched_c, v_sched_f,
     s.vendor_id, case when s.vendor_id is null then s.name end,
     'subscription', true, s.name || ' (' || s.billing_cycle || ')');

  update public.recurring_expenses set next_renewal = v_new, updated_at = now() where id = p_id;
  return v_new;
end $$;

revoke all on function public.log_subscription_charge(uuid) from public, anon;
grant execute on function public.log_subscription_charge(uuid) to authenticated;

-- Auto-log is the norm now: new subscriptions default ON, and existing active
-- ones are flipped ON so the daily worker picks them up. The worker's catch-up
-- loop posts any renewals that came due while nothing was scheduled.
alter table public.recurring_expenses alter column auto_log set default true;
update public.recurring_expenses set auto_log = true, updated_at = now()
 where status = 'active' and auto_log = false;

-- The missing schedule: nothing ever called process_due_subscriptions(). Run
-- it daily at 13:30 UTC (06:30 America/Phoenix, no DST) straight in Postgres —
-- no HTTP hop, no external env to configure. The Vercel cron (13:00 UTC) stays
-- as harmless redundancy; the worker is idempotent per day.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'subscriptions-autolog-daily') then
    perform cron.unschedule('subscriptions-autolog-daily');
  end if;
end $$;

select cron.schedule(
  'subscriptions-autolog-daily',
  '30 13 * * *',
  $$ select public.process_due_subscriptions(); $$
);

-- 5. finance_alerts: surface the review queue --------------------------------
-- Based on the version live in prod (which already excludes synced sources
-- from the "missing vendor" nag — that hotfix now lives in the repo). Adds:
--   * 'csv' to the vendor exclusion (imports carry vendor_name, not vendor_id),
--   * 'needs_review': count of imported rows awaiting a human glance.
create or replace function public.finance_alerts(p_org_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with t as (select (now() at time zone 'America/Phoenix')::date as today)
  select jsonb_build_object(
    'renewing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'amount', s.amount, 'next_renewal', s.next_renewal
      ) order by s.next_renewal)
      from public.recurring_expenses s, t
      where s.org_id = p_org_id and s.status = 'active' and s.next_renewal is not null
        and s.next_renewal >= t.today and s.next_renewal <= t.today + 14
    ), '[]'::jsonb),
    'overdue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'amount', s.amount, 'next_renewal', s.next_renewal
      ) order by s.next_renewal)
      from public.recurring_expenses s, t
      where s.org_id = p_org_id and s.status = 'active' and s.next_renewal is not null
        and s.next_renewal < t.today
    ), '[]'::jsonb),
    'low_stock', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', su.id, 'name', su.name, 'on_hand', su.on_hand,
        'reorder_threshold', su.reorder_threshold, 'unit', su.unit
      ) order by su.name)
      from public.supplies su
      where su.org_id = p_org_id and su.reorder_threshold is not null
        and su.on_hand <= su.reorder_threshold
    ), '[]'::jsonb),
    'uncategorized', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'amount', e.amount, 'description', e.description, 'occurred_on', e.occurred_on,
        'missing', case
          when e.category is null and e.vendor_id is null then 'category & vendor'
          when e.category is null then 'category'
          else 'vendor' end
      ) order by e.occurred_on desc)
      from public.expenses e, t
      where e.org_id = p_org_id
        and e.occurred_on >= date_trunc('month', t.today)::date
        and (
          e.category is null
          or (e.vendor_id is null and e.source not in ('etsy', 'subscription', 'supply_purchase', 'csv'))
        )
    ), '[]'::jsonb),
    'needs_review', coalesce((
      select count(*) from public.expenses e
      where e.org_id = p_org_id and e.needs_review
    ), 0)
  );
$$;

revoke all on function public.finance_alerts(uuid) from public, anon;
grant execute on function public.finance_alerts(uuid) to authenticated;

-- 6. Data fix: Seeds → Schedule F "Seeds and plants" -------------------------
-- The F backfill predated the 'seeds' mapping and filed these under "Other
-- expenses". Only touch rows still carrying the derived value; a hand-set line
-- is left alone.
update public.expenses
   set schedule_f_category = 'Seeds and plants', updated_at = now()
 where lower(trim(coalesce(category, ''))) = 'seeds'
   and (schedule_f_category is null or schedule_f_category = 'Other expenses');
