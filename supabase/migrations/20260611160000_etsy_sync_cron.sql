-- Etsy has no order webhooks, so we PULL: poll the etsy-sync edge function every
-- 10 minutes. The function is idempotent (dedupes by external_id) and no-ops
-- gracefully until Etsy credentials are present in integration_config, so it is
-- safe to schedule before the connection is fully armed.
--
-- The function's URL token is read from integration_config at each run, so no
-- secret is embedded in the cron definition. If 'etsy_sync_token' is missing the
-- call is simply unauthorized and the function no-ops.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent (re)schedule: drop a prior job with the same name if present.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'etsy-sync-poll') then
    perform cron.unschedule('etsy-sync-poll');
  end if;
end $$;

select cron.schedule(
  'etsy-sync-poll',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://jagcnaxdxiummknyrxhj.supabase.co/functions/v1/etsy-sync?token='
           || coalesce((select value from public.integration_config where key = 'etsy_sync_token'), ''),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
