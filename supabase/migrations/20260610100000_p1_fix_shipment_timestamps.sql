-- P1 fix — stamp shipped_at/delivered_at on the shipment row itself.
--
-- Caught by the post-apply end-to-end test: shipping from the SHIPMENT side
-- left the originating row's shipped_at null (the order-side sync only stamps
-- sibling shipments still in pending/ready/held). A BEFORE trigger stamps the
-- row's own timestamps no matter which client or trigger path set the status.

create or replace function private.stamp_shipment_times()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'shipped' and old.status is distinct from 'shipped' then
    new.shipped_at := coalesce(new.shipped_at, now());
  elsif new.status = 'delivered' and old.status is distinct from 'delivered' then
    new.shipped_at := coalesce(new.shipped_at, now());
    new.delivered_at := coalesce(new.delivered_at, now());
  end if;
  return new;
end $$;

drop trigger if exists shipments_stamp_times on public.shipments;
create trigger shipments_stamp_times
  before update on public.shipments
  for each row execute function private.stamp_shipment_times();
