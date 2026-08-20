/*
  # NGO portal: request pending bank payment (safe)

  The Services & pay page calls createPendingBankPayment from the browser.
  Migration 031 removed member INSERT on organization_payments (correct —
  members must never mark themselves paid). That left the portal unable to
  queue a pending bank transfer for staff to match.

  This SECURITY DEFINER RPC:
  - Allows only members of the org (or staff)
  - Creates status='pending' only — never paid / never activates membership
  - Returns an existing pending row when one already exists
  - Treats verification_annual as the same product as membership_annual
*/

CREATE OR REPLACE FUNCTION public.request_pending_bank_payment(
  p_organization_id uuid,
  p_product_type text,
  p_notes text DEFAULT ''
)
RETURNS public.organization_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product text;
  v_amount integer;
  v_ref text;
  v_row public.organization_payments;
  v_is_member boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_member :=
    public.is_staff_user()
    OR p_organization_id IN (SELECT public.user_organization_ids());

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Not allowed for this organisation';
  END IF;

  v_product := CASE
    WHEN p_product_type = 'verification_annual' THEN 'membership_annual'
    ELSE p_product_type
  END;

  IF v_product NOT IN (
    'membership_annual',
    'landing_standards_package',
    'monitoring_monthly',
    'workspace_monthly'
  ) THEN
    RAISE EXCEPTION 'Unsupported product type: %', p_product_type;
  END IF;

  v_amount := CASE v_product
    WHEN 'membership_annual' THEN 7000
    WHEN 'landing_standards_package' THEN 65000
    WHEN 'monitoring_monthly' THEN 1300
    WHEN 'workspace_monthly' THEN 2500
    ELSE NULL
  END;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'No price configured for %', v_product;
  END IF;

  -- Inline payment-reference ensure (callable from triggers/RPC only).
  SELECT payment_reference INTO v_ref
  FROM organizations
  WHERE id = p_organization_id;

  IF v_ref IS NULL OR v_ref = '' THEN
    v_ref := 'NGR-' || upper(substr(replace(p_organization_id::text, '-', ''), 1, 8));
    UPDATE organizations
    SET payment_reference = v_ref, updated_at = now()
    WHERE id = p_organization_id;
  END IF;

  -- Reuse pending membership whether stored as membership_annual or legacy verification_annual.
  IF v_product = 'membership_annual' THEN
    SELECT * INTO v_row
    FROM organization_payments
    WHERE organization_id = p_organization_id
      AND status = 'pending'
      AND product_type IN ('membership_annual', 'verification_annual')
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    SELECT * INTO v_row
    FROM organization_payments
    WHERE organization_id = p_organization_id
      AND status = 'pending'
      AND product_type = v_product
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO organization_payments (
    organization_id,
    product_type,
    amount_cents,
    currency,
    status,
    payment_method,
    bank_transfer_reference,
    paid_at,
    period_start,
    period_end,
    notes,
    recorded_by
  ) VALUES (
    p_organization_id,
    v_product,
    v_amount,
    'NZD',
    'pending',
    'bank_transfer',
    v_ref,
    NULL,
    NULL,
    NULL,
    coalesce(nullif(trim(p_notes), ''), 'Requested via NGO portal'),
    coalesce(auth.jwt() ->> 'email', auth.uid()::text, 'ngo_portal')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.request_pending_bank_payment(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_pending_bank_payment(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.request_pending_bank_payment(uuid, text, text) IS
  'NGO/staff: queue or return a pending bank-transfer payment for an org. Never marks paid.';
