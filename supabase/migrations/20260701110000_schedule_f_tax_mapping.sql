-- ============================================================================
-- Schedule F tax mapping (with Schedule C swap).
--
-- A plant nursery files Schedule F (Form 1040, Profit or Loss From Farming),
-- so F becomes the org's default reporting schedule; the existing Schedule C
-- mapping stays fully intact and swappable (owner decision 2026-07-01).
--
-- Mirrors the Schedule C design exactly:
--   * expenses.schedule_f_category — snapshotted at write time (same contract
--     as schedule_c_category: reports never depend on the mutable category
--     list). Backfilled below from the category vocabulary — the CASE mirrors
--     EXPENSE_CATEGORY_TO_SCHEDULE_F in src/lib/scheduleF.ts; keep in sync.
--   * finance_settings.tax_schedule — 'F' (default) or 'C'; the report/PnL UI
--     reads it to pick which breakdown to show.
--   * finance_pnl returns BOTH 'schedule_c' and 'schedule_f' groupings, so the
--     swap is a client-side pick and the deployed frontend (which reads only
--     schedule_c) keeps working during rollout. Function body is based on the
--     LIVE prod definition (includes the pnl loopvar hotfix), not repo history.
-- ============================================================================

alter table public.expenses
  add column if not exists schedule_f_category text;

comment on column public.expenses.schedule_f_category is
  'Schedule F (farm) line this expense rolls into, snapshotted at write time. Mirrors schedule_c_category; NULL = uncategorized.';

-- Backfill from the category vocabulary. Schedule F has no advertising or
-- commissions line (→ Other expenses); postage is Freight and trucking;
-- permits/licenses are Taxes. Unknown-but-present categories fall back to
-- Other expenses, matching mapToScheduleF's fallback. NULL categories stay
-- NULL (uncategorized — surfaced by finance_alerts for review).
update public.expenses
   set schedule_f_category = case lower(trim(category))
     when 'soil and media'            then 'Supplies'
     when 'packaging'                 then 'Supplies'
     when 'tools'                     then 'Supplies'
     when 'utilities'                 then 'Utilities'
     when 'marketing'                 then 'Other expenses'
     when 'marketplace fees'          then 'Other expenses'
     when 'etsy fees (uncategorized)' then 'Other expenses'
     when 'permits and licenses'      then 'Taxes'
     when 'shipping'                  then 'Freight and trucking'
     when 'software'                  then 'Other expenses'
     when 'subscription'              then 'Other expenses'
     when 'fertilizer'                then 'Fertilizers and lime'
     when 'chemicals'                 then 'Chemicals'
     when 'plants'                    then 'Seeds and plants'
     when 'seeds and plants'          then 'Seeds and plants'
     else 'Other expenses'
   end
 where category is not null
   and schedule_f_category is null;

alter table public.finance_settings
  add column if not exists tax_schedule text not null default 'F'
  check (tax_schedule in ('F', 'C'));

comment on column public.finance_settings.tax_schedule is
  'Which IRS schedule the tax report and P&L breakdown use: F (farm, default) or C (business).';

-- finance_pnl v3: identical to the live v2 (loopvar hotfix) plus a schedule_f
-- grouping computed the same way as schedule_c. Both are always returned.
create or replace function public.finance_pnl(p_org_id uuid, p_year integer)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  mo int; v_ms date; v_me date;
  months jsonb := '[]'::jsonb;
  sched_c jsonb;
  sched_f jsonb;
begin
  for mo in 1..12 loop
    v_ms := make_date(p_year, mo, 1);
    v_me := (v_ms + interval '1 month')::date;
    months := months || jsonb_build_array(
      jsonb_set(public._finance_kpi_window(p_org_id, v_ms, v_me), '{month}', to_jsonb(to_char(v_ms, 'Mon')))
    );
  end loop;

  with cats as (
    select distinct coalesce(schedule_c_category, 'Uncategorized') as cat
    from public.expenses where org_id = p_org_id and extract(year from occurred_on) = p_year
  ),
  grid as (
    select c.cat, gs.m,
      (select coalesce(sum(amount), 0) from public.expenses e
        where e.org_id = p_org_id and coalesce(e.schedule_c_category, 'Uncategorized') = c.cat
          and extract(year from e.occurred_on) = p_year and extract(month from e.occurred_on) = gs.m) as amt
    from cats c cross join generate_series(1, 12) gs(m)
  )
  select coalesce(jsonb_agg(jsonb_build_object('category', cat, 'months', months_arr, 'total', total) order by total desc), '[]'::jsonb)
  into sched_c
  from (select cat, jsonb_agg(amt order by m) as months_arr, sum(amt) as total from grid group by cat) x;

  with cats as (
    select distinct coalesce(schedule_f_category, 'Uncategorized') as cat
    from public.expenses where org_id = p_org_id and extract(year from occurred_on) = p_year
  ),
  grid as (
    select c.cat, gs.m,
      (select coalesce(sum(amount), 0) from public.expenses e
        where e.org_id = p_org_id and coalesce(e.schedule_f_category, 'Uncategorized') = c.cat
          and extract(year from e.occurred_on) = p_year and extract(month from e.occurred_on) = gs.m) as amt
    from cats c cross join generate_series(1, 12) gs(m)
  )
  select coalesce(jsonb_agg(jsonb_build_object('category', cat, 'months', months_arr, 'total', total) order by total desc), '[]'::jsonb)
  into sched_f
  from (select cat, jsonb_agg(amt order by m) as months_arr, sum(amt) as total from grid group by cat) x;

  return jsonb_build_object(
    'year', p_year,
    'months', months,
    'total', public._finance_kpi_window(p_org_id, make_date(p_year, 1, 1), make_date(p_year + 1, 1, 1)),
    'schedule_c', sched_c,
    'schedule_f', sched_f
  );
end $function$;
