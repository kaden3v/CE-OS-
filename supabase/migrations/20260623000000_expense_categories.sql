-- ============================================================================
-- Editable per-org expense categories.
--
-- Categories were a hardcoded list in the app (src/lib/scheduleC.ts). They're
-- now editable per org and stored as JSON on finance_settings. Each entry is
-- { "name": "<label>", "scheduleC": "<Schedule C line>" }. NULL means "use the
-- app's built-in defaults", so this column is inert until an org customizes it.
--
-- Why this is safe: every expense already stores its own schedule_c_category at
-- write time, so the Tax Report and historical rows do NOT depend on this list.
-- Editing categories only changes what's selectable going forward; the app
-- re-tags affected rows explicitly when a category is renamed/relined/deleted.
--
-- finance_settings is one row per org with RLS already in place, so no new
-- table, policy, or per-org seeding is needed.
-- ============================================================================

alter table public.finance_settings
  add column if not exists expense_categories jsonb;

comment on column public.finance_settings.expense_categories is
  'Editable expense categories for this org: array of { name, scheduleC }. NULL = use app defaults.';
