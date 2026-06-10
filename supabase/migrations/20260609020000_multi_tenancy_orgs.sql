-- ============================================================================
-- Phase 1 — Multi-tenancy (organizations + memberships)
--
-- Turns CE-OS from "every user owns a private world" into "a team shares one
-- organization's data".
--
-- Security model (hardened after adversarial review):
--   * The org_id boundary is enforced by RLS *and* a BEFORE INSERT/UPDATE
--     trigger that stamps/validates org_id — the client is never trusted to set
--     it. Legacy `auth.uid() = user_id` policies are DROPPED (not OR'd in) to
--     remove cross-tenant write paths.
--   * The currently-deployed (user_id-based) frontend keeps working: the trigger
--     defaults a NULL org_id to the caller's org, so its inserts land correctly,
--     and its user_id-filtered reads are a strict subset of the org's rows.
--   * Role gating is DB-enforced: financial tables are restricted to
--     owners/managers; membership changes can't escalate to/strip owners; a
--     trigger guarantees every org keeps at least one owner.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Core tables
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.organizations enable row level security;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table if not exists public.org_memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'staff' check (role in ('owner','manager','staff')),
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
alter table public.org_memberships enable row level security;
create index if not exists org_memberships_user_idx on public.org_memberships(user_id);
create index if not exists org_memberships_org_idx  on public.org_memberships(org_id);

-- ---------------------------------------------------------------------------
-- 2. Membership helpers — kept in a NON-EXPOSED `private` schema so PostgREST
--    never publishes them as RPCs (the sanctioned fix for the SECURITY DEFINER
--    advisor) and so RLS policies can call them without recursing on
--    org_memberships' own policies.
-- ---------------------------------------------------------------------------
create schema if not exists private;

create or replace function private.user_org_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select org_id from public.org_memberships where user_id = auth.uid()
$$;
revoke all on function private.user_org_ids() from public, anon;
grant execute on function private.user_org_ids() to authenticated;

create or replace function private.user_role_in(p_org uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.org_memberships
  where user_id = auth.uid() and org_id = p_org
  limit 1
$$;
revoke all on function private.user_role_in(uuid) from public, anon;
grant execute on function private.user_role_in(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Add a nullable org_id (+ index) to every data table.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  data_tables text[] := array[
    'cultivars','customers','etsy_imports','expenses','inventory','licenses',
    'listings','mortality_events','order_items','orders','plant_photos',
    'print_jobs','propagation_batches','qr_codes','shipments','subscriptions',
    'supplies','tasks','vendors'
  ];
begin
  foreach t in array data_tables loop
    execute format(
      'alter table public.%I add column if not exists org_id uuid references public.organizations(id) on delete cascade',
      t);
    execute format(
      'create index if not exists %I on public.%I(org_id)',
      t || '_org_idx', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Backfill — one organization for the business; every existing user is a
--    member; all existing rows are assigned to it.
--
--    The principal (owner) is chosen data-drivenly: the user owning the most
--    expense rows, then any admin, then any profile. No IDs are hardcoded.
-- ---------------------------------------------------------------------------
do $$
declare
  v_org   uuid;
  v_owner uuid;
  t       text;
  data_tables text[] := array[
    'cultivars','customers','etsy_imports','expenses','inventory','licenses',
    'listings','mortality_events','order_items','orders','plant_photos',
    'print_jobs','propagation_batches','qr_codes','shipments','subscriptions',
    'supplies','tasks','vendors'
  ];
begin
  select user_id into v_owner
    from public.expenses group by user_id order by count(*) desc limit 1;
  if v_owner is null then
    select id into v_owner from public.profiles where is_admin order by updated_at limit 1;
  end if;
  if v_owner is null then
    select id into v_owner from public.profiles order by updated_at limit 1;
  end if;
  if v_owner is null then
    return;  -- fresh DB, no users yet → nothing to backfill
  end if;

  -- Idempotency guard: don't create a second org on re-run.
  select id into v_org from public.organizations order by created_at limit 1;
  if v_org is null then
    insert into public.organizations (name, created_by)
      values ('Canyon Exotics', v_owner)
      returning id into v_org;
  end if;

  insert into public.org_memberships (org_id, user_id, role)
    values (v_org, v_owner, 'owner')
    on conflict (org_id, user_id) do nothing;

  insert into public.org_memberships (org_id, user_id, role)
    select v_org, p.id, 'staff' from public.profiles p where p.id <> v_owner
    on conflict (org_id, user_id) do nothing;

  foreach t in array data_tables loop
    execute format('update public.%I set org_id = $1 where org_id is null', t)
      using v_org;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Write-boundary trigger — stamp + validate org_id on every data table.
--    Runs BEFORE the RLS WITH CHECK, so the row's org_id is always one the
--    caller belongs to regardless of what the client submitted. Service-role /
--    migration contexts (no JWT → auth.uid() IS NULL) are trusted and bypass.
-- ---------------------------------------------------------------------------
create or replace function private.enforce_row_org()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    return new;  -- trusted server-side context (service role / migration)
  end if;

  if tg_op = 'INSERT' then
    if new.org_id is null then
      select org_id into v_org from public.org_memberships
        where user_id = auth.uid() order by created_at limit 1;
      new.org_id := v_org;
    end if;
    if new.org_id is null
       or not exists (select 1 from public.org_memberships
                      where user_id = auth.uid() and org_id = new.org_id) then
      raise exception 'org_id must reference one of your organizations';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id
       and (new.org_id is null
            or not exists (select 1 from public.org_memberships
                           where user_id = auth.uid() and org_id = new.org_id)) then
      raise exception 'cannot move a row to an organization you do not belong to';
    end if;
    return new;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 6. RLS — org-scoped policies replace the legacy owner policies. Financial
--    tables additionally require an owner/manager role.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  pol record;
  generic_tables text[] := array[
    'cultivars','customers','etsy_imports','inventory','listings',
    'mortality_events','order_items','orders','plant_photos','print_jobs',
    'propagation_batches','qr_codes','shipments','subscriptions','tasks'
  ];
  manager_tables text[] := array['expenses','supplies','vendors','licenses'];
  all_tables text[] := array[
    'cultivars','customers','etsy_imports','expenses','inventory','licenses',
    'listings','mortality_events','order_items','orders','plant_photos',
    'print_jobs','propagation_batches','qr_codes','shipments','subscriptions',
    'supplies','tasks','vendors'
  ];
begin
  -- Ensure RLS is on, then drop EVERY existing policy on each data table so we
  -- start from a clean slate. Drop-by-derived-name would be unsafe: some legacy
  -- policies use non-conventional names ('mortality owner all', 'etsy_imports
  -- owner', 'propagation owner all'), so a name-guess drop silently no-ops and
  -- leaves a loose auth.uid()=user_id policy OR'd into the new org policy.
  foreach t in array all_tables loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public' and tablename = any(all_tables)
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;

  -- Write-boundary trigger on every data table.
  foreach t in array all_tables loop
    execute format('drop trigger if exists %I on public.%I', t || '_enforce_org', t);
    execute format(
      'create trigger %I before insert or update on public.%I '
      'for each row execute function private.enforce_row_org()',
      t || '_enforce_org', t);
  end loop;

  -- Generic tables: any org member has full access to the org's rows.
  foreach t in array generic_tables loop
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (org_id in (select private.user_org_ids())) '
      'with check (org_id in (select private.user_org_ids()))',
      t || ' org access', t);
  end loop;

  -- Financial tables: restricted to owners/managers (DB-enforced, not just UI).
  foreach t in array manager_tables loop
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (org_id in (select private.user_org_ids()) '
      '       and private.user_role_in(org_id) in (''owner'',''manager'')) '
      'with check (org_id in (select private.user_org_ids()) '
      '       and private.user_role_in(org_id) in (''owner'',''manager''))',
      t || ' org access', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Policies for the new tables + co-member profile visibility.
-- ---------------------------------------------------------------------------
drop policy if exists "organizations member read" on public.organizations;
create policy "organizations member read" on public.organizations
  for select to authenticated
  using (id in (select private.user_org_ids()));

drop policy if exists "organizations owner update" on public.organizations;
create policy "organizations owner update" on public.organizations
  for update to authenticated
  using (private.user_role_in(id) = 'owner')
  with check (private.user_role_in(id) = 'owner');

drop policy if exists "memberships member read" on public.org_memberships;
create policy "memberships member read" on public.org_memberships
  for select to authenticated
  using (org_id in (select private.user_org_ids()));

-- Owners may manage any membership; managers may only touch non-owner rows and
-- may never grant/become 'owner' (prevents self-escalation + owner seizure).
drop policy if exists "memberships manage insert" on public.org_memberships;
create policy "memberships manage insert" on public.org_memberships
  for insert to authenticated
  with check (
    private.user_role_in(org_id) = 'owner'
    or (private.user_role_in(org_id) = 'manager' and role <> 'owner')
  );

drop policy if exists "memberships manage update" on public.org_memberships;
create policy "memberships manage update" on public.org_memberships
  for update to authenticated
  using (
    private.user_role_in(org_id) = 'owner'
    or (private.user_role_in(org_id) = 'manager' and role <> 'owner')
  )
  with check (
    private.user_role_in(org_id) = 'owner'
    or (private.user_role_in(org_id) = 'manager' and role <> 'owner')
  );

drop policy if exists "memberships manage delete" on public.org_memberships;
create policy "memberships manage delete" on public.org_memberships
  for delete to authenticated
  using (
    private.user_role_in(org_id) = 'owner'
    or (private.user_role_in(org_id) = 'manager' and role <> 'owner')
  );

-- Guarantee every organization always keeps at least one owner.
create or replace function private.enforce_last_owner()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_remaining int;
begin
  -- Trusted server-side context (service role / cascade from auth.users delete)
  -- bypasses; this guard only protects against interactive self-orphaning.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      select count(*) into v_remaining from public.org_memberships
        where org_id = old.org_id and role = 'owner' and id <> old.id;
      if v_remaining = 0 then
        raise exception 'Cannot remove the last owner of an organization';
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'owner' and new.role <> 'owner' then
      select count(*) into v_remaining from public.org_memberships
        where org_id = old.org_id and role = 'owner' and id <> old.id;
      if v_remaining = 0 then
        raise exception 'Cannot demote the last owner of an organization';
      end if;
    end if;
    return new;
  end if;

  return new;
end $$;

drop trigger if exists org_memberships_last_owner on public.org_memberships;
create trigger org_memberships_last_owner
  before update or delete on public.org_memberships
  for each row execute function private.enforce_last_owner();

-- Let teammates see each other's display names on the Team page (OR'd with the
-- existing "profiles self select" policy).
drop policy if exists "profiles co-member read" on public.profiles;
create policy "profiles co-member read" on public.profiles
  for select to authenticated
  using (
    id in (
      select user_id from public.org_memberships
      where org_id in (select private.user_org_ids())
    )
  );
