/*
  # Cashflow volume units (expected vs actual counts)

  NGOs onboarded, badges sold, packages, workspace subscribers — separate from dollar lines.
  Daily actuals can roll up into actual_count per period later.
*/

CREATE TABLE IF NOT EXISTS business_cashflow_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period date NOT NULL,
  unit_key text NOT NULL,
  label text NOT NULL,
  expected_count bigint NOT NULL DEFAULT 0,
  actual_count bigint NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period, unit_key)
);

CREATE INDEX IF NOT EXISTS idx_business_cashflow_units_period
  ON business_cashflow_units (period DESC);

COMMENT ON TABLE business_cashflow_units IS
  'Monthly volume expectations vs actuals for cashflow (batch NGOs, badges, packages, workspace subs).';

ALTER TABLE business_cashflow_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage business cashflow units" ON business_cashflow_units;
CREATE POLICY "Staff manage business cashflow units"
  ON business_cashflow_units FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());
