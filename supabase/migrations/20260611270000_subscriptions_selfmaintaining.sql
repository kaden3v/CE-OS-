-- ============================================================================
-- Self-maintaining subscriptions (recurring_expenses).
--
-- * auto_log: opt-in per subscription for the daily cron.
-- * subscription_price_history FK repointed to recurring_expenses (the table the
--   finance Subscriptions page actually uses; the original FK pointed at the
--   customer-tier `subscriptions` table — see the data-layer notes).
-- * log_subscription_charge: atomic — write the expense (source 'subscription')
--   and advance next_renewal by one billing cycle. Used by the Log button and
--   the cron. occurred_on is the renewal date being charged; the expense uses the
--   subscription's own user_id so it works with no auth context (cron).
-- * process_due_subscriptions: cron worker — logs every auto_log subscription
--   whose renewal has arrived (Phoenix today), then advances it past today, so a
--   second run the same day is a no-op (idempotent).
-- ============================================================================

alter table public.recurring_expenses
  add column if not exists auto_log boolean not null default false;

alter table public.subscription_price_history
  drop constraint if exists subscription_price_history_subscription_id_fkey;
alter table public.subscription_price_history
  add constraint subscription_price_history_subscription_id_fkey
  foreign key (subscription_id) references public.recurring_expenses(id) on delete cascade;

create or replace function public.log_subscription_charge(p_id uuid)
returns date
language plpgsql
security invoker
set search_path = public
as $$
declare
  s public.recurring_expenses%rowtype;
  v_base date;
  v_new  date;
  v_step interval;
  v_sched text;
begin
  select * into s from public.recurring_expenses where id = p_id;
  if s.id is null then raise exception 'subscription not found'; end if;

  v_base := coalesce(s.next_renewal, (now() at time zone 'America/Phoenix')::date);
  v_step := case s.billing_cycle
              when 'yearly' then interval '1 year'
              when 'quarterly' then interval '3 months'
              else interval '1 month' end;
  v_new := (v_base + v_step)::date;

  v_sched := case lower(coalesce(s.category, ''))
               when 'marketing' then 'Advertising'
               when 'utilities' then 'Utilities'
               else 'Other expenses' end;

  insert into public.expenses
    (org_id, user_id, amount, occurred_on, category, schedule_c_category, vendor_id, source, deductible, description)
  values
    (s.org_id, s.user_id, s.amount, v_base, coalesce(s.category, 'Subscription'), v_sched,
     s.vendor_id, 'subscription', true, s.name || ' (' || s.billing_cycle || ')');

  update public.recurring_expenses set next_renewal = v_new, updated_at = now() where id = p_id;
  return v_new;
end $$;

create or replace function public.process_due_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_today date := (now() at time zone 'America/Phoenix')::date;
  n int := 0;
begin
  for r in
    select id from public.recurring_expenses
    where auto_log = true and status = 'active'
      and next_renewal is not null and next_renewal <= v_today
  loop
    perform public.log_subscription_charge(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.log_subscription_charge(uuid) from public, anon;
revoke all on function public.process_due_subscriptions() from public, anon, authenticated;
grant execute on function public.log_subscription_charge(uuid) to authenticated;
grant execute on function public.process_due_subscriptions() to service_role;
