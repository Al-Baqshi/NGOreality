/*
  # business_plan_actuals: respect RLS + force PostgREST schema reload

  By default a PostgreSQL view bypasses RLS on its base tables — meaning the
  authenticated GRANT we added in migration 016 would expose aggregate revenue
  to any logged-in user (e.g. NGO-portal users), not just staff.

  Recreate the view with `security_invoker = true` so it runs with the calling
  user's permissions. RLS on organization_payments and business_expenses then
  applies, restricting visibility to staff (is_staff_user()).

  Also NOTIFY pgrst to refresh the schema cache (fixes PGRST205 after migration).
*/

DROP VIEW IF EXISTS business_plan_actuals;

CREATE VIEW business_plan_actuals
WITH (security_invoker = true) AS
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
  'Monthly rollup of paid revenue + expenses. Runs with security_invoker, so RLS on base tables restricts access to staff.';

GRANT SELECT ON business_plan_actuals TO authenticated;

NOTIFY pgrst, 'reload schema';
