-- Forensic audit fixes (2026-06-12). See docs/FINANCE_AUDIT.md.
--
-- C1 (CRITICAL): revenue base is now subtotal+shipping, not orders.total. orders.total
--   includes orders.tax, which on a marketplace facilitator (Etsy) is collected AND remitted
--   by the marketplace — the seller never receives it. Counting it as revenue overstated
--   net profit ~12.6% ($4,411 -> $3,851). subtotal+shipping also excludes the H1 +$0.28
--   import anomaly that lives only in orders.total.
-- H2: gross now includes refunded orders and nets refunds explicitly; net = (gross-refunds)-fees
--   consistently across _finance_kpi_window / finance_revenue_by_channel / finance_revenue_trend /
--   finance_cashflow (previously the channel/trend surfaces omitted refunds and used a different
--   gross filter, so they diverged from the KPI core the moment any refund existed).
-- L2: explicit upper date bounds added to finance_cashflow + finance_revenue_trend so a stray
--   future-dated order cannot fold into the latest month.
-- L3: finance_alerts no longer flags imported (etsy/subscription/supply_purchase) fee rows as
--   "missing vendor", which was flooding the Needs-Attention panel with 90+ false alerts.
--
-- Modeled channel fees remain on o.total because payment processors charge the full captured
-- amount (incl. tax+shipping); the modeled path only applies to channels without imported
-- actuals (Etsy is gated out via import_actuals=true).

create or replace function public._finance_kpi_window(p_org_id uuid, p_start date, p_end date)
returns jsonb language sql stable set search_path to 'public' as $function$
  with ord as (
    select o.id, o.subtotal, o.shipping, o.total, o.status, o.channel
    from public.orders o
    where o.org_id = p_org_id
      and (o.placed_at at time zone 'America/Phoenix')::date >= p_start
      and (o.placed_at at time zone 'America/Phoenix')::date <  p_end
  ),
  gross as (
    select
      coalesce(sum(subtotal + shipping) filter (where status <> 'cancelled'), 0) as gross_incl,
      coalesce(sum(subtotal + shipping) filter (where status = 'refunded'), 0)   as refunds
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
$function$;

create or replace function public.finance_revenue_by_channel(p_org_id uuid, p_period text default 'month'::text)
returns table(channel text, gross numeric, refunds numeric, fees numeric, net numeric, rate numeric)
language plpgsql stable set search_path to 'public' as $function$
declare v_today date := (now() at time zone 'America/Phoenix')::date; v_start date; v_end date;
begin
  if p_period = 'ytd' then v_start := date_trunc('year', v_today)::date; else v_start := date_trunc('month', v_today)::date; end if;
  v_end := v_today + 1;
  return query
  with ord as (
    select o.id, o.subtotal, o.shipping, o.total, o.status, o.channel
    from public.orders o
    where o.org_id = p_org_id
      and (o.placed_at at time zone 'America/Phoenix')::date >= v_start
      and (o.placed_at at time zone 'America/Phoenix')::date < v_end
  ),
  agg as (
    select o.channel,
      sum(case when o.status <> 'cancelled' then o.subtotal + o.shipping else 0 end) as gross,
      sum(case when o.status = 'refunded' then o.subtotal + o.shipping else 0 end) as refunds,
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
  select a.channel, a.gross, a.refunds, a.fees, (a.gross - a.refunds) - a.fees as net,
         case when a.gross > 0 then round(a.fees / a.gross * 100, 2) else 0 end as rate
  from agg a order by a.gross desc;
end $function$;

create or replace function public.finance_revenue_trend(p_org_id uuid)
returns table(month date, channel text, net numeric)
language sql stable set search_path to 'public' as $function$
  with first_month as (
    select (date_trunc('month', (now() at time zone 'America/Phoenix')::date) - interval '11 months')::date as m
  ),
  next_month as (
    select (date_trunc('month', (now() at time zone 'America/Phoenix')::date) + interval '1 month')::date as m
  ),
  ord as (
    select date_trunc('month', (o.placed_at at time zone 'America/Phoenix')::date)::date as m,
           o.id, o.subtotal, o.shipping, o.total, o.status, o.channel
    from public.orders o
    where o.org_id = p_org_id
      and (o.placed_at at time zone 'America/Phoenix')::date >= (select m from first_month)
      and (o.placed_at at time zone 'America/Phoenix')::date <  (select m from next_month)
  )
  select o.m as month, o.channel,
    sum(case when o.status <> 'cancelled' then o.subtotal + o.shipping else 0 end)
    - sum(case when o.status = 'refunded' then o.subtotal + o.shipping else 0 end)
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
$function$;

create or replace function public.finance_cashflow(p_org_id uuid)
returns table(month date, money_in numeric, money_out numeric, net numeric)
language sql stable set search_path to 'public' as $function$
  with bounds as (
    select date_trunc('month', (now() at time zone 'America/Phoenix')::date)::date as cur_month
  ),
  months as (
    select generate_series(b.cur_month - interval '11 months', b.cur_month, interval '1 month')::date as m
    from bounds b
  ),
  first_month as (select min(m) as m from months),
  next_month as (select (cur_month + interval '1 month')::date as m from bounds),
  ord as (
    select date_trunc('month', (o.placed_at at time zone 'America/Phoenix')::date)::date as m,
           o.id, o.subtotal, o.shipping, o.total, o.status, o.channel
    from public.orders o
    where o.org_id = p_org_id
      and (o.placed_at at time zone 'America/Phoenix')::date >= (select m from first_month)
      and (o.placed_at at time zone 'America/Phoenix')::date <  (select m from next_month)
  ),
  rev as (
    select o.m,
      sum(case when o.status <> 'cancelled' then o.subtotal + o.shipping else 0 end)
      - sum(case when o.status = 'refunded' then o.subtotal + o.shipping else 0 end)
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
$function$;

create or replace function public.finance_alerts(p_org_id uuid)
returns jsonb language sql stable set search_path to 'public' as $function$
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
          or (e.vendor_id is null and e.source not in ('etsy', 'subscription', 'supply_purchase'))
        )
    ), '[]'::jsonb)
  );
$function$;
