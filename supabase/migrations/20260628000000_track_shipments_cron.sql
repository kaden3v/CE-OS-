-- USPS delivery confirmation. Etsy never reports carrier delivery, so orders
-- sit as "shipped" (in transit) until USPS confirms. Poll the track-shipments
-- edge function every 4 hours. The function is idempotent and no-ops gracefully
-- until USPS credentials (usps_client_id / usps_client_secret) and a gate token
-- (usps_sync_token) are present in integration_config, so it is safe to schedule
-- before the connection is armed.
--
-- The URL token is read from integration_config at each run, so no secret is
-- embedded here. If 'usps_sync_token' is missing the call is unauthorized and
-- the function no-ops.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent (re)schedule: drop a prior job with the same name if present.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'track-shipments-poll') then
    perform cron.unschedule('track-shipments-poll');
  end if;
end $$;

select cron.schedule(
  'track-shipments-poll',
  '0 */4 * * *',
  $$
  select net.http_post(
    url := 'https://jagcnaxdxiummknyrxhj.supabase.co/functions/v1/track-shipments?token='
           || coalesce((select value from public.integration_config where key = 'usps_sync_token'), ''),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
