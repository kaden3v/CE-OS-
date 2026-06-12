-- ============================================================================
-- Finance reports — Revenue / P&L / reconciliation foundation.
--
-- _finance_kpi_window is the single source of truth for a period's finance
-- numbers (Overview, Revenue, and P&L all reduce to it, so they reconcile by
-- construction). This revises it to (a) include the Etsy per-item listing fee
-- in estimated channel fees and (b) subtract a mileage deduction so Net Profit
-- is the true bottom line. finance_pnl reuses it per month → P&L Net Profit
-- equals Overview Net Profit for the same period.
--
-- Adds: mileage_routes (saved one-tap routes), finance_revenue_by_channel,
-- finance_revenue_trend, finance_pnl.
-- ============================================================================

create table if not exists public.mileage_routes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null,
  name       text not null,
  miles      numeric not null default 0,
  round_trip boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists mileage_routes_org_idx on public.mileage_routes(org_id);
alter table public.mileage_routes enable row level security;

do $$
begin
  execute 'drop trigger if exists mileage_routes_enforce_org on public.mileage_routes';
  execute 'create trigger mileage_routes_enforce_org before insert or update on public.mileage_routes for each row execute function private.enforce_row_org()';
  execute 'drop policy if exists "mileage_routes org access" on public.mileage_routes';
  execute 'create policy "mileage_routes org access" on public.mileage_routes for all to authenticated '
        || 'using (org_id in (select private.user_org_ids()) and private.user_role_in(org_id) in (''owner'',''manager'')) '
        || 'with check (org_id in (select private.user_org_ids()) and private.user_role_in(org_id) in (''owner'',''manager''))';
end $$;

-- Canonical period window — now with listing fees + mileage deduction.
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
    'net_profit',     ((g.gross_incl - g.refunds) - f.channel_fees) - e.expenses - (c.materials + c.hired_labor) - mi.deduction
  )
  from gross g, fees f, exp e, cogs c, mileage mi;
$$;

-- Per-channel revenue breakdown for the Revenue page.
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
    left join lateral (select sum(qty) as items from public.order_items where order_id=o.id) oi on true
    group by o.channel
  )
  select a.channel, a.gross, a.refunds, a.fees, a.gross - a.fees as net,
         case when a.gross > 0 then round(a.fees / a.gross * 100, 2) else 0 end as rate
  from agg a order by a.gross desc;
end $$;

-- Trailing 12 months of net revenue per channel for the Revenue trend chart.
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
  left join lateral (select sum(qty) as items from public.order_items where order_id=o.id) oi on true
  group by o.m, o.channel
  order by o.m, o.channel;
$$;

-- Monthly P&L for a year. Months reuse _finance_kpi_window so the year total's
-- net_profit equals finance_kpis for the same period.
create or replace function public.finance_pnl(p_org_id uuid, p_year int)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  mo int; v_ms date; v_me date;
  months jsonb := '[]'::jsonb;
  sched jsonb;
begin
  for mo in 1..12 loop
    v_ms := make_date(p_year, mo, 1);
    v_me := (v_ms + interval '1 month')::date;
    months := months || jsonb_build_array(
      jsonb_set(public._finance_kpi_window(p_org_id, v_ms, v_me), '{month}', to_jsonb(to_char(v_ms, 'Mon')))
    );
  end loop;

  with cats as (
    select distinct coalesce(schedule_c_category, 'Uncategorized') as cat
    from public.expenses where org_id = p_org_id and extract(year from occurred_on) = p_year
  ),
  grid as (
    select c.cat, gs.m,
      (select coalesce(sum(amount), 0) from public.expenses e
        where e.org_id = p_org_id and coalesce(e.schedule_c_category, 'Uncategorized') = c.cat
          and extract(year from e.occurred_on) = p_year and extract(month from e.occurred_on) = gs.m) as amt
    from cats c cross join generate_series(1, 12) gs(m)
  )
  select coalesce(jsonb_agg(jsonb_build_object('category', cat, 'months', months_arr, 'total', total) order by total desc), '[]'::jsonb)
  into sched
  from (select cat, jsonb_agg(amt order by m) as months_arr, sum(amt) as total from grid group by cat) x;

  return jsonb_build_object(
    'year', p_year,
    'months', months,
    'total', public._finance_kpi_window(p_org_id, make_date(p_year, 1, 1), make_date(p_year + 1, 1, 1)),
    'schedule_c', sched
  );
end $$;

revoke all on function public.finance_revenue_by_channel(uuid, text) from public, anon;
revoke all on function public.finance_revenue_trend(uuid) from public, anon;
revoke all on function public.finance_pnl(uuid, int) from public, anon;
grant execute on function public.finance_revenue_by_channel(uuid, text) to authenticated;
grant execute on function public.finance_revenue_trend(uuid) to authenticated;
grant execute on function public.finance_pnl(uuid, int) to authenticated;
