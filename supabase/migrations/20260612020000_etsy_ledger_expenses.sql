-- ============================================================================
-- Etsy ledger → expenses: shipping labels + marketplace fees as REAL costs.
--
-- The seller's shipping/postage and Etsy fees live in Etsy's Payment Account
-- Ledger, not on receipts. The etsy-sync poller now imports them as `expenses`
-- rows (source 'etsy'), so they flow through every finance rollup exactly once.
--
-- Because actual Etsy fees now post as expenses, the per-order Etsy fee
-- *estimate* in _finance_kpi_window / finance_revenue_* / finance_cashflow must
-- be retired for Etsy, or fees would be double-counted (estimate at net-revenue
-- AND actual as an expense). We add channel_fee_rules.import_actuals and gate
-- the estimate on it — Etsy → actuals; Shopify/eBay keep their estimates until
-- they get their own imports. Net Profit is unchanged: the estimate is replaced
-- by actuals, and fees move from a net-revenue contra to a Commissions-and-fees
-- expense line (more correct for Schedule C).
-- ============================================================================

-- 1. Idempotency key for synced expenses (orders dedupe on external_id; expenses
--    didn't have one). Partial unique so manual rows (null) are unconstrained.
alter table public.expenses add column if not exists external_id text;
create unique index if not exists expenses_external_id_key
  on public.expenses (external_id) where external_id is not null;

-- 2. Allow the 'etsy' source discriminator.
do $$
begin
  alter table public.expenses drop constraint if exists expenses_source_check;
  alter table public.expenses
    add constraint expenses_source_check
    check (source in ('manual','subscription','supply_purchase','mileage','etsy'));
end $$;

-- 3. Flag for channels whose fees are imported as actuals (estimate suppressed).
--    Defaults FALSE so this migration is inert for reporting: Etsy fees stay
--    ESTIMATED until go-live flips this to true at the SAME moment the ledger
--    import is enabled + backfilled, so there's no window where Etsy fees are
--    neither estimated nor imported. Go-live runs, in one step:
--      update public.channel_fee_rules set import_actuals = true where lower(channel) = 'etsy';
--      -- and set integration_config etsy_ledger_sync = 'on', then trigger a sync.
alter table public.channel_fee_rules
  add column if not exists import_actuals boolean not null default false;

-- 4. Recreate the four fee-estimating functions, gating the channel_fee_rules
--    join on `not coalesce(c.import_actuals, false)` so flagged channels (Etsy)
--    contribute 0 estimated fees.

-- 4a. Canonical window (cash basis; COGS managerial-only — unchanged from H2).
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
         and not coalesce(c.import_actuals, false)
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

-- 4b. Per-channel revenue breakdown.
create or replace function public.finance_revenue_by_channel(p_org_id uuid, p_period text default 'month')
returns table(channel text, gross numeric, refunds numeric, fees numeric, net numeric, rate numeric)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare v_today date := (now() at time zone 'America/Phoenix')::date; v_start date; v_end date;
begin
  if p_period = 'ytd' then v_start := date_trunc('year', v_today)::date; else v_start := date_trunc('month', v_today)::date; end if;
  v_end := v_today + 1;
  return query
  with ord as (
    select o.id, o.total, o.status, o.channel
    from public.orders o
    where o.org_id = p_org_id
      and (o.placed_at at time zone 'America/Phoenix')::date >= v_start
      and (o.placed_at at time zone 'America/Phoenix')::date < v_end
  ),
  agg as (
    select o.channel,
      sum(case when o.status not in ('cancelled','refunded') then o.total else 0 end) as gross,
      sum(case when o.status = 'refunded' then o.total else 0 end) as refunds,
      sum(case when o.status not in ('cancelled','refunded')
          then o.total*(coalesce(c.percent_fee,0)+coalesce(c.payment_percent,0))/100.0
               + coalesce(c.fixed_fee,0) + coalesce(c.payment_fixed,0)
               + coalesce(c.listing_fee,0)*coalesce(oi.items,0)
          else 0 end) as fees
    from ord o
    left join public.channel_fee_rules c on c.org_id=p_org_id and lower(c.channel)=lower(o.channel) and c.active
      and not coalesce(c.import_actuals, false)
    left join lateral (select sum(qty) as items from public.order_items where order_id=o.id) oi on true
    group by o.channel
  )
  select a.channel, a.gross, a.refunds, a.fees, a.gross - a.fees as net,
         case when a.gross > 0 then round(a.fees / a.gross * 100, 2) else 0 end as rate
  from agg a order by a.gross desc;
end $$;

-- 4c. Trailing 12-month net revenue trend per channel.
create or replace function public.finance_revenue_trend(p_org_id uuid)
returns table(month date, channel text, net numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with first_month as (
    select (date_trunc('month', (now() at time zone 'America/Phoenix')::date) - interval '11 months')::date as m
  ),
  ord as (
    select date_trunc('month', (o.placed_at at time zone 'America/Phoenix')::date)::date as m,
           o.id, o.total, o.status, o.channel
    from public.orders o
    where o.org_id = p_org_id
      and (o.placed_at at time zone 'America/Phoenix')::date >= (select m from first_month)
  )
  select o.m as month, o.channel,
    sum(case when o.status not in ('cancelled','refunded') then o.total else 0 end)
    - sum(case when o.status not in ('cancelled','refunded')
          then o.total*(coalesce(c.percent_fee,0)+coalesce(c.payment_percent,0))/100.0
               + coalesce(c.fixed_fee,0) + coalesce(c.payment_fixed,0)
               + coalesce(c.listing_fee,0)*coalesce(oi.items,0)
          else 0 end) as net
  from ord o
  left join public.channel_fee_rules c on c.org_id=p_org_id and lower(c.channel)=lower(o.channel) and c.active
    and not coalesce(c.import_actuals, false)
  left join lateral (select sum(qty) as items from public.order_items where order_id=o.id) oi on true
  group by o.m, o.channel
  order by o.m, o.channel;
$$;

-- 4d. Cash flow (H1 version, money_in net of estimated fees).
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
         and not coalesce(c.import_actuals, false)
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
