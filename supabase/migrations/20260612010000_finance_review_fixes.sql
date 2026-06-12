-- ============================================================================
-- Pre-deploy review fixes.
--   H1: finance_cashflow money_in now includes the Etsy per-item listing fee,
--       matching _finance_kpi_window / finance_revenue_* (added in 290000) so
--       the cash-flow chart agrees with Net Revenue elsewhere.
--   L1: expense_set_vendor_name trigger scopes the vendor lookup to the row's org.
--   L2: log_subscription_charge maps categories to Schedule C using the full
--       canonical map (mirrors src/lib/scheduleC.ts / migration 220000).
--   M1: process_due_subscriptions catches up ALL overdue cycles per run, so a
--       second invocation the same day is a true no-op (idempotent).
--   M2: new orgs auto-seed finance_settings + channel_fee_rules.
-- ============================================================================

-- H1 -------------------------------------------------------------------------
create or replace function public.finance_cashflow(p_org_id uuid)
returns table(month date, money_in numeric, money_out numeric, net numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', (now() at time zone 'America/Phoenix')::date)::date as cur_month
  ),
  months as (
    select generate_series(b.cur_month - interval '11 months', b.cur_month, interval '1 month')::date as m
    from bounds b
  ),
  first_month as (select min(m) as m from months),
  ord as (
    select date_trunc('month', (o.placed_at at time zone 'America/Phoenix')::date)::date as m,
           o.id, o.total, o.status, o.channel
    from public.orders o
    where o.org_id = p_org_id
      and (o.placed_at at time zone 'America/Phoenix')::date >= (select m from first_month)
  ),
  rev as (
    select o.m,
      sum(case when o.status not in ('cancelled','refunded') then o.total else 0 end)
      - sum(case when o.status not in ('cancelled','refunded')
                 then o.total * (coalesce(c.percent_fee,0) + coalesce(c.payment_percent,0)) / 100.0
                      + coalesce(c.fixed_fee,0) + coalesce(c.payment_fixed,0)
                      + coalesce(c.listing_fee,0) * coalesce(oi.items,0)
                 else 0 end) as money_in
    from ord o
    left join public.channel_fee_rules c
      on c.org_id = p_org_id and lower(c.channel) = lower(o.channel) and c.active
    left join lateral (select sum(qty) as items from public.order_items where order_id = o.id) oi on true
    group by o.m
  ),
  exp as (
    select date_trunc('month', occurred_on)::date as m, coalesce(sum(amount), 0) as v
    from public.expenses
    where org_id = p_org_id and occurred_on >= (select m from first_month)
    group by 1
  )
  select
    mo.m as month,
    coalesce(r.money_in, 0) as money_in,
    coalesce(e.v, 0) as money_out,
    coalesce(r.money_in, 0) - coalesce(e.v, 0) as net
  from months mo
  left join rev r on r.m = mo.m
  left join exp e on e.m = mo.m
  order by mo.m;
$$;

-- L1 -------------------------------------------------------------------------
create or replace function private.expense_set_vendor_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vendor_id is not null then
    select name into new.vendor_name
    from public.vendors where id = new.vendor_id and org_id = new.org_id;
  end if;
  return new;
end $$;

-- L2 -------------------------------------------------------------------------
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
  v_sched text;
begin
  select * into s from public.recurring_expenses where id = p_id;
  if s.id is null then raise exception 'subscription not found'; end if;

  v_base := coalesce(s.next_renewal, (now() at time zone 'America/Phoenix')::date);
  v_step := case s.billing_cycle
              when 'yearly' then interval '1 year'
              when 'quarterly' then interval '3 months'
              else interval '1 month' end;
  v_new := (v_base + v_step)::date;

  v_sched := case lower(trim(coalesce(s.category, '')))
               when 'soil and media'       then 'Supplies'
               when 'packaging'            then 'Supplies'
               when 'tools'                then 'Supplies'
               when 'utilities'            then 'Utilities'
               when 'marketing'            then 'Advertising'
               when 'permits and licenses' then 'Taxes and licenses'
               when 'shipping'             then 'Other expenses'
               when 'software'             then 'Other expenses'
               when 'subscription'         then 'Other expenses'
               when 'other'                then 'Other expenses'
               else 'Other expenses' end;

  insert into public.expenses
    (org_id, user_id, amount, occurred_on, category, schedule_c_category, vendor_id, source, deductible, description)
  values
    (s.org_id, s.user_id, s.amount, v_base, coalesce(s.category, 'Subscription'), v_sched,
     s.vendor_id, 'subscription', true, s.name || ' (' || s.billing_cycle || ')');

  update public.recurring_expenses set next_renewal = v_new, updated_at = now() where id = p_id;
  return v_new;
end $$;

-- M1 -------------------------------------------------------------------------
create or replace function public.process_due_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_today date := (now() at time zone 'America/Phoenix')::date;
  v_new date;
  v_guard int;
  n int := 0;
begin
  for r in
    select id from public.recurring_expenses
    where auto_log = true and status = 'active'
      and next_renewal is not null and next_renewal <= v_today
  loop
    v_guard := 0;
    loop
      v_new := public.log_subscription_charge(r.id);
      n := n + 1;
      v_guard := v_guard + 1;
      exit when v_new > v_today or v_guard >= 60;  -- catch up missed cycles; bound for safety
    end loop;
  end loop;
  return n;
