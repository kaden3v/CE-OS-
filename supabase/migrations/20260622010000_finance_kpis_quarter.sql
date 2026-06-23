-- ============================================================================
-- finance_kpis: add a 'quarter' period (current calendar quarter vs the prior
-- full quarter), so the Revenue Goals tab can pace quarterly targets through the
-- same canonical _finance_kpi_window as month / ytd. Body is otherwise identical
-- to 20260611240000; create-or-replace preserves the existing grants.
-- ============================================================================

create or replace function public.finance_kpis(
  p_org_id uuid, p_period text default 'month'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_today      date := (now() at time zone 'America/Phoenix')::date;
  v_cur_start  date;
  v_cur_end    date;
  v_prev_start date;
  v_prev_end   date;
begin
  if p_period = 'ytd' then
    v_cur_start  := date_trunc('year', v_today)::date;
    v_cur_end    := v_today + 1;
    v_prev_start := (date_trunc('year', v_today) - interval '1 year')::date;
    v_prev_end   := (v_today - interval '1 year')::date + 1;
  elsif p_period = 'quarter' then
    v_cur_start  := date_trunc('quarter', v_today)::date;
    v_cur_end    := v_today + 1;
    v_prev_start := (date_trunc('quarter', v_today) - interval '3 months')::date;
    v_prev_end   := date_trunc('quarter', v_today)::date;
  else
    v_cur_start  := date_trunc('month', v_today)::date;
    v_cur_end    := v_today + 1;
    v_prev_start := (date_trunc('month', v_today) - interval '1 month')::date;
    v_prev_end   := date_trunc('month', v_today)::date;
  end if;

  return jsonb_build_object(
    'period',  p_period,
    'current', public._finance_kpi_window(p_org_id, v_cur_start, v_cur_end),
    'prior',   public._finance_kpi_window(p_org_id, v_prev_start, v_prev_end)
  );
end $$;
