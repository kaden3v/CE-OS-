-- ============================================================================
-- Finance data layer — expense + vendor enrichment, Schedule C migration
--
-- expenses: vendor_id + receipt_url already exist (skipped via IF NOT EXISTS);
-- add the remaining tax/bookkeeping columns. vendors: notes + url already exist;
-- add website / address / is_1099. Then backfill schedule_c_category from the
-- free-form category, keeping the original in category_legacy when it doesn't
-- map to a known Schedule C line.
--
-- The CASE below MUST mirror src/lib/scheduleC.ts (EXPENSE_CATEGORY_TO_SCHEDULE_C).
-- ============================================================================

alter table public.expenses
  add column if not exists payment_method      text,
  add column if not exists schedule_c_category text,
  add column if not exists deductible          boolean not null default true,
  add column if not exists source              text not null default 'manual',
  add column if not exists notes               text,
  add column if not exists category_legacy     text;

-- CHECK constraints can't use IF NOT EXISTS; add guarded so re-runs are safe.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_source_check'
  ) then
    alter table public.expenses
      add constraint expenses_source_check
      check (source in ('manual','subscription','supply_purchase','mileage'));
  end if;
end $$;

alter table public.vendors
  add column if not exists website text,
  add column if not exists address text,
  add column if not exists is_1099 boolean not null default false;

-- Backfill Schedule C lines from existing categories (idempotent: only rows not
-- yet classified). Unmapped categories fall back to 'Other expenses' and
-- preserve the original string in category_legacy for later manual review.
update public.expenses e
set
  schedule_c_category = case lower(trim(coalesce(e.category, '')))
    when 'soil and media'       then 'Supplies'
    when 'packaging'            then 'Supplies'
    when 'tools'                then 'Supplies'
    when 'utilities'            then 'Utilities'
    when 'marketing'            then 'Advertising'
    when 'permits and licenses' then 'Taxes and licenses'
    when 'shipping'             then 'Other expenses'
    when 'software'             then 'Other expenses'
    when 'subscription'         then 'Other expenses'
    when 'other'                then 'Other expenses'
    else 'Other expenses'
  end,
  category_legacy = case
    when lower(trim(coalesce(e.category, ''))) in (
      'soil and media','packaging','tools','utilities','marketing',
      'permits and licenses','shipping','software','subscription','other'
    ) then e.category_legacy                       -- maps cleanly → leave legacy as-is
    else coalesce(e.category, e.category_legacy)    -- unmapped → preserve original
  end
where e.schedule_c_category is null;
