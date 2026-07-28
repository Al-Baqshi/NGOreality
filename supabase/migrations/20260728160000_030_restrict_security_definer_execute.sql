/*
  # SECURITY — stop anonymous callers invoking SECURITY DEFINER functions

  Applied to the live project on 2026-07-28.

  Every SECURITY DEFINER function in `public` was callable by `anon` over
  /rest/v1/rpc. Because they run as their owner, that was a privilege bypass
  straight around the RLS work in 028/029. An unauthenticated caller could:

    * insert_portal_notification_staff(...)  → inject arbitrary notifications
      into the staff inbox: a clean phishing vector, since staff trust it
    * insert_portal_notification_ngo(...)    → the same into any NGO's portal
    * ensure_organization_payment_reference(uuid) → WRITE a payment reference
      onto any organisation
    * registry_readiness_stats(text), crm_dashboard_stats() → read the outreach
      intelligence and business metrics that are the actual moat
    * has_active_membership(uuid) → probe any charity's paid status

  IMPORTANT: revoking from `anon` and `authenticated` alone did nothing.
  Postgres grants EXECUTE on every new function to the pseudo-role PUBLIC, and
  those roles inherit it. Live testing after the first attempt still returned
  204 for the staff-notification injection. The grant must be removed from
  PUBLIC and then handed back explicitly.

  Trigger functions need no EXECUTE grant: a trigger runs with the table
  owner's rights, not the caller's.
*/

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

-- Signed-in application RPCs. Each still enforces its own authorisation.
GRANT EXECUTE ON FUNCTION public.crm_dashboard_stats()                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.registry_readiness_stats(text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_membership(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_staff_ngo_portal_event(uuid, text, text) TO authenticated;

-- Stop the default grant silently reopening this for future functions.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
