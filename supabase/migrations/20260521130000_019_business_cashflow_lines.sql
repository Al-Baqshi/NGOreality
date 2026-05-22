/*
  # Business cashflow lines (MSD / PSG template alignment)

  Stores expected vs actual per cashflow line per month, matching
  ref/Cashflow Forecasting Template.xlsx (Sales, Flexi-Wage, grant, GST, etc.).
*/

CREATE TABLE IF NOT EXISTS business_cashflow_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period date NOT NULL,
  line_key text NOT NULL,
  section text NOT NULL CHECK (section IN ('receipt', 'expense_gst', 'expense_non_gst', 'other_payment')),
  label text NOT NULL,
  expected_cents bigint NOT NULL DEFAULT 0,
  actual_cents bigint NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period, line_key)
);

CREATE INDEX IF NOT EXISTS idx_business_cashflow_lines_period
  ON business_cashflow_lines (period DESC);

COMMENT ON TABLE business_cashflow_lines IS
  'Monthly cashflow worksheet lines (Flexi-Wage template). Sales actual can be synced from payments in the app.';

ALTER TABLE business_cashflow_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage business cashflow lines" ON business_cashflow_lines;
CREATE POLICY "Staff manage business cashflow lines"
  ON business_cashflow_lines FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

-- Include membership_annual in revenue rollups
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
  coalesce(
    sum(r.revenue_cents) FILTER (
      WHERE r.product_type IN ('verification_annual', 'membership_annual')
    ),
    0
  )::bigint AS badge_revenue_cents,
  coalesce(sum(r.revenue_cents) FILTER (WHERE r.product_type = 'monitoring_monthly'), 0)::bigint AS monitoring_revenue_cents,
  coalesce(sum(r.revenue_cents), 0)::bigint AS total_revenue_cents,
  coalesce(
    sum(r.units) FILTER (WHERE r.product_type IN ('verification_annual', 'membership_annual')),
    0
  )::int AS badges_sold,
  coalesce(sum(r.units) FILTER (WHERE r.product_type = 'monitoring_monthly'), 0)::int AS monitoring_subs,
  coalesce(max(e.expense_cents), 0)::bigint AS expense_cents,
  (coalesce(sum(r.revenue_cents), 0) - coalesce(max(e.expense_cents), 0))::bigint AS net_cents
FROM (SELECT DISTINCT period FROM months) m
LEFT JOIN revenue r ON r.period = m.period
LEFT JOIN expenses e ON e.period = m.period
GROUP BY m.period
ORDER BY m.period DESC;
