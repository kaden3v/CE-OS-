-- ============================================================================
-- Seed wholesale plant vendors (idempotent: skipped if a same-named vendor
-- already exists in the org). user_id resolved from the org owner.
-- ============================================================================
with org_owner as (
  select o.id as org_id,
         coalesce(
           o.created_by,
           (select m.user_id from public.org_memberships m
             where m.org_id = o.id and m.role = 'owner'
             order by m.created_at limit 1)
         ) as user_id
  from public.organizations o
),
seed(name, category) as (
  values
    ('BugBitingPlants', 'Plants/Wholesale'),
    ('Brad''s Greenhouse', 'Plants/Wholesale'),
    ('Runoplants', 'Plants/Wholesale')
)
insert into public.vendors (org_id, user_id, name, category)
select ow.org_id, ow.user_id, s.name, s.category
from org_owner ow
cross join seed s
where ow.user_id is not null
  and not exists (
    select 1 from public.vendors v
    where v.org_id = ow.org_id and lower(trim(v.name)) = lower(trim(s.name))
  );
