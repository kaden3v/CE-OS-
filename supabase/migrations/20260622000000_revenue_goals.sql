-- ============================================================================
-- Revenue goals & pace tracker
--
-- revenue_goals: per-org revenue targets, one row per period. period_type is
-- 'monthly' (period_start = YYYY-MM-01), 'quarterly' (first of quarter), or
-- 'annual' (YYYY-01-01); target_amount is a NET-revenue target (product sales
-- minus estimated channel fees) — the same basis as the "Net revenue" KPI.
--
-- Manager-gated like every other financial table; org_id is stamped/validated by
-- private.enforce_row_org and updated_at maintained by public.set_updated_at,
-- matching public.finance_settings.
-- ============================================================================

create table if not exists public.revenue_goals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  user_id       uuid not null,
  period_type   text not null check (period_type in ('monthly','quarterly','annual')),
  period_start  date not null,
  target_amount numeric not null default 0 check (target_amount >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, period_type, period_start),
  -- period_start must sit on the period boundary the pace RPC joins against, so a
  -- misaligned goal fails fast at write time instead of silently never matching.
  constraint revenue_goals_period_aligned check (
    (period_type = 'monthly' and period_start = date_trunc('month', period_start)::date)
    or (period_type = 'quarterly' and period_start = date_trunc('quarter', period_start)::date)
    or (period_type = 'annual' and period_start = date_trunc('year', period_start)::date)
  )
);
create index if not exists revenue_goals_org_idx on public.revenue_goals(org_id);
alter table public.revenue_goals enable row level security;

comment on table public.revenue_goals is
  'Per-org net-revenue targets. period_type monthly (period_start = first of month), quarterly (first of quarter), or annual (first of year).';

-- updated_at + enforce_row_org triggers and manager-gated RLS, identical pattern
-- to public.finance_settings.
do $$
begin
  drop trigger if exists revenue_goals_set_updated_at on public.revenue_goals;
  create trigger revenue_goals_set_updated_at before update on public.revenue_goals
    for each row execute function public.set_updated_at();

  drop trigger if exists revenue_goals_enforce_org on public.revenue_goals;
  create trigger revenue_goals_enforce_org before insert or update on public.revenue_goals
    for each row execute function private.enforce_row_org();

  drop policy if exists "revenue_goals org access" on public.revenue_goals;
  create policy "revenue_goals org access" on public.revenue_goals for all to authenticated
    using (org_id in (select private.user_org_ids())
           and private.user_role_in(org_id) in ('owner','manager'))
    with check (org_id in (select private.user_org_ids())
           and private.user_role_in(org_id) in ('owner','manager'));
end $$;

-- ----------------------------------------------------------------------------
-- finance_revenue_vs_goal: trailing 12 months of actual net + gross revenue
-- alongside that month's effective goal. The effective goal is the explicit
-- monthly target if set (and non-zero), else 1/3 of the quarter's target, else
-- 1/12 of the year's target, else null (so the chart line breaks instead of
-- dropping to zero). A target of 0 reads as "unset" and falls through.
--
-- Per-month actuals call public._finance_kpi_window so they reconcile exactly
-- with Overview / Revenue / P&L — one source of truth for the revenue math.
-- ----------------------------------------------------------------------------
create or replace function public.finance_revenue_vs_goal(p_org_id uuid)
returns table(month date, actual_net numeric, actual_gross numeric, goal numeric, goal_is_derived boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', (now() at time zone 'America/Phoenix')::date)::date as cur_month
  ),
  months as (
    select generate_series(b.cur_month - interval '11 months', b.cur_month, interval '1 month')::date as m
    from bounds b
  )
  select
    mo.m as month,
    coalesce((w.win ->> 'net_revenue')::numeric, 0) as actual_net,
    coalesce((w.win ->> 'gross_sales')::numeric, 0) as actual_gross,
    -- Effective monthly goal: explicit monthly target, else 1/3 of the quarter's
    -- target, else 1/12 of the year's target, else null. A 0 reads as "unset".
    coalesce(
      (select nullif(g.target_amount, 0)
         from public.revenue_goals g
        where g.org_id = p_org_id and g.period_type = 'monthly' and g.period_start = mo.m),
      (select nullif(g.target_amount, 0) / 3.0
         from public.revenue_goals g
        where g.org_id = p_org_id and g.period_type = 'quarterly'
          and g.period_start = date_trunc('quarter', mo.m)::date),
      (select nullif(g.target_amount, 0) / 12.0
         from public.revenue_goals g
        where g.org_id = p_org_id and g.period_type = 'annual'
          and g.period_start = date_trunc('year', mo.m)::date)
    ) as goal,
    -- true when this month's goal is a broader target spread evenly (quarterly ÷3
    -- or annual ÷12), not an explicit monthly target. A flat split is a poor
    -- benchmark for a seasonal nursery, so the UI shows derived months
    -- informationally rather than as a hard hit/miss.
    case
      when (select nullif(g.target_amount, 0) from public.revenue_goals g
             where g.org_id = p_org_id and g.period_type = 'monthly' and g.period_start = mo.m) is not null then false
      when (select nullif(g.target_amount, 0) from public.revenue_goals g
             where g.org_id = p_org_id and g.period_type = 'quarterly'
               and g.period_start = date_trunc('quarter', mo.m)::date) is not null then true
      when (select nullif(g.target_amount, 0) from public.revenue_goals g
             where g.org_id = p_org_id and g.period_type = 'annual'
               and g.period_start = date_trunc('year', mo.m)::date) is not null then true
      else null
    end as goal_is_derived
  from months mo
  cross join lateral (
    -- Closed months use the whole calendar month; the current (last) month is
    -- capped at today+1 so its actual_net is month-to-date — identical to the
    -- finance_kpis 'current' window the pace tiles use, not merely coincident.
    select public._finance_kpi_window(
      p_org_id,
      mo.m,
      least((mo.m + interval '1 month')::date, ((now() at time zone 'America/Phoenix')::date + 1))
    ) as win
  ) w
  order by mo.m;
$$;

revoke all on function public.finance_revenue_vs_goal(uuid) from public, anon;
grant execute on function public.finance_revenue_vs_goal(uuid) to authenticated;
