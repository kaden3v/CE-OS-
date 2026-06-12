-- ============================================================================
-- Finance Overview — server-side aggregation RPCs
--
-- The /finances overview page must not pull full tables into the browser, so all
-- aggregation happens here. Functions are SECURITY INVOKER: RLS scopes every read
-- to the caller's org (and managers-only on the financial tables), and the
-- explicit `org_id = p_org_id` filter pins results to the active org.
--
-- Gross sales reconcile with the Tax Report: sum(orders.total) where status not
-- in ('cancelled','refunded'), bucketed by the order's America/Phoenix date.
--
-- Fee / COGS conventions:
--   channel fees  = total*(percent_fee + payment_percent)/100 + fixed_fee
--                   + payment_fixed, per order, joined on channel_fee_rules
--                   (only sales orders; listing_fee is per-listing, not per-order).
--   net revenue   = gross_sales − channel fees  (refunded orders already excluded
--                   from gross_sales, so "minus refunds" nets out to the same).
--   COGS          = run materials (production_run_items) + HIRED labor only
--                   (owner labor is not a cash cost), per production_runs.run_on.
-- ============================================================================

-- Internal: the four KPIs for one [start, end) window. Extracted so finance_kpis
-- computes the current and prior windows from the same logic.
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
    select o.total, o.status, o.channel
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
    ), 0) as channel_fees
    from ord o
    join public.channel_fee_rules c
      on c.org_id = p_org_id and lower(c.channel) = lower(o.channel) and c.active
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
        select sum(i.qty_used * i.unit_cost)
        from public.production_run_items i
        join public.production_runs r on r.id = i.run_id
        where r.org_id = p_org_id and r.run_on >= p_start and r.run_on < p_end
      ), 0) as materials,
      coalesce((
        select sum(r.labor_hours * r.labor_rate)
        from public.production_runs r
        where r.org_id = p_org_id and r.run_on >= p_start and r.run_on < p_end
          and r.labor_type = 'hired'
      ), 0) as hired_labor
  )
  select jsonb_build_object(
    'gross_sales',   g.gross_incl - g.refunds,
    'refunds',       g.refunds,
    'channel_fees',  f.channel_fees,
    'net_revenue',   (g.gross_incl - g.refunds) - f.channel_fees,
    'expenses',      e.expenses,
    'cogs_materials', c.materials,
    'cogs_labor',    c.hired_labor,
    'cogs',          c.materials + c.hired_labor,
    'net_profit',    ((g.gross_incl - g.refunds) - f.channel_fees) - e.expenses - (c.materials + c.hired_labor)
  )
  from gross g, fees f, exp e, cogs c;
$$;

-- KPIs for the current period + the prior comparison period (deltas).
create or replace function public.finance_kpis(
  p_org_id uuid, p_period text default 'month'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_today      date := (now() at time zone 'America/Phoenix')::date;
  v_cur_start  date;
  v_cur_end    date;
  v_prev_start date;
  v_prev_end   date;
begin
  if p_period = 'ytd' then
    v_cur_start  := date_trunc('year', v_today)::date;
    v_cur_end    := v_today + 1;
    v_prev_start := (date_trunc('year', v_today) - interval '1 year')::date;
    v_prev_end   := (v_today - interval '1 year')::date + 1;
  else
    v_cur_start  := date_trunc('month', v_today)::date;
    v_cur_end    := v_today + 1;
    v_prev_start := (date_trunc('month', v_today) - interval '1 month')::date;
    v_prev_end   := date_trunc('month', v_today)::date;
  end if;

  return jsonb_build_object(
    'period',  p_period,
    'current', public._finance_kpi_window(p_org_id, v_cur_start, v_cur_end),
    'prior',   public._finance_kpi_window(p_org_id, v_prev_start, v_prev_end)
  );
end $$;

-- Trailing 12 months of money in (net revenue) vs money out (expenses + supply
-- purchases), with the net. One row per month, oldest first.
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
           o.total, o.status, o.channel
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
                 else 0 end) as money_in
    from ord o
    left join public.channel_fee_rules c
      on c.org_id = p_org_id and lower(c.channel) = lower(o.channel) and c.active
    group by o.m
  ),
  exp as (
    select date_trunc('month', occurred_on)::date as m, coalesce(sum(amount), 0) as v
    from public.expenses
    where org_id = p_org_id and occurred_on >= (select m from first_month)
    group by 1
  ),
  sup as (
    select date_trunc('month', purchase_date)::date as m, coalesce(sum(total_cost), 0) as v
    from public.supply_purchases
    where org_id = p_org_id and purchase_date >= (select m from first_month)
    group by 1
  )
  select
    mo.m as month,
    coalesce(r.money_in, 0) as money_in,
    coalesce(e.v, 0) + coalesce(s.v, 0) as money_out,
    coalesce(r.money_in, 0) - (coalesce(e.v, 0) + coalesce(s.v, 0)) as net
  from months mo
  left join rev r on r.m = mo.m
  left join exp e on e.m = mo.m
  left join sup s on s.m = mo.m
  order by mo.m;
$$;

-- Actionable alerts for the overview panel. Each list carries the entity id so
-- the UI can deep-link to the fix. Quarterly estimated-tax dates are computed
-- client-side (pure calendar math, no query).
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
        and (e.category is null or e.vendor_id is null)
    ), '[]'::jsonb)
  );
$$;

-- Expose to authenticated users only (RLS still gates the rows underneath).
revoke all on function public._finance_kpi_window(uuid, date, date) from public, anon;
revoke all on function public.finance_kpis(uuid, text) from public, anon;
revoke all on function public.finance_cashflow(uuid) from public, anon;
revoke all on function public.finance_alerts(uuid) from public, anon;
grant execute on function public._finance_kpi_window(uuid, date, date) to authenticated;
grant execute on function public.finance_kpis(uuid, text) to authenticated;
grant execute on function public.finance_cashflow(uuid) to authenticated;
grant execute on function public.finance_alerts(uuid) to authenticated;
