/*
  # Monitor tiering + url_invalid status + business plan tables

  Goal: make "X NGOs down" numbers trustworthy by
    1. Tiering monitors so the 29k registry orgs aren't checked at the same
       cadence as paying customers (intervals: passive 7d, active 24h, paid_live 1h).
    2. Treating unparseable / non-HTTP URLs as a data-quality issue
       (url_invalid), NOT an outage — so they don't inflate down counts or
       open incidents.

  Also adds the business plan module:
    - business_plan_targets: per-month expected revenue / counts / expenses
    - business_expenses: actual costs
    - business_plan_actuals (view): monthly rollup from organization_payments + expenses
*/

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Monitor tiering
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE website_monitors
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'passive'
    CHECK (tier IN ('passive', 'active', 'paid_live'));

CREATE INDEX IF NOT EXISTS idx_website_monitors_tier
  ON website_monitors (tier);

COMMENT ON COLUMN website_monitors.tier IS
  'Cadence tier: passive (7d, listed registry orgs), active (24h, verified), paid_live (1h, paying $13/mo customers)';

-- Loosen last_status check to include url_invalid (separate from "down")
ALTER TABLE website_monitors
  DROP CONSTRAINT IF EXISTS website_monitors_last_status_check;

ALTER TABLE website_monitors
  ADD CONSTRAINT website_monitors_last_status_check
  CHECK (last_status IN ('unknown', 'up', 'down', 'url_invalid'));

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Backfill tier from current org status + active monitoring subscription
-- ────────────────────────────────────────────────────────────────────────────

UPDATE website_monitors wm
SET tier = CASE
  WHEN EXISTS (
    SELECT 1 FROM organization_payments p
    WHERE p.organization_id = wm.organization_id
      AND p.product_type = 'monitoring_monthly'
      AND p.status = 'paid'
      AND p.period_end IS NOT NULL
      AND p.period_end > now()
  ) THEN 'paid_live'
  WHEN EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id = wm.organization_id
      AND o.status IN ('verified', 'active')
  ) THEN 'active'
  ELSE 'passive'
END,
updated_at = now();

-- Align check_interval_minutes with tier (7d / 24h / 1h)
UPDATE website_monitors SET check_interval_minutes = CASE
  WHEN tier = 'paid_live' THEN 60
  WHEN tier = 'active'    THEN 1440
  ELSE 10080
END,
updated_at = now();

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Business plan: targets + expenses
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS business_plan_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period date NOT NULL,
  metric text NOT NULL CHECK (metric IN (
    'total_revenue_cents',
    'badge_revenue_cents',
    'monitoring_revenue_cents',
    'badges_sold',
    'monitoring_subs',
    'expense_cents',
    'net_cents'
  )),
  expected_value bigint NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period, metric)
);

CREATE INDEX IF NOT EXISTS idx_business_plan_targets_period
  ON business_plan_targets (period DESC);

COMMENT ON TABLE business_plan_targets IS
  'Expected monthly targets. Period is the first day of the month (YYYY-MM-01). expected_value is cents for *_cents metrics, otherwise a raw count.';

CREATE TABLE IF NOT EXISTS business_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incurred_on date NOT NULL,
  category text NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NZD',
  vendor text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_expenses_date
  ON business_expenses (incurred_on DESC);

CREATE INDEX IF NOT EXISTS idx_business_expenses_category
  ON business_expenses (category, incurred_on DESC);

COMMENT ON TABLE business_expenses IS
  'Actual business expenses for monthly cash-flow vs targets.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Monthly actuals view (revenue from payments + expenses)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW business_plan_actuals AS
WITH revenue AS (
  SELECT
    date_trunc('month', paid_at)::date AS period,
    product_type,
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
LEFT JOIN revenue  r ON r.period = m.period
LEFT JOIN expenses e ON e.period = m.period
GROUP BY m.period
ORDER BY m.period DESC;

COMMENT ON VIEW business_plan_actuals IS
  'Monthly rollup of actuals: badge + monitoring revenue, unit counts, expenses, net. Joined against business_plan_targets in the CRM.';

-- ────────────────────────────────────────────────────────────────────────────
-- 5) RLS
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE business_plan_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage business plan targets" ON business_plan_targets;
CREATE POLICY "Staff manage business plan targets"
  ON business_plan_targets FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "Staff manage business expenses" ON business_expenses;
CREATE POLICY "Staff manage business expenses"
  ON business_expenses FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- Allow staff to read the actuals view (views inherit base-table RLS — both
-- organization_payments and business_expenses already restrict to staff).
GRANT SELECT ON business_plan_actuals TO authenticated;
