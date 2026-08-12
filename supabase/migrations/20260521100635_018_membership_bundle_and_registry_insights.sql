/*
  # NZ launch bundle + registry insights + notification queue

  - membership_annual product ($100/year badge + monitoring)
  - criterion_tier on verification_criteria (public vs member-only)
  - registry_readiness_stats() for outreach marketing
  - notification_events for down-alert email queue
  - paid_live tier from active membership (not monthly monitoring alone)
*/

-- ── Product type: annual membership bundle ──────────────────────────────────

ALTER TABLE organization_payments
  DROP CONSTRAINT IF EXISTS organization_payments_product_type_check;

ALTER TABLE organization_payments
  ADD CONSTRAINT organization_payments_product_type_check
  CHECK (product_type IN (
    'membership_annual',
    'verification_annual',
    'monitoring_monthly'
  ));

COMMENT ON COLUMN organization_payments.product_type IS
  'membership_annual = $100/yr badge + monitoring (preferred). Legacy: verification_annual, monitoring_monthly.';

-- ── Criterion tier (public trust vs member-only security) ───────────────────

ALTER TABLE verification_criteria
  ADD COLUMN IF NOT EXISTS criterion_tier text NOT NULL DEFAULT 'public'
    CHECK (criterion_tier IN ('public', 'member'));

CREATE INDEX IF NOT EXISTS idx_verification_criteria_tier
  ON verification_criteria (organization_id, criterion_tier);

UPDATE verification_criteria SET criterion_tier = 'member'
WHERE criterion_key IN (
  'donation_transparency',
  'uptime_reliable',
  'code_repository',
  'security_baseline',
  'uptime_monitoring_config',
  'shared_credentials'
);

