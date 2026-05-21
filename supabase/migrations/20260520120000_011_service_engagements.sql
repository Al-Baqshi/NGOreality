/*
  # Staff operations: engagements, follow-ups, work queue

  Tracks paid verification work and daily call list without duplicating registry rows.
*/

CREATE TABLE IF NOT EXISTS service_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_type text NOT NULL DEFAULT 'verification'
    CHECK (engagement_type IN ('verification', 'renewal', 'consulting', 'monitoring')),
  status text NOT NULL DEFAULT 'lead'
    CHECK (status IN ('lead', 'active', 'completed', 'cancelled')),
  fee_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NZD',
  notes text NOT NULL DEFAULT '',
  next_follow_up_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_engagements_org
  ON service_engagements (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_engagements_follow_up
  ON service_engagements (next_follow_up_at)
  WHERE status IN ('lead', 'active') AND next_follow_up_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS staff_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  engagement_id uuid REFERENCES service_engagements(id) ON DELETE SET NULL,
  title text NOT NULL,
  task_type text NOT NULL DEFAULT 'call'
    CHECK (task_type IN ('call', 'email', 'review', 'other')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'done', 'cancelled')),
  due_date date NOT NULL DEFAULT (current_date),
  notes text NOT NULL DEFAULT '',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_tasks_due
  ON staff_tasks (due_date, status)
  WHERE status = 'open';

ALTER TABLE service_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage service engagements"
  ON service_engagements FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "Staff manage staff tasks"
  ON staff_tasks FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- Extend dashboard stats
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
    'engagements_active', (
      SELECT count(*)::int FROM service_engagements WHERE status = 'active'
    ),
    'engagements_lead', (
      SELECT count(*)::int FROM service_engagements WHERE status = 'lead'
    ),
    'follow_ups_due', (
      SELECT count(*)::int FROM service_engagements
      WHERE status IN ('lead', 'active')
        AND next_follow_up_at IS NOT NULL
        AND next_follow_up_at::date <= current_date
    ),
    'tasks_due_today', (
      SELECT count(*)::int FROM staff_tasks
      WHERE status = 'open' AND due_date <= current_date
    ),
    'pipeline', (
      SELECT coalesce(json_object_agg(status, cnt), '{}'::json)
      FROM (
        SELECT status, count(*)::int AS cnt
        FROM organizations
        WHERE status IN ('listed', 'onboarding', 'under_review', 'verified', 'active', 'lapsed')
        GROUP BY status
      ) s
    ),
    'outreach_pipeline', (
      SELECT coalesce(json_object_agg(outreach_status, cnt), '{}'::json)
      FROM (
        SELECT outreach_status, count(*)::int AS cnt
        FROM organizations
        WHERE status = 'listed'
        GROUP BY outreach_status
      ) o
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_dashboard_stats() TO authenticated;
