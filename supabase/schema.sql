-- CEOS — Canyon Exotics OS
-- Run this once in Supabase SQL editor (Project → SQL → New query → paste → run).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.

-- ============================================================
-- Helpers
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

-- ============================================================
-- profiles
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles self select" on public.profiles;
drop policy if exists "profiles self upsert" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;

create policy "profiles self select" on public.profiles for select using (auth.uid() = id);
create policy "profiles self upsert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Admin allowlist + auto-create profile (with is_admin from allowlist) on signup
create table if not exists public.admin_emails (
  email text primary key,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users(id) on delete set null
);
alter table public.admin_emails enable row level security;
drop policy if exists "admin_emails admin select" on public.admin_emails;
drop policy if exists "admin_emails admin insert" on public.admin_emails;
drop policy if exists "admin_emails admin delete" on public.admin_emails;
create policy "admin_emails admin select" on public.admin_emails for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);
create policy "admin_emails admin insert" on public.admin_emails for insert with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);
create policy "admin_emails admin delete" on public.admin_emails for delete using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
);

-- Bootstrap: seed your admin email here. Update before first run.
insert into public.admin_emails (email) values ('kaden3v@gmail.com')
  on conflict (email) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_admin boolean;
begin
  v_is_admin := exists (select 1 from public.admin_emails a where a.email = new.email);
  insert into public.profiles (id, is_admin)
  values (new.id, coalesce(v_is_admin, false))
  on conflict (id) do update set is_admin = excluded.is_admin;
  return new;
end$$;
revoke execute on function public.handle_new_user() from anon, authenticated, public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- access_requests: people asking to be invited
-- ============================================================
create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  message text,
  status text not null default 'pending'
    check (status in ('pending','approved','denied')),
  denial_reason text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);
create index if not exists access_requests_status_idx on public.access_requests(status, requested_at desc);
create index if not exists access_requests_email_idx on public.access_requests(lower(email));
alter table public.access_requests enable row level security;
drop policy if exists "access_requests anon insert" on public.access_requests;
drop policy if exists "access_requests admin select" on public.access_requests;
drop policy if exists "access_requests admin update" on public.access_requests;

-- Anyone (incl. unauthenticated) can submit. Force defaults so no one
-- can self-approve via INSERT.
create policy "access_requests anon insert" on public.access_requests
  for insert with check (
    coalesce(status, 'pending') = 'pending'
    and decided_at is null
    and decided_by is null
    and denial_reason is null
  );
create policy "access_requests admin select" on public.access_requests
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );
create policy "access_requests admin update" on public.access_requests
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

grant insert on public.access_requests to anon;
grant select, update on public.access_requests to authenticated;

-- ============================================================
-- inventory
-- ============================================================
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  common text,
  genus text,
  stock_juv integer not null default 0,
  stock_mat integer not null default 0,
  stock_flower integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists inventory_user_id_idx on public.inventory(user_id);

alter table public.inventory enable row level security;

drop policy if exists "inventory owner all" on public.inventory;
create policy "inventory owner all" on public.inventory
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists inventory_set_updated_at on public.inventory;
create trigger inventory_set_updated_at before update on public.inventory
  for each row execute function public.set_updated_at();

-- ============================================================
-- propagation_batches
-- ============================================================
create table if not exists public.propagation_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id text not null,
  cultivar text not null,
  count integer not null default 0,
  stage text not null default 'division',
  started text,
  est_ready text,
  notes text,
  updated_at timestamptz not null default now()
);
create index if not exists propagation_user_id_idx on public.propagation_batches(user_id);

alter table public.propagation_batches enable row level security;

drop policy if exists "propagation owner all" on public.propagation_batches;
create policy "propagation owner all" on public.propagation_batches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists propagation_set_updated_at on public.propagation_batches;
create trigger propagation_set_updated_at before update on public.propagation_batches
  for each row execute function public.set_updated_at();

-- ============================================================
-- cultivars
-- ============================================================
create table if not exists public.cultivars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  common text,
  genus text,
  origin text,
  updated_at timestamptz not null default now()
);
create index if not exists cultivars_user_id_idx on public.cultivars(user_id);

alter table public.cultivars enable row level security;

drop policy if exists "cultivars owner all" on public.cultivars;
create policy "cultivars owner all" on public.cultivars
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists cultivars_set_updated_at on public.cultivars;
create trigger cultivars_set_updated_at before update on public.cultivars
  for each row execute function public.set_updated_at();

-- ============================================================
-- tasks
-- ============================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  due text,
  type text,
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists tasks_user_id_idx on public.tasks(user_id);

alter table public.tasks enable row level security;

drop policy if exists "tasks owner all" on public.tasks;
create policy "tasks owner all" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
