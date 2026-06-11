-- Inventory tier overhaul: track plants by sale-readiness instead of bloom state.
--
--   stock_growout  NEW  "Grow-Out"   — too small/young to sell (not for sale)
--   stock_juv      kept "Sale-Ready" — juvenile size, established, sellable
--   stock_mat      kept "Specimen"   — mature/premium, sellable
--   stock_flower   DROPPED           — a flowering plant is a mature plant;
--                                      its counts fold into stock_mat
--
-- consume_inventory_for_order changes with it: orders consume SELLABLE stock
-- only (Specimen first, then Sale-Ready) — Grow-Out plants can never be
-- decremented by a sale.

alter table public.inventory
  add column if not exists stock_growout integer not null default 0;

update public.inventory
   set stock_mat = stock_mat + stock_flower
 where stock_flower > 0;

alter table public.inventory drop column if exists stock_flower;

create or replace function private.consume_inventory_for_order(p_order uuid, p_org uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  it record;
  inv record;
  has_inv boolean;
  remaining int;
  take int;
  v_juv int;
  v_mat int;
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
      continue;
    end if;

    -- Sellable tiers only: Specimen (mature) first, then Sale-Ready (juvenile).
    -- Grow-Out stock is not for sale and is never consumed here.
    remaining := it.qty;
    v_mat := inv.stock_mat;
    v_juv := inv.stock_juv;

    take := least(remaining, v_mat); v_mat := v_mat - take; remaining := remaining - take;
    take := least(remaining, v_juv); v_juv := v_juv - take; remaining := remaining - take;

    update public.inventory
       set stock_mat = v_mat, stock_juv = v_juv
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
end $function$;
