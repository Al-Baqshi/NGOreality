/*
  # NGO portal: logo file upload + "I've made the transfer" notice

  1. Storage bucket `org-logos` (public read). Portal members may upload,
     replace and delete objects only under their own organisation's folder:
     `<organization_id>/<file>`. Staff may manage any object. Raster images
     only (no SVG — an uploaded SVG can carry script), 2 MB max.

  2. organization_payments.customer_reported_paid_at — set when the NGO
     presses "I've made the payment" on a pending bank transfer.

     This is a HINT FOR STAFF ONLY. It never changes status, paid_at, periods
     or membership. Staff still match the transfer in the bank account (or
     the signed Paymark callback does) before anything is marked paid.

  3. RPC report_bank_transfer_sent(payment_id): members of the org stamp the
     column once and staff get a task + notification via notify_staff_system.
*/

-- 1. Logo bucket -------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-logos',
  'org-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Org logos public read" ON storage.objects;
CREATE POLICY "Org logos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');

DROP POLICY IF EXISTS "Org members upload own logo" ON storage.objects;
CREATE POLICY "Org members upload own logo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-logos'
    AND (
      public.is_staff_user()
      OR (storage.foldername(name))[1] IN (
        SELECT org_id::text FROM public.user_organization_ids() AS org_id
      )
    )
  );

DROP POLICY IF EXISTS "Org members update own logo" ON storage.objects;
CREATE POLICY "Org members update own logo"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND (
      public.is_staff_user()
      OR (storage.foldername(name))[1] IN (
        SELECT org_id::text FROM public.user_organization_ids() AS org_id
      )
    )
  );

DROP POLICY IF EXISTS "Org members delete own logo" ON storage.objects;
CREATE POLICY "Org members delete own logo"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'org-logos'
    AND (
      public.is_staff_user()
      OR (storage.foldername(name))[1] IN (
        SELECT org_id::text FROM public.user_organization_ids() AS org_id
      )
    )
  );

-- 2. Transfer notice column ----------------------------------------------------

ALTER TABLE public.organization_payments
  ADD COLUMN IF NOT EXISTS customer_reported_paid_at timestamptz;

COMMENT ON COLUMN public.organization_payments.customer_reported_paid_at IS
  'When the NGO said they sent the bank transfer. Staff hint only — never proof of payment.';

-- 3. RPC -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.report_bank_transfer_sent(p_payment_id uuid)
RETURNS public.organization_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.organization_payments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM organization_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF NOT (
    public.is_staff_user()
    OR v_row.organization_id IN (SELECT public.user_organization_ids())
  ) THEN
    RAISE EXCEPTION 'Not allowed for this organisation';
  END IF;

  IF v_row.status <> 'pending' OR v_row.payment_method <> 'bank_transfer' THEN
    RAISE EXCEPTION 'Only a pending bank transfer can be reported as sent';
  END IF;

  -- Idempotent: a second press does not create another staff task.
  IF v_row.customer_reported_paid_at IS NOT NULL THEN
    RETURN v_row;
  END IF;

  UPDATE organization_payments
  SET customer_reported_paid_at = now(), updated_at = now()
  WHERE id = p_payment_id
  RETURNING * INTO v_row;

  PERFORM public.notify_staff_system(
    v_row.organization_id,
    'bank_transfer_reported',
    format(
      'NGO says they sent %s %s with reference %s — check the bank account and mark paid when it arrives.',
      v_row.currency,
      to_char(v_row.amount_cents / 100.0, 'FM999999990.00'),
      coalesce(nullif(v_row.bank_transfer_reference, ''), '(none)')
    ),
    '/payments'
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.report_bank_transfer_sent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_bank_transfer_sent(uuid) TO authenticated;

COMMENT ON FUNCTION public.report_bank_transfer_sent(uuid) IS
  'NGO: flag a pending bank transfer as sent so staff can look for it. Never marks paid.';