-- ── Active membership helper ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_active_membership(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships m
    WHERE m.organization_id = p_org_id
      AND m.status = 'active'
      AND m.expires_at > now()
  )
  OR EXISTS (
    SELECT 1 FROM organization_payments p
    WHERE p.organization_id = p_org_id
      AND p.product_type IN ('membership_annual', 'verification_annual')
      AND p.status = 'paid'
      AND p.period_end IS NOT NULL
      AND p.period_end > now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_membership(uuid) TO authenticated;

-- ── Registry readiness stats (listed orgs, marketing / outreach) ───────────

CREATE OR REPLACE FUNCTION public.registry_readiness_stats(p_country text DEFAULT 'NZ')
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
    'country', p_country,
    'total_listed', (
      SELECT count(*)::int FROM organizations o
      WHERE o.status = 'listed'
        AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
    ),
    'without_website', (
      SELECT count(*)::int FROM organizations o
      WHERE o.status = 'listed'
        AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
        AND coalesce(trim(o.website_url), '') = ''
    ),
    'with_website', (
      SELECT count(*)::int FROM organizations o
      WHERE o.status = 'listed'
        AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
        AND coalesce(trim(o.website_url), '') <> ''
    ),
    'heuristic_profile_ready', (
      SELECT count(*)::int FROM organizations o
      WHERE o.status = 'listed'
        AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
        AND coalesce(trim(o.website_url), '') <> ''
        AND (
          length(trim(coalesce(o.mission_statement, o.description, ''))) >= 40
        )
        AND coalesce(trim(o.email), '') <> ''
    ),
    'monitors_down', (
      SELECT count(*)::int
      FROM website_monitors wm
      JOIN organizations o ON o.id = wm.organization_id
      WHERE o.status = 'listed'
        AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
        AND wm.enabled = true
        AND wm.last_status = 'down'
    ),
    'monitors_up', (
      SELECT count(*)::int
      FROM website_monitors wm
      JOIN organizations o ON o.id = wm.organization_id
      WHERE o.status = 'listed'
        AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
        AND wm.enabled = true
        AND wm.last_status = 'up'
    ),
    'public_criteria_all_pass', (
      SELECT count(*)::int FROM (
        SELECT vc.organization_id
        FROM verification_criteria vc
        JOIN organizations o ON o.id = vc.organization_id
        WHERE o.status = 'listed'
          AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
          AND vc.criterion_tier = 'public'
        GROUP BY vc.organization_id
        HAVING bool_and(vc.status = 'pass')
      ) passed
    ),
    'with_public_criteria_initialized', (
      SELECT count(DISTINCT vc.organization_id)::int
      FROM verification_criteria vc
      JOIN organizations o ON o.id = vc.organization_id
      WHERE o.status = 'listed'
        AND (p_country IS NULL OR p_country = '' OR o.country = p_country)
        AND vc.criterion_tier = 'public'
    ),
    'active_members', (
      SELECT count(*)::int FROM organizations o
      WHERE (p_country IS NULL OR p_country = '' OR o.country = p_country)
        AND public.has_active_membership(o.id)
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registry_readiness_stats(text) TO authenticated;

-- ── Notification queue (down alerts — worker or edge sends email) ───────────

CREATE TABLE IF NOT EXISTS notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  incident_id uuid REFERENCES website_incidents(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  template text NOT NULL DEFAULT 'site_down'
    CHECK (template IN ('site_down', 'badge_issued', 'membership_welcome')),
  recipient_email text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  sent_at timestamptz,
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_events_pending
  ON notification_events (status, created_at)
  WHERE status = 'pending';

ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage notification events" ON notification_events;
CREATE POLICY "Staff manage notification events"
  ON notification_events FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- ── Re-tier monitors: paid_live = active membership ─────────────────────────

UPDATE website_monitors wm
SET tier = CASE
  WHEN public.has_active_membership(wm.organization_id) THEN 'paid_live'
  WHEN EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id = wm.organization_id
      AND o.status IN ('verified', 'active')
  ) THEN 'active'
  ELSE 'passive'
END,
check_interval_minutes = CASE
  WHEN public.has_active_membership(wm.organization_id) THEN 60
  WHEN EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id = wm.organization_id
      AND o.status IN ('verified', 'active')
  ) THEN 1440
  ELSE 10080
END,
updated_at = now();

-- Revenue view: count membership_annual with badge revenue
DROP VIEW IF EXISTS business_plan_actuals;

CREATE VIEW business_plan_actuals
WITH (security_invoker = true) AS
WITH revenue AS (
  SELECT
    date_trunc('month', paid_at)::date AS period,
    CASE
      WHEN product_type IN ('verification_annual', 'membership_annual') THEN 'verification_annual'
      ELSE product_type
    END AS product_type,
    sum(amount_cents)::bigint AS revenue_cents,
    count(*)::int AS units
  FROM organization_payments
  WHERE status = 'paid' AND paid_at IS NOT NULL
  GROUP BY 1, 2
),
expenses AS (
  SELECT
    date_trunc('month', incurred_on)::date AS period,
    sum(amount_cents)::bigint AS expense_cents
  FROM business_expenses
  GROUP BY 1
),
months AS (
  SELECT period FROM revenue
  UNION
  SELECT period FROM expenses
)
SELECT
  m.period,
  coalesce(sum(r.revenue_cents) FILTER (WHERE r.product_type = 'verification_annual'), 0)::bigint AS badge_revenue_cents,
  coalesce(sum(r.revenue_cents) FILTER (WHERE r.product_type = 'monitoring_monthly'), 0)::bigint AS monitoring_revenue_cents,
  coalesce(sum(r.revenue_cents), 0)::bigint AS total_revenue_cents,
  coalesce(sum(r.units) FILTER (WHERE r.product_type = 'verification_annual'), 0)::int AS badges_sold,
  coalesce(sum(r.units) FILTER (WHERE r.product_type = 'monitoring_monthly'), 0)::int AS monitoring_subs,
  coalesce(max(e.expense_cents), 0)::bigint AS expense_cents,
  (coalesce(sum(r.revenue_cents), 0) - coalesce(max(e.expense_cents), 0))::bigint AS net_cents
FROM (SELECT DISTINCT period FROM months) m
LEFT JOIN revenue r ON r.period = m.period
LEFT JOIN expenses e ON e.period = m.period
GROUP BY m.period
ORDER BY m.period DESC;

GRANT SELECT ON business_plan_actuals TO authenticated;

NOTIFY pgrst, 'reload schema';
