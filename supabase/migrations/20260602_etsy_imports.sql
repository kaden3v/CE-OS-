-- Etsy CSV import staging table.
-- Stores every parsed CSV row verbatim (raw jsonb) so imports are auditable and
-- idempotent. Projection into orders/order_items/expenses happens from here.
-- Dedup is enforced per (user_id, csv_type, etsy_key) so re-importing the same
-- file — or an overlapping date range — never double-counts.

create table if not exists public.etsy_imports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  import_batch_id   uuid not null,                 -- groups one upload session
  source_file       text not null,                 -- original filename
  csv_type          text not null
                      check (csv_type in ('sold_orders', 'order_items', 'payments')),
  etsy_key          text not null,                 -- stable per-row dedup key
  row_type          text,                          -- Sale / Fee / Refund / Order / Item …
  order_external_id text,                           -- Etsy Order ID, for reconciliation
  occurred_on       date,
  amount            numeric(12, 2),
  raw               jsonb not null,                -- the entire CSV row, verbatim
  created_at        timestamptz not null default now(),
  unique (user_id, csv_type, etsy_key)
);

alter table public.etsy_imports enable row level security;

drop policy if exists "etsy_imports owner" on public.etsy_imports;
create policy "etsy_imports owner" on public.etsy_imports
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists etsy_imports_user_order_idx
  on public.etsy_imports (user_id, order_external_id);
