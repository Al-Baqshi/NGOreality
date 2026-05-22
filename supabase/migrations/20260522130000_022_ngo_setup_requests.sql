/*
  NGO portal: setup requests (landing package, brand assets) and staff notifications.
*/

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_primary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS brand_secondary text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS ngo_setup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_kind text NOT NULL DEFAULT 'landing_standards'
    CHECK (request_kind IN ('landing_standards', 'brand_assets', 'general')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_review', 'approved', 'completed', 'cancelled')),
  has_existing_website boolean NOT NULL DEFAULT false,
  wants_landing_package boolean NOT NULL DEFAULT false,
  logo_url text NOT NULL DEFAULT '',
  brand_primary text NOT NULL DEFAULT '',
  brand_secondary text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  questionnaire jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ngo_setup_requests_org ON ngo_setup_requests (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ngo_setup_requests_status ON ngo_setup_requests (status) WHERE status = 'pending';

ALTER TABLE ngo_setup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own setup requests"
  ON ngo_setup_requests FOR SELECT
  TO authenticated
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    OR public.is_staff_user()
  );

CREATE POLICY "Members create setup requests for own org"
  ON ngo_setup_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND requested_by = auth.uid()
  );

CREATE POLICY "Staff update setup requests"
  ON ngo_setup_requests FOR UPDATE
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE OR REPLACE FUNCTION public.notify_staff_ngo_portal_event(
  p_organization_id uuid,
  p_action text,
  p_description text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_organization_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a member of this organization';
  END IF;

  SELECT name INTO v_org_name FROM organizations WHERE id = p_organization_id;

  INSERT INTO activity_log (organization_id, action, description, performed_by)
  VALUES (p_organization_id, p_action, p_description, 'ngo_portal');

  INSERT INTO staff_tasks (organization_id, title, task_type, notes, due_date)
  VALUES (
    p_organization_id,
    COALESCE(v_org_name, 'Organization') || ' — ' || p_action,
    'review',
    p_description,
    current_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_staff_ngo_portal_event(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_staff_ngo_portal_event(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_ngo_setup_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desc text;
BEGIN
  v_desc := CASE
    WHEN NEW.wants_landing_package THEN 'Setup request: landing + standards package'
    WHEN NEW.request_kind = 'brand_assets' THEN 'Setup request: brand assets (logo / colours)'
    ELSE 'Setup request: NGO portal'
  END;

  IF NEW.notes <> '' THEN
    v_desc := v_desc || ' — ' || left(NEW.notes, 200);
  END IF;

  PERFORM public.notify_staff_ngo_portal_event(NEW.organization_id, 'ngo_setup_request', v_desc);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_ngo_setup_request_created ON ngo_setup_requests;
CREATE TRIGGER on_ngo_setup_request_created
  AFTER INSERT ON ngo_setup_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_ngo_setup_request_insert();

-- Extend CRM dashboard stats (pending NGO setup requests)
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
    'ngo_setup_requests_pending', (
      SELECT count(*)::int FROM ngo_setup_requests WHERE status = 'pending'
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
