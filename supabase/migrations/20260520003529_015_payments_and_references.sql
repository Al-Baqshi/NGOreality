/*
  # NGO billing: payment reference + payment ledger

  - payment_reference: unique bank-transfer / Stripe client reference (NGR-XXXXXXXX)
  - organization_payments: verification ($50/yr) and monitoring ($13/mo) charges
*/

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS payment_reference text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_payment_reference
  ON organizations (payment_reference)
  WHERE payment_reference IS NOT NULL;

UPDATE organizations
SET payment_reference = 'NGR-' || upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE payment_reference IS NULL;

COMMENT ON COLUMN organizations.payment_reference IS
  'Unique reference for bank transfer and Stripe client_reference_id (e.g. NGR-A1B2C3D4)';

CREATE TABLE IF NOT EXISTS organization_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_type text NOT NULL
    CHECK (product_type IN ('verification_annual', 'monitoring_monthly')),
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'NZD',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  payment_method text NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('stripe', 'bank_transfer', 'manual')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  bank_transfer_reference text,
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  notes text NOT NULL DEFAULT '',
  recorded_by text NOT NULL DEFAULT 'staff',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_payments_org
  ON organization_payments (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organization_payments_status
  ON organization_payments (status, product_type);

ALTER TABLE organization_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage organization payments"
  ON organization_payments FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

COMMENT ON TABLE organization_payments IS
  'Ledger for Reality Badge annual fee and optional monthly monitoring';
