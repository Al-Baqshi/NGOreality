/*
  # Let a Paymark payment be recorded, and let the other products be sold

  Two CHECK constraints made it impossible to record anything we actually sell
  through Online EFTPOS:

  1. payment_method allowed only stripe | bank_transfer | manual. Paymark is the
     provider being integrated, so the first successful payment would have been
     rejected by the database after the money had already left the payer's
     account — the worst possible moment to discover a constraint.

  2. product_type allowed only the three membership/monitoring values, so the
     $650 trust landing package and the Organisation Workspace seats had nowhere
     to be recorded even though both are on the public pricing page.

  'stripe' is kept in the list. It is unused, but dropping a value from a CHECK
  is not free if any historical row ever used it, and it costs nothing to leave.
*/

ALTER TABLE organization_payments
  DROP CONSTRAINT IF EXISTS organization_payments_payment_method_check;

ALTER TABLE organization_payments
  ADD CONSTRAINT organization_payments_payment_method_check
  CHECK (payment_method = ANY (ARRAY[
    'paymark'::text,
    'bank_transfer'::text,
    'manual'::text,
    'stripe'::text
  ]));

ALTER TABLE organization_payments
  DROP CONSTRAINT IF EXISTS organization_payments_product_type_check;

ALTER TABLE organization_payments
  ADD CONSTRAINT organization_payments_product_type_check
  CHECK (product_type = ANY (ARRAY[
    'membership_annual'::text,
    'verification_annual'::text,
    'monitoring_monthly'::text,
    'landing_standards_package'::text,
    'workspace_monthly'::text
  ]));

/*
  Idempotency for provider-initiated payments.

  The Stripe columns were the only provider identifiers on this table, so a
  Paymark payment had no key to deduplicate on. Paymark can deliver the same
  notification more than once — retries are normal, not exceptional — and
  without a unique key a retry becomes a second payment row, which reads as the
  customer having paid twice.

  Partial unique index rather than a plain one: almost every existing row has no
  provider transaction, and NULLs must not collide with each other.
*/
ALTER TABLE organization_payments
  ADD COLUMN IF NOT EXISTS provider_txn_id text;

CREATE UNIQUE INDEX IF NOT EXISTS organization_payments_provider_txn_id_key
  ON organization_payments (provider_txn_id)
  WHERE provider_txn_id IS NOT NULL;
