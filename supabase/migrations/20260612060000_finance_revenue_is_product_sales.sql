-- Revenue = plant sales (product subtotal). Shipping is no longer folded into
-- revenue; it becomes a separate net line (collected vs postage). Net profit is
-- unchanged by this redefinition — both the old and new formulas reduce to
-- subtotal + shipping - fees - expenses - mileage; only the presentation changes:
--   net_revenue = product - channel_fees
--   net_profit  = net_revenue + shipping_collected - expenses - mileage
-- `gross_receipts` (product + shipping, net of refunds) is retained for the tax
-- report, where the IRS gross-receipts line includes shipping charged.
-- finance_cashflow is intentionally NOT changed: money_in is actual cash
-- received, which legitimately includes shipping.

create or replace function public._finance_kpi_window(p_org_id uuid, p_start date, p_end date)
returns jsonb language sql stable set search_path to 'public' as $function$
  with ord as (
    select o.id, o.subtotal, o.shipping, o.total, o.tax, o.status, o.channel
    from public.orders o
    where o.org_id = p_org_id
      and (o.placed_at at time zone 'America/Phoenix')::date >= p_start
      and (o.placed_at at time zone 'America/Phoenix')::date <  p_end
  ),
  gross as (
    select
      coalesce(sum(subtotal) filter (where status <> 'cancelled'), 0)
        - coalesce(sum(subtotal) filter (where status = 'refunded'), 0)  as product_net,
      coalesce(sum(shipping) filter (where status <> 'cancelled'), 0)
        - coalesce(sum(shipping) filter (where status = 'refunded'), 0)  as shipping_net,
      coalesce(sum(subtotal + shipping) filter (where status = 'refunded'), 0) as refunds,
      count(*) filter (where status not in ('cancelled', 'refunded'))    as order_count,
      coalesce(sum(tax) filter (where status not in ('cancelled', 'refunded')
        and lower(channel) not in ('etsy', 'ebay')), 0)                  as sales_tax_owed
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
    'gross_sales',    g.product_net,
    'gross_receipts', g.product_net + g.shipping_net,
    'refunds',        g.refunds,
    'shipping_collected', g.shipping_net,
    'order_count',    g.order_count,
    'sales_tax_owed', g.sales_tax_owed,
    'channel_fees',   f.channel_fees,
    'net_revenue',    g.product_net - f.channel_fees,
    'expenses',       e.expenses,
    'cogs_materials', c.materials,
    'cogs_labor',     c.hired_labor,
    'cogs',           c.materials + c.hired_labor,
    'mileage',        mi.deduction,
    'gross_profit',   (g.product_net - f.channel_fees) - (c.materials + c.hired_labor),
    'net_profit',     (g.product_net - f.channel_fees) + g.shipping_net - e.expenses - mi.deduction
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
    select o.id, o.subtotal, o.total, o.status, o.channel
    from public.orders o
    where o.org_id = p_org_id
      and (o.placed_at at time zone 'America/Phoenix')::date >= v_start
      and (o.placed_at at time zone 'America/Phoenix')::date < v_end
  ),
  agg as (
    select o.channel,
      sum(case when o.status <> 'cancelled' then o.subtotal else 0 end) as gross,
      sum(case when o.status = 'refunded' then o.subtotal else 0 end) as refunds,
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
           o.id, o.subtotal, o.total, o.status, o.channel
    from public.orders o
    where o.org_id = p_org_id
      and (o.placed_at at time zone 'America/Phoenix')::date >= (select m from first_month)
      and (o.placed_at at time zone 'America/Phoenix')::date <  (select m from next_month)
  )
  select o.m as month, o.channel,
    sum(case when o.status <> 'cancelled' then o.subtotal else 0 end)
    - sum(case when o.status = 'refunded' then o.subtotal else 0 end)
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
