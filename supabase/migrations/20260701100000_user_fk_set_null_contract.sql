-- ============================================================================
-- CONTRACT migration: deleting an account must never cascade-wipe org data.
--
-- Every business table was created single-user with
--   user_id uuid references auth.users on delete CASCADE
-- Multi-tenancy made that a landmine: the admin Deny/Revoke flow deletes the
-- auth.users row (process-access-request), which silently deleted every
-- order/expense/customer/etc. the member ever created — org-wide data loss
-- from one click (REVIEW-2026-07-01 P0).
--
-- Fix: org_id is the ownership spine; user_id becomes provenance ("created
-- by"). All 19 business-table FKs flip to ON DELETE SET NULL, which requires
-- the columns to be nullable. RLS is org-based and unaffected.
--
-- Deliberately unchanged:
--   profiles.id          → CASCADE (identity row dies with the account)
--   org_memberships.user_id → CASCADE (membership is meaningless without the user)
--   access_requests / activity_log / admin_emails / organizations / tasks.assigned_to
--                        → already SET NULL
--
-- Name attribution (owner decision 2026-07-01: "keep name"): activity_log gains
-- an actor_name tombstone. The revoke flow stamps the departing member's
-- display name onto their activity rows BEFORE deleting the account, so the
-- feed keeps saying who did what after actor_id goes null.
-- ============================================================================

alter table public.activity_log add column if not exists actor_name text;
comment on column public.activity_log.actor_name is
  'Tombstoned display name of the actor, stamped when the account is deleted (actor_id becomes null). Null for live members (resolved via profiles) and for system writes.';

do $$
declare
  t text;
begin
  foreach t in array array[
    'cultivars', 'customers', 'etsy_imports', 'expenses', 'inventory',
    'licenses', 'listings', 'mortality_events', 'order_items', 'orders',
    'plant_photos', 'print_jobs', 'propagation_batches', 'qr_codes',
    'shipments', 'subscriptions', 'supplies', 'tasks', 'vendors'
  ] loop
    execute format('alter table public.%I alter column user_id drop not null', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_user_id_fkey');
    execute format(
      'alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete set null',
      t, t || '_user_id_fkey'
    );
  end loop;
end $$;