end $$;

-- M2 -------------------------------------------------------------------------
create or replace function private.seed_org_finance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- where-not-exists (not on-conflict) so already-seeded orgs attempt no insert
  -- at all, avoiding the enforce_row_org trigger on a no-op.
  insert into public.finance_settings (org_id, user_id)
  select new.org_id, new.user_id
  where not exists (select 1 from public.finance_settings f where f.org_id = new.org_id);

  insert into public.channel_fee_rules
    (org_id, user_id, channel, percent_fee, fixed_fee, payment_percent, payment_fixed, listing_fee)
  select new.org_id, new.user_id, d.channel, d.percent_fee, d.fixed_fee, d.payment_percent, d.payment_fixed, d.listing_fee
  from (values
    ('etsy',    6.5,   0::numeric, 3.0, 0.25, 0.20),
    ('shopify', 0::numeric, 0::numeric, 2.9, 0.30, 0::numeric),
    ('ebay',    13.25, 0.30, 0::numeric, 0::numeric, 0::numeric)
  ) as d(channel, percent_fee, fixed_fee, payment_percent, payment_fixed, listing_fee)
  where not exists (
    select 1 from public.channel_fee_rules c where c.org_id = new.org_id and c.channel = d.channel
  );

  return new;
end $$;

drop trigger if exists org_memberships_seed_finance on public.org_memberships;
create trigger org_memberships_seed_finance
  after insert on public.org_memberships
  for each row when (new.role = 'owner')
  execute function private.seed_org_finance();

-- H2 (cash basis) ------------------------------------------------------------
-- Net Profit no longer subtracts production COGS. On cash basis, supplies are
-- deducted when purchased (the supply_purchase expense), so subtracting consumed
-- materials again double-counted them. Production COGS (materials + labor) stays
-- in the payload as a MANAGERIAL per-unit-costing metric (Production / Cultivar
-- Profit), not a Net Profit deduction. Hired labor, if it's a real cash cost,
-- should be logged as an expense to be deducted.
create or replace function public._finance_kpi_window(
  p_org_id uuid, p_start date, p_end date
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with ord as (
    select o.id, o.total, o.status, o.channel
    from public.orders o
    where o.org_id = p_org_id
      and (o.placed_at at time zone 'America/Phoenix')::date >= p_start
      and (o.placed_at at time zone 'America/Phoenix')::date <  p_end
  ),
  gross as (
    select
      coalesce(sum(total) filter (where status <> 'cancelled'), 0) as gross_incl,
      coalesce(sum(total) filter (where status = 'refunded'), 0)   as refunds
    from ord
  ),
  fees as (
    select coalesce(sum(
      o.total * (coalesce(c.percent_fee, 0) + coalesce(c.payment_percent, 0)) / 100.0
      + coalesce(c.fixed_fee, 0) + coalesce(c.payment_fixed, 0)
      + coalesce(c.listing_fee, 0) * coalesce(oi.items, 0)
    ), 0) as channel_fees
    from ord o
    join public.channel_fee_rules c
      on c.org_id = p_org_id and lower(c.channel) = lower(o.channel) and c.active
    left join lateral (select sum(qty) as items from public.order_items where order_id = o.id) oi on true
    where o.status not in ('cancelled', 'refunded')
  ),
  exp as (
    select coalesce(sum(amount), 0) as expenses
    from public.expenses
    where org_id = p_org_id and occurred_on >= p_start and occurred_on < p_end
  ),
  cogs as (
    select
      coalesce((
        select sum(s.qty * s.unit_cost_snapshot)
        from public.production_run_supplies s
        join public.production_runs r on r.id = s.run_id
        where r.org_id = p_org_id and r.run_on >= p_start and r.run_on < p_end
      ), 0) as materials,
      coalesce((
        select sum(r.labor_hours * r.labor_rate)
        from public.production_runs r
        where r.org_id = p_org_id and r.run_on >= p_start and r.run_on < p_end
          and r.labor_type = 'hired'
      ), 0) as hired_labor
  ),
  mileage as (
    select coalesce((
      select sum(m.miles) from public.mileage_log m
      where m.org_id = p_org_id and m.trip_date >= p_start and m.trip_date < p_end
    ), 0) * coalesce((select mileage_rate_cents from public.finance_settings where org_id = p_org_id), 70) / 100.0 as deduction
  )
  select jsonb_build_object(
    'gross_sales',    g.gross_incl - g.refunds,
    'refunds',        g.refunds,
    'channel_fees',   f.channel_fees,
    'net_revenue',    (g.gross_incl - g.refunds) - f.channel_fees,
    'expenses',       e.expenses,
    'cogs_materials', c.materials,
    'cogs_labor',     c.hired_labor,
    'cogs',           c.materials + c.hired_labor,
    'mileage',        mi.deduction,
    'gross_profit',   ((g.gross_incl - g.refunds) - f.channel_fees) - (c.materials + c.hired_labor),
    'net_profit',     ((g.gross_incl - g.refunds) - f.channel_fees) - e.expenses - mi.deduction
  )
  from gross g, fees f, exp e, cogs c, mileage mi;
$$;
