-- ============================================================================
-- Inventory: make a sale actually change the count — simply and correctly.
--
-- Audit (docs/INVENTORY_AUDIT.md) found 227 real sales produced 0 stock
-- decrements: imported order items were never linked to a plant, the trigger
-- only fired on UPDATE, refunds never restored stock, and a status round-trip
-- could double-subtract. This migration fixes the data-layer half.
--
-- Model (owner decision): TWO sellable-state tiers.
--   stock_growout  Grow-Out   — not for sale
--   stock_juv      Sale-Ready — the ONE sellable tier
--   stock_mat      DROPPED    — "Specimen" was unused (all stock lived here);
--                              its units fold into Sale-Ready.
--
-- Decrement: consume Sale-Ready only, at ship time, EXACTLY ONCE per order
-- (idempotency marker orders.inventory_consumed_at), firing on BOTH
-- insert-as-shipped and update-into-shipped. Auto-restored on cancel/refund.
-- Records COGS per item from inventory.cost_basis. Unmatched sales are logged
-- loudly instead of skipped silently. NO historical backfill — current counts
-- are the owner's truth; decrements take effect going forward.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema: fold Specimen into Sale-Ready, add cost basis + capture columns.
-- ---------------------------------------------------------------------------
alter table public.inventory  add column if not exists cost_basis numeric(10,2) not null default 0;
alter table public.orders     add column if not exists inventory_consumed_at timestamptz;
alter table public.order_items add column if not exists cogs numeric(10,2);
alter table public.order_items add column if not exists consumed_qty integer;

-- Re-run-safe fold: only while stock_mat still exists.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory' and column_name = 'stock_mat'
  ) then
    update public.inventory set stock_juv = stock_juv + stock_mat where stock_mat <> 0;
    alter table public.inventory drop column stock_mat;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Integrity guards.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_stock_nonneg') then
    alter table public.inventory
      add constraint inventory_stock_nonneg check (stock_growout >= 0 and stock_juv >= 0);
  end if;
end $$;

-- One inventory row per cultivar per org → the cultivar-match decrement is deterministic.
create unique index if not exists inventory_org_cultivar_uniq
  on public.inventory (org_id, cultivar_id) where cultivar_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Consume Sale-Ready on sale — idempotent, COGS-aware, loud on shortfall.
-- ---------------------------------------------------------------------------
create or replace function private.consume_inventory_for_order(p_order uuid, p_org uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  it record;
  inv record;
  has_inv boolean;
  remaining int;
  take int;
  unmatched int := 0;
begin
  -- Exactly once per order, across insert + update + status round-trips.
  if (select inventory_consumed_at from public.orders where id = p_order) is not null then
    return;
  end if;

  for it in select * from public.order_items where order_id = p_order loop
    has_inv := false;
    if it.inventory_id is not null then
      select * into inv from public.inventory where id = it.inventory_id;
      has_inv := found;
    end if;
    if not has_inv and it.cultivar_id is not null then
      select * into inv from public.inventory
        where cultivar_id = it.cultivar_id and org_id = p_org limit 1;
      has_inv := found;
    end if;
    if not has_inv then
      unmatched := unmatched + 1;
      continue;  -- recorded loudly after the loop
    end if;

    -- Sale-Ready only. Grow-Out is never sold.
    remaining := it.qty;
    take := least(remaining, inv.stock_juv);
    remaining := remaining - take;

    update public.inventory set stock_juv = stock_juv - take where id = inv.id;
    update public.order_items
       set consumed_qty = take, cogs = round(take * inv.cost_basis, 2)
     where id = it.id;

    insert into public.activity_log (org_id, actor_id, action, entity, entity_id, summary)
    values (
      p_org, auth.uid(), 'updated', 'inventory', inv.id::text,
      format('%s: stock −%s (sold)%s', inv.name, take,
             case when remaining > 0
                  then format(' — %s OVERSOLD, check counts', remaining)
                  else '' end)
    );
  end loop;

  update public.orders set inventory_consumed_at = now() where id = p_order;

  if unmatched > 0 then
    insert into public.activity_log (org_id, actor_id, action, entity, entity_id, summary)
    values (
      p_org, auth.uid(), 'updated', 'orders', p_order::text,
      format('%s sold item(s) not linked to a plant — stock unchanged; link to track', unmatched)
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Restore Sale-Ready on cancel/refund — exact reversal of what was consumed.
-- ---------------------------------------------------------------------------
create or replace function private.restore_inventory_for_order(p_order uuid, p_org uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  it record;
  inv record;
  has_inv boolean;
begin
  if (select inventory_consumed_at from public.orders where id = p_order) is null then
    return;  -- nothing was ever consumed
  end if;

  for it in select * from public.order_items where order_id = p_order loop
    if coalesce(it.consumed_qty, 0) = 0 then
      continue;
    end if;
    has_inv := false;
    if it.inventory_id is not null then
      select * into inv from public.inventory where id = it.inventory_id;
      has_inv := found;
    end if;
    if not has_inv and it.cultivar_id is not null then
      select * into inv from public.inventory
        where cultivar_id = it.cultivar_id and org_id = p_org limit 1;
      has_inv := found;
    end if;
    if not has_inv then
      continue;
    end if;

    update public.inventory set stock_juv = stock_juv + it.consumed_qty where id = inv.id;
    update public.order_items set consumed_qty = null, cogs = null where id = it.id;

    insert into public.activity_log (org_id, actor_id, action, entity, entity_id, summary)
    values (
      p_org, auth.uid(), 'updated', 'inventory', inv.id::text,
      format('%s: stock +%s (order returned)', inv.name, it.consumed_qty)
    );
  end loop;

  update public.orders set inventory_consumed_at = null where id = p_order;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Status trigger: consume on ship (insert OR update), restore on cancel/refund.
-- ---------------------------------------------------------------------------
create or replace function private.on_order_status_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return new;
  end if;

  -- Consume on first entry into shipped/delivered — INSERT-at-shipped or the
  -- normal pending→shipped UPDATE. The marker inside makes it once-only.
  if new.status in ('shipped', 'delivered')
     and (tg_op = 'INSERT' or old.status not in ('shipped', 'delivered')) then
    perform private.consume_inventory_for_order(new.id, new.org_id);
  end if;

  -- Restore when an order is cancelled/refunded after having consumed stock.
  if tg_op = 'UPDATE'
     and new.status in ('cancelled', 'refunded')
     and old.status not in ('cancelled', 'refunded') then
    perform private.restore_inventory_for_order(new.id, new.org_id);
  end if;

  -- Pull this order's shipments along (UPDATE only — on INSERT none exist yet).
  if tg_op = 'UPDATE' then
    if new.status = 'shipped' then
      update public.shipments
         set status = 'shipped', shipped_at = coalesce(shipped_at, now())
       where order_id = new.id and status in ('pending', 'ready', 'held');
    elsif new.status = 'delivered' then
      update public.shipments
         set status = 'delivered',
             shipped_at = coalesce(shipped_at, now()),
             delivered_at = coalesce(delivered_at, now())
       where order_id = new.id and status in ('pending', 'ready', 'held', 'shipped');
    end if;
  end if;

  return new;
end $$;

drop trigger if exists orders_status_sync on public.orders;
create trigger orders_status_sync
  after insert or update on public.orders
  for each row execute function private.on_order_status_change();
