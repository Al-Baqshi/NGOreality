-- RESCUED FROM PRODUCTION 2026-08-07. This migration was applied to the live
-- project but had no source in git. Recovered verbatim from
-- supabase_migrations.schema_migrations (version 20260728031542) so that the
-- repository matches the database. Do not renumber: the version prefix is what
-- stops `supabase db push` re-applying it.

-- Migration 030 revoked EXECUTE from `anon` and `authenticated` but the
-- functions remained callable. Postgres grants EXECUTE on every new function to
-- the pseudo-role PUBLIC by default, and anon/authenticated inherit it. Live
-- testing confirmed it: after 030, an unauthenticated caller could still
-- POST /rest/v1/rpc/insert_portal_notification_staff (204) and
-- /rpc/ensure_organization_payment_reference (200 — a write).
--
-- Revoking from a role has no effect while the same privilege is held by
-- PUBLIC. The grant has to be removed from PUBLIC, then handed back explicitly.

DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
  END LOOP;
END
$$;

-- Public directory facets.
GRANT EXECUTE ON FUNCTION public.directory_country_counts()          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.directory_tag_counts(text)          TO anon, authenticated;

-- Referenced inside RLS policies; policy evaluation fails without EXECUTE.
GRANT EXECUTE ON FUNCTION public.is_staff_user()                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_organization_ids()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.organization_is_claimable(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.organization_has_members(uuid)      TO authenticated;

-- Signed-in application RPCs.
GRANT EXECUTE ON FUNCTION public.crm_dashboard_stats()                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.registry_readiness_stats(text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_membership(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_staff_ngo_portal_event(uuid, text, text) TO authenticated;

-- Stop the default grant from silently reopening this for future functions.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
