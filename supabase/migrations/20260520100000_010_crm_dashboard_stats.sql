/*
  # CRM dashboard aggregates (staff only)

  Single round-trip counts for 29k+ org scale — avoids loading all rows in the browser.
*/

CREATE OR REPLACE FUNCTION public.crm_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'staff only';
  END IF;

  SELECT json_build_object(
    'total', (SELECT count(*)::int FROM organizations),
    'listed', (SELECT count(*)::int FROM organizations WHERE status = 'listed'),
    'verified', (SELECT count(*)::int FROM organizations WHERE status IN ('verified', 'active')),
    'pending', (SELECT count(*)::int FROM organizations WHERE status IN ('onboarding', 'under_review')),
    'outreach_due', (
      SELECT count(*)::int FROM organizations
      WHERE status = 'listed' AND outreach_status = 'not_contacted'
    ),
    'listed_with_website', (
      SELECT count(*)::int FROM organizations
      WHERE status = 'listed' AND coalesce(trim(website_url), '') <> ''
    ),
    'listed_without_website', (
      SELECT count(*)::int FROM organizations
      WHERE status = 'listed' AND coalesce(trim(website_url), '') = ''
    ),
    'nz_registry', (
      SELECT count(*)::int FROM organizations
      WHERE source_registry = 'nz_charities_register'
    ),
    'badges_active', (
      SELECT count(*)::int FROM verification_badges WHERE is_active = true
    ),
    'badges_expiring_30d', (
      SELECT count(*)::int FROM verification_badges
      WHERE is_active = true
        AND expires_at IS NOT NULL
        AND expires_at > now()
        AND expires_at <= now() + interval '30 days'
    ),
    'badges_expired', (
      SELECT count(*)::int FROM verification_badges
      WHERE is_active = true
        AND expires_at IS NOT NULL
        AND expires_at < now()
    ),
    'badge_requests_pending', (
      SELECT count(*)::int FROM badge_requests WHERE status = 'pending'
    ),
    'monitors_total', (SELECT count(*)::int FROM website_monitors WHERE enabled = true),
    'monitors_up', (
      SELECT count(*)::int FROM website_monitors WHERE enabled = true AND last_status = 'up'
    ),
    'monitors_down', (
      SELECT count(*)::int FROM website_monitors WHERE enabled = true AND last_status = 'down'
    ),
    'incidents_open', (
      SELECT count(*)::int FROM website_incidents WHERE closed_at IS NULL
    ),
    'pipeline', (
      SELECT coalesce(json_object_agg(status, cnt), '{}'::json)
      FROM (
        SELECT status, count(*)::int AS cnt
        FROM organizations
        WHERE status IN ('listed', 'onboarding', 'under_review', 'verified', 'active', 'lapsed')
        GROUP BY status
      ) s
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_dashboard_stats() TO authenticated;
