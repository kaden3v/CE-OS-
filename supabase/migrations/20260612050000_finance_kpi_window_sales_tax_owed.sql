-- Additive: _finance_kpi_window gains sales_tax_owed = sales tax collected on
-- non-facilitator channels (the seller remits this; Etsy/eBay remit their own).
-- Powers the Overview tax-accrual tile so the AZ TPT liability isn't a surprise.
-- All other fields unchanged (reconciliation preserved, verified to the cent).
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
      coalesce(sum(subtotal + shipping) filter (where status <> 'cancelled'), 0) as gross_incl,
      coalesce(sum(subtotal + shipping) filter (where status = 'refunded'), 0)   as refunds,
      coalesce(sum(shipping) filter (where status <> 'cancelled'), 0)
        - coalesce(sum(shipping) filter (where status = 'refunded'), 0)          as shipping_collected,
      count(*) filter (where status not in ('cancelled', 'refunded'))            as order_count,
      coalesce(sum(tax) filter (where status not in ('cancelled', 'refunded')
        and lower(channel) not in ('etsy', 'ebay')), 0)                          as sales_tax_owed
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
    'shipping_collected', g.shipping_collected,
    'order_count',    g.order_count,
    'sales_tax_owed', g.sales_tax_owed,
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
