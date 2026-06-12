-- ============================================================================
-- Cost of goods — one event, one entry, many rollups.
--
-- Supply purchases and production runs mutate supply stock + cost through atomic
-- SECURITY INVOKER functions (atomic in the PostgREST request transaction;
-- RLS still gates everything to owners/managers). Reversal is exact for stock
-- (additive); supply unit_cost uses moving-average with an algebraic inverse on
-- delete/edit (exact under LIFO, best-effort otherwise).
--
-- Materials COGS standardizes on production_run_supplies (the production_run_items
-- table from 20260610110000 is migrated in below and retired from the rollups).
-- ============================================================================

-- Backfill the new consumption ledger from the old one (idempotent).
insert into public.production_run_supplies (org_id, user_id, run_id, supply_id, qty, unit_cost_snapshot, created_at)
select i.org_id, i.user_id, i.run_id, i.supply_id, i.qty_used, i.unit_cost, i.created_at
from public.production_run_items i
where not exists (
  select 1 from public.production_run_supplies s
  where s.run_id = i.run_id
    and s.supply_id is not distinct from i.supply_id
    and s.created_at = i.created_at
);

-- ---------------------------------------------------------------------------
-- Supply purchase: + supply_purchases row, + linked expense, + stock, recost.
-- ---------------------------------------------------------------------------
create or replace function public.log_supply_purchase(
  p_supply_id uuid, p_qty numeric, p_total_cost numeric, p_vendor_id uuid, p_purchase_date date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid; v_name text; v_old_on numeric; v_old_cost numeric;
  v_new_on numeric; v_new_cost numeric; v_expense uuid; v_purchase uuid;
begin
  select org_id, name, coalesce(on_hand, 0), coalesce(cost, 0)
    into v_org, v_name, v_old_on, v_old_cost
  from public.supplies where id = p_supply_id;
  if v_org is null then raise exception 'supply not found'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'qty must be positive'; end if;

  v_new_on := v_old_on + p_qty;
  v_new_cost := case when v_new_on > 0 then (v_old_on * v_old_cost + p_total_cost) / v_new_on else 0 end;

  insert into public.expenses
    (org_id, user_id, amount, occurred_on, category, schedule_c_category, vendor_id, source, deductible, description)
  values
    (v_org, auth.uid(), p_total_cost, p_purchase_date, 'Supplies', 'Supplies', p_vendor_id, 'supply_purchase', true,
     'Supply purchase: ' || coalesce(v_name, ''))
  returning id into v_expense;

  insert into public.supply_purchases
    (org_id, user_id, supply_id, vendor_id, qty, total_cost, purchase_date, expense_id)
  values
    (v_org, auth.uid(), p_supply_id, p_vendor_id, p_qty, p_total_cost, p_purchase_date, v_expense)
  returning id into v_purchase;

  update public.supplies
    set on_hand = v_new_on, cost = round(v_new_cost, 4),
        vendor_id = coalesce(p_vendor_id, vendor_id), updated_at = now()
  where id = p_supply_id;

  return v_purchase;
end $$;

-- Reverse a purchase: drop the expense + row, subtract stock, invert moving avg.
create or replace function public.delete_supply_purchase(p_purchase_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_supply uuid; v_qty numeric; v_total numeric; v_expense uuid;
  v_on numeric; v_cost numeric; v_old_on numeric; v_old_cost numeric;
begin
  select supply_id, qty, total_cost, expense_id
    into v_supply, v_qty, v_total, v_expense
  from public.supply_purchases where id = p_purchase_id;
  if v_supply is null then raise exception 'purchase not found'; end if;

  select coalesce(on_hand, 0), coalesce(cost, 0) into v_on, v_cost
  from public.supplies where id = v_supply;

  v_old_on := v_on - v_qty;
  v_old_cost := case when v_old_on > 0 then (v_on * v_cost - v_total) / v_old_on else 0 end;

  delete from public.supply_purchases where id = p_purchase_id;
  if v_expense is not null then delete from public.expenses where id = v_expense; end if;

  update public.supplies
    set on_hand = greatest(v_old_on, 0), cost = round(greatest(v_old_cost, 0), 4), updated_at = now()
  where id = v_supply;
end $$;

-- Edit a purchase = reverse old, apply new (stock + cost + linked expense).
create or replace function public.update_supply_purchase(
  p_purchase_id uuid, p_qty numeric, p_total_cost numeric, p_vendor_id uuid, p_purchase_date date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_supply uuid; v_old_qty numeric; v_old_total numeric; v_expense uuid;
  v_on numeric; v_cost numeric; v_mid_on numeric; v_mid_cost numeric; v_new_on numeric; v_new_cost numeric;
begin
  select supply_id, qty, total_cost, expense_id
    into v_supply, v_old_qty, v_old_total, v_expense
  from public.supply_purchases where id = p_purchase_id;
  if v_supply is null then raise exception 'purchase not found'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'qty must be positive'; end if;

  select coalesce(on_hand, 0), coalesce(cost, 0) into v_on, v_cost from public.supplies where id = v_supply;

  v_mid_on := v_on - v_old_qty;
  v_mid_cost := case when v_mid_on > 0 then (v_on * v_cost - v_old_total) / v_mid_on else 0 end;
  v_mid_cost := greatest(v_mid_cost, 0);

  v_new_on := v_mid_on + p_qty;
  v_new_cost := case when v_new_on > 0 then (v_mid_on * v_mid_cost + p_total_cost) / v_new_on else 0 end;

  update public.supply_purchases
    set qty = p_qty, total_cost = p_total_cost, vendor_id = p_vendor_id, purchase_date = p_purchase_date
  where id = p_purchase_id;

  if v_expense is not null then
    update public.expenses
      set amount = p_total_cost, vendor_id = p_vendor_id, occurred_on = p_purchase_date, updated_at = now()
    where id = v_expense;
  end if;

  update public.supplies
    set on_hand = greatest(v_new_on, 0), cost = round(greatest(v_new_cost, 0), 4), updated_at = now()
  where id = v_supply;
end $$;

-- ---------------------------------------------------------------------------
-- Production run: insert run, snapshot+consume each supply, store unit cost.
-- p_supplies = jsonb array of { supply_id, qty }.
-- ---------------------------------------------------------------------------
create or replace function public.log_production_run(
  p_org_id uuid, p_cultivar_id uuid, p_description text, p_quantity int,
  p_labor_hours numeric, p_labor_rate numeric, p_labor_type text, p_run_on date, p_supplies jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_run uuid; item jsonb; v_supply uuid; v_qty numeric; v_snap numeric;
  v_materials numeric := 0; v_labor numeric; v_unit numeric;
begin
  insert into public.production_runs
    (org_id, user_id, cultivar_id, description, quantity, labor_hours, labor_rate, labor_type, run_on)
  values
    (p_org_id, v_user, p_cultivar_id, p_description, coalesce(p_quantity, 0),
     coalesce(p_labor_hours, 0), coalesce(p_labor_rate, 0), coalesce(p_labor_type, 'owner'), p_run_on)
  returning id into v_run;

  for item in select * from jsonb_array_elements(coalesce(p_supplies, '[]'::jsonb)) loop
    v_supply := (item->>'supply_id')::uuid;
    v_qty := (item->>'qty')::numeric;
    if v_supply is null or v_qty is null or v_qty <= 0 then continue; end if;

    select coalesce(cost, 0) into v_snap from public.supplies where id = v_supply and org_id = p_org_id;
    if v_snap is null then continue; end if;

    insert into public.production_run_supplies (org_id, user_id, run_id, supply_id, qty, unit_cost_snapshot)
    values (p_org_id, v_user, v_run, v_supply, v_qty, v_snap);

    update public.supplies
      set on_hand = greatest(coalesce(on_hand, 0) - v_qty, 0), updated_at = now()
    where id = v_supply;

    v_materials := v_materials + v_qty * v_snap;
  end loop;

  v_labor := coalesce(p_labor_hours, 0) * coalesce(p_labor_rate, 0);
  v_unit := case when coalesce(p_quantity, 0) > 0 then (v_materials + v_labor) / p_quantity else 0 end;
  update public.production_runs set unit_cost = round(v_unit, 4) where id = v_run;

  return v_run;
end $$;

-- Reverse a run: restore each consumed supply's stock, then delete (cascade).
create or replace function public.delete_production_run(p_run_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare item record;
begin
  for item in select supply_id, qty from public.production_run_supplies where run_id = p_run_id and supply_id is not null loop
    update public.supplies set on_hand = coalesce(on_hand, 0) + item.qty, updated_at = now() where id = item.supply_id;
  end loop;
  delete from public.production_runs where id = p_run_id; -- production_run_supplies cascades
end $$;

revoke all on function public.log_supply_purchase(uuid, numeric, numeric, uuid, date) from public, anon;
revoke all on function public.delete_supply_purchase(uuid) from public, anon;
revoke all on function public.update_supply_purchase(uuid, numeric, numeric, uuid, date) from public, anon;
revoke all on function public.log_production_run(uuid, uuid, text, int, numeric, numeric, text, date, jsonb) from public, anon;
revoke all on function public.delete_production_run(uuid) from public, anon;
grant execute on function public.log_supply_purchase(uuid, numeric, numeric, uuid, date) to authenticated;
grant execute on function public.delete_supply_purchase(uuid) to authenticated;
grant execute on function public.update_supply_purchase(uuid, numeric, numeric, uuid, date) to authenticated;
grant execute on function public.log_production_run(uuid, uuid, text, int, numeric, numeric, text, date, jsonb) to authenticated;
grant execute on function public.delete_production_run(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Rollups switch to production_run_supplies; cash flow stops double-counting
-- supply purchases (they are now logged as expenses — one event, one entry).
-- ---------------------------------------------------------------------------
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
    'net_profit',     ((g.gross_incl - g.refunds) - f.channel_fees) - e.expenses - (c.materials + c.hired_labor)
  )
  from gross g, fees f, exp e, cogs c;
$$;

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
