-- ============================================================================
-- P1 — Connect the workflows (orders ⇄ shipments ⇄ inventory)
--
--   1. Inventory consumption: the FIRST transition of an order into
--      shipped/delivered decrements stock for each line item (mature first,
--      then flowering, then juvenile — the saleable stages go first). Stock
--      never goes negative; any shortfall is recorded in the activity log so
--      the team sees count drift instead of silently hiding it.
--   2. Status sync: order → shipments and shipment → order converge (guarded
--      updates make the recursion a no-op on the second pass).
--
-- Implemented as DB triggers so the pipeline holds no matter which client
-- writes (app UI, CSV import, future Shopify/Etsy webhooks). Functions are
-- SECURITY DEFINER; the postgres owner bypasses RLS for the cross-table
-- updates, and auth.uid() still identifies the human actor for audit rows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Inventory consumption
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
  v_juv int;
  v_mat int;
  v_flower int;
begin
  for it in select * from public.order_items where order_id = p_order loop
    has_inv := false;
    if it.inventory_id is not null then
      select * into inv from public.inventory where id = it.inventory_id;
      has_inv := found;
    end if;
    if not has_inv and it.cultivar_id is not null then
      select * into inv from public.inventory
        where cultivar_id = it.cultivar_id and org_id = p_org
        order by updated_at desc limit 1;
      has_inv := found;
    end if;
    if not has_inv then
      continue;  -- nothing tracked for this item; nothing to consume
    end if;

    remaining := it.qty;
    v_mat := inv.stock_mat;
    v_flower := inv.stock_flower;
    v_juv := inv.stock_juv;

    take := least(remaining, v_mat);    v_mat := v_mat - take;       remaining := remaining - take;
    take := least(remaining, v_flower); v_flower := v_flower - take; remaining := remaining - take;
    take := least(remaining, v_juv);    v_juv := v_juv - take;       remaining := remaining - take;

    update public.inventory
       set stock_mat = v_mat, stock_flower = v_flower, stock_juv = v_juv
     where id = inv.id;

    insert into public.activity_log (org_id, actor_id, action, entity, entity_id, summary)
    values (
      p_org, auth.uid(), 'updated', 'inventory', inv.id::text,
      format('%s: stock −%s (order shipped)%s', inv.name, it.qty - remaining,
             case when remaining > 0
                  then format(' — %s short; counts may need correcting', remaining)
                  else '' end)
    );
  end loop;
end $$;

create or replace function private.on_order_status_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  -- Consume stock exactly once: on the first entry into shipped/delivered.
  if new.status in ('shipped', 'delivered')
     and old.status not in ('shipped', 'delivered') then
    perform private.consume_inventory_for_order(new.id, new.org_id);
  end if;

  -- Pull this order's shipments along (guarded → recursion converges).
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

  return new;
end $$;

drop trigger if exists orders_status_sync on public.orders;
create trigger orders_status_sync
  after update on public.orders
  for each row execute function private.on_order_status_change();

-- ---------------------------------------------------------------------------
-- 2. Shipment → order sync
-- ---------------------------------------------------------------------------
create or replace function private.on_shipment_status_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'shipped' then
    update public.orders
       set status = 'shipped'
     where id = new.order_id
       and status not in ('shipped', 'delivered', 'cancelled', 'refunded');
  elsif new.status = 'delivered' then
    update public.orders
       set status = 'delivered'
     where id = new.order_id
       and status not in ('delivered', 'cancelled', 'refunded');
  end if;

  return new;
end $$;

drop trigger if exists shipments_status_sync on public.shipments;
create trigger shipments_status_sync
  after update on public.shipments
  for each row execute function private.on_shipment_status_change();
