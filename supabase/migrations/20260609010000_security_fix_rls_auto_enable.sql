-- Phase 0 — Security hardening
--
-- Advisor: "Public/Signed-In Users Can Execute SECURITY DEFINER Function"
--   public.rls_auto_enable() is an EVENT TRIGGER function. Event triggers fire
--   with elevated rights regardless of grants, so no role ever needs EXECUTE on
--   it. Revoking EXECUTE removes the REST RPC exposure flagged by the linter
--   without affecting the event trigger itself.
--
-- Note: the third advisor — "Leaked Password Protection Disabled" — is an Auth
-- configuration toggle, not SQL. Enable it in the dashboard:
--   Authentication → Providers → Email → "Leaked password protection".

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
