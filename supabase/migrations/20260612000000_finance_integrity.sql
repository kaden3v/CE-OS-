-- ============================================================================
-- Finance integrity — no orphaned/lost history when linked entities are deleted.
--
-- Decision (per the audit):
--  * Expenses keep a denormalized vendor_name. Deleting a vendor nulls the FK
--    (ON DELETE SET NULL) but the name on each historical expense is preserved.
--    A trigger keeps vendor_name in sync on insert/update of vendor_id.
--  * Supply purchases BLOCK supply deletion (ON DELETE RESTRICT) so a supply's
--    cost-basis history can't be silently destroyed.
--
-- Money math note: authoritative amounts live in Postgres `numeric` (exact
-- decimal, not float). The client mirror (src/lib/finance.ts) rounds at the
-- display boundary — see roundMoney/roundCost.
-- ============================================================================

alter table public.expenses add column if not exists vendor_name text;

update public.expenses e
set vendor_name = v.name
from public.vendors v
where e.vendor_id = v.id and e.vendor_name is null;

create or replace function private.expense_set_vendor_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vendor_id is not null then
    select name into new.vendor_name from public.vendors where id = new.vendor_id;
  end if;
  return new;
end $$;

drop trigger if exists expenses_vendor_name on public.expenses;
create trigger expenses_vendor_name
  before insert or update of vendor_id on public.expenses
  for each row execute function private.expense_set_vendor_name();

alter table public.expenses drop constraint if exists expenses_vendor_id_fkey;
alter table public.expenses
  add constraint expenses_vendor_id_fkey
  foreign key (vendor_id) references public.vendors(id) on delete set null;

alter table public.supply_purchases drop constraint if exists supply_purchases_supply_id_fkey;
alter table public.supply_purchases
  add constraint supply_purchases_supply_id_fkey
  foreign key (supply_id) references public.supplies(id) on delete restrict;
