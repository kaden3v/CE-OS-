-- Server-only key/value config read by edge functions via the service role.
-- Holds e.g. 'shopify_webhook_token' for the Shopify webhook's URL-token auth.
-- RLS enabled with NO policies + revoked grants → only the service role (which
-- bypasses RLS) can read/write; anon/authenticated clients get nothing.
create table if not exists public.integration_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.integration_config enable row level security;
revoke all on public.integration_config from anon, authenticated;
comment on table public.integration_config is
  'Server-only key/value config (e.g. shopify_webhook_token). RLS on with no policies = service_role only.';
