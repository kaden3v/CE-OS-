-- ============================================================================
-- Sale-time COGS → real gross margin on the finance Overview.
--
-- Until now the only "COGS" the dashboard knew was production COGS
-- (consumed supplies + hired labor, by run date) — which is the Schedule C
-- tax basis and is correct for that purpose, but says nothing about the cost of
-- what actually SOLD. With per-unit cost now captured on each sale
-- (order_items.cogs, set by consume_inventory_for_order from inventory.cost_basis),
-- we can show a true cost-of-goods-sold and gross margin.
--
-- ADDITIVE and deliberately separate from the existing figures:
--   * cogs_materials / cogs_labor / cogs  — UNCHANGED (production / Schedule C; tax report).
--   * net_profit                          — UNCHANGED (cash basis; supplies are expensed
--                                            when purchased, so COGS is NOT subtracted again).
--   * cogs_sold (NEW)    — cost basis of plants sold (shipped/delivered) in the window.
--   * gross_margin (NEW) — net_revenue − cogs_sold (per-plant profitability).
-- Matched to revenue by order placed_at so margin lands in the same period as the sale.
-- ============================================================================

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
  sold as (
    -- Cost basis of plants actually sold in the window (set at ship time).
    select coalesce((
      select sum(oi.cogs)
      from public.order_items oi
      join public.orders o2 on o2.id = oi.order_id
      where o2.org_id = p_org_id
        and o2.status in ('shipped', 'delivered')
        and (o2.placed_at at time zone 'America/Phoenix')::date >= p_start
        and (o2.placed_at at time zone 'America/Phoenix')::date <  p_end
    ), 0) as cost
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
    'cogs_sold',      s.cost,
    'gross_margin',   (g.product_net - f.channel_fees) - s.cost,
    'mileage',        mi.deduction,
    'gross_profit',   (g.product_net - f.channel_fees) - (c.materials + c.hired_labor),
    'net_profit',     (g.product_net - f.channel_fees) + g.shipping_net - e.expenses - mi.deduction
  )
  from gross g, fees f, exp e, cogs c, sold s, mileage mi;
$function$;
