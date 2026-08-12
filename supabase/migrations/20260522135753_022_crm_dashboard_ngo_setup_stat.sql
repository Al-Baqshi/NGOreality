-- RESCUED FROM PRODUCTION during the A0 migration-history reconciliation.
-- Applied as version 20260522135753 with no source in git.
--
-- Adds ngo_setup_requests_pending to the staff dashboard aggregate. The same
-- definition also appears at the end of 022_ngo_setup_requests — production
-- applied it twice, as two versions. CREATE OR REPLACE makes that harmless,
-- and reproducing it keeps a from-scratch rebuild identical to production.

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
    'outreach_due', (SELECT count(*)::int FROM organizations WHERE status = 'listed' AND outreach_status = 'not_contacted'),
    'listed_with_website', (SELECT count(*)::int FROM organizations WHERE status = 'listed' AND coalesce(trim(website_url), '') <> ''),
    'listed_without_website', (SELECT count(*)::int FROM organizations WHERE status = 'listed' AND coalesce(trim(website_url), '') = ''),
    'nz_registry', (SELECT count(*)::int FROM organizations WHERE source_registry = 'nz_charities_register'),
    'badges_active', (SELECT count(*)::int FROM verification_badges WHERE is_active = true),
    'badges_expiring_30d', (SELECT count(*)::int FROM verification_badges WHERE is_active = true AND expires_at IS NOT NULL AND expires_at > now() AND expires_at <= now() + interval '30 days'),
    'badges_expired', (SELECT count(*)::int FROM verification_badges WHERE is_active = true AND expires_at IS NOT NULL AND expires_at < now()),
    'badge_requests_pending', (SELECT count(*)::int FROM badge_requests WHERE status = 'pending'),
    'ngo_setup_requests_pending', (SELECT count(*)::int FROM ngo_setup_requests WHERE status = 'pending'),
    'monitors_total', (SELECT count(*)::int FROM website_monitors WHERE enabled = true),
    'monitors_up', (SELECT count(*)::int FROM website_monitors WHERE enabled = true AND last_status = 'up'),
    'monitors_down', (SELECT count(*)::int FROM website_monitors WHERE enabled = true AND last_status = 'down'),
    'incidents_open', (SELECT count(*)::int FROM website_incidents WHERE closed_at IS NULL),
    'engagements_active', (SELECT count(*)::int FROM service_engagements WHERE status = 'active'),
    'engagements_lead', (SELECT count(*)::int FROM service_engagements WHERE status = 'lead'),
    'follow_ups_due', (SELECT count(*)::int FROM service_engagements WHERE status IN ('lead', 'active') AND next_follow_up_at IS NOT NULL AND next_follow_up_at::date <= current_date),
    'tasks_due_today', (SELECT count(*)::int FROM staff_tasks WHERE status = 'open' AND due_date <= current_date),
    'pipeline', (SELECT coalesce(json_object_agg(status, cnt), '{}'::json) FROM (SELECT status, count(*)::int AS cnt FROM organizations WHERE status IN ('listed', 'onboarding', 'under_review', 'verified', 'active', 'lapsed') GROUP BY status) s),
    'outreach_pipeline', (SELECT coalesce(json_object_agg(outreach_status, cnt), '{}'::json) FROM (SELECT outreach_status, count(*)::int AS cnt FROM organizations WHERE status = 'listed' GROUP BY outreach_status) o)
  ) INTO result;

  RETURN result;
END;
$$;
