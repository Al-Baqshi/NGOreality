/*
  # Badge request → payment reference, pending bank payment, confirmation email

  - Ensure NGR-… reference on org when a badge/verification request is submitted
  - Queue pending membership payment for manual bank matching
  - Email template badge_request_received for NGO confirmation
  - Members can read their own payment ledger rows
*/

ALTER TABLE notification_events
  DROP CONSTRAINT IF EXISTS notification_events_template_check;

ALTER TABLE notification_events
  ADD CONSTRAINT notification_events_template_check
  CHECK (template IN (
    'site_down',
    'badge_issued',
    'membership_welcome',
    'badge_request_received',
    'outreach_cold_invite',
    'outreach_no_website',
    'outreach_website_help'
  ));

DROP POLICY IF EXISTS "Members read own organization payments" ON organization_payments;
CREATE POLICY "Members read own organization payments"
  ON organization_payments FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE OR REPLACE FUNCTION public.ensure_organization_payment_reference(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
BEGIN
  SELECT payment_reference INTO v_ref FROM organizations WHERE id = p_org_id;
  IF v_ref IS NOT NULL AND v_ref <> '' THEN
    RETURN v_ref;
  END IF;

  v_ref := 'NGR-' || upper(substr(replace(p_org_id::text, '-', ''), 1, 8));
  UPDATE organizations
  SET payment_reference = v_ref, updated_at = now()
  WHERE id = p_org_id;

  RETURN v_ref;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_badge_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_name text;
  v_org_email text;
  v_user_email text;
  v_recipient text;
  v_ref text;
  v_subject text;
  v_body text;
BEGIN
  SELECT name, nullif(trim(email), '') INTO v_org_name, v_org_email
  FROM organizations WHERE id = NEW.organization_id;

  SELECT nullif(trim(email), '') INTO v_user_email
  FROM auth.users WHERE id = NEW.requested_by;

  v_recipient := coalesce(v_org_email, v_user_email);
  v_ref := public.ensure_organization_payment_reference(NEW.organization_id);

  IF NOT EXISTS (
    SELECT 1 FROM organization_payments p
    WHERE p.organization_id = NEW.organization_id
      AND p.product_type = 'membership_annual'
      AND (
        p.status = 'pending'
        OR (p.status = 'paid' AND p.period_end IS NOT NULL AND p.period_end > now())
      )
  ) THEN
    INSERT INTO organization_payments (
      organization_id,
      product_type,
      amount_cents,
      currency,
      status,
      payment_method,
      bank_transfer_reference,
      notes,
      recorded_by
    ) VALUES (
      NEW.organization_id,
      'membership_annual',
      7000,
      'NZD',
      'pending',
      'bank_transfer',
      v_ref,
      'Awaiting bank transfer — ' || replace(NEW.request_type, '_', ' ') || ' request',
      'system'
    );
  END IF;

  IF NEW.status = 'pending' THEN
    PERFORM public.insert_portal_notification_staff(
      'badge_request',
      'Badge request: ' || COALESCE(v_org_name, 'Organization'),
      NEW.request_type || coalesce(' — ' || nullif(NEW.notes, ''), '') || E'\nPayment ref: ' || v_ref,
      '/organizations/' || NEW.organization_id::text,
      NEW.organization_id,
      jsonb_build_object('badge_request_id', NEW.id, 'payment_reference', v_ref)
    );
  END IF;

  PERFORM public.insert_portal_notification_ngo(
    NEW.organization_id,
    'badge_request_submitted',
    'Application received',
    'Thank you — we are reviewing your request. Use payment reference ' || v_ref || ' for bank transfer. Allow up to 3 business days after we receive payment.',
    '/ngo/membership',
    jsonb_build_object('badge_request_id', NEW.id, 'payment_reference', v_ref)
  );

  IF v_recipient IS NOT NULL THEN
    v_subject := '[NGOreality] Application received — ' || COALESCE(v_org_name, 'your organisation');
    v_body := concat(
      'Kia ora,', E'\n\n',
      'Thank you for submitting your NGOreality verification request (', replace(NEW.request_type, '_', ' '), ') for ',
      COALESCE(v_org_name, 'your organisation'), '.', E'\n\n',
      'What happens next:', E'\n',
      '• We review your site against our public trust standards (see your portal checklist).', E'\n',
      '• If anything needs updating, we will email you.', E'\n',
      '• Reality Badge is issued when standards pass and membership is active.', E'\n',
      '• Typical review time: about 5–10 business days after payment and standards are in order.', E'\n\n',
      'Pay by bank transfer (manual processing, up to 3 business days to apply):', E'\n',
      'Payment reference (required): ', v_ref, E'\n',
      'Amount: NZD $70.00 annual membership', E'\n\n',
      'You can also use Stripe or Airwallet from the portal when available.', E'\n\n',
      'Sign in: https://www.ngoreality.com/ngo', E'\n\n',
      '— NGOreality'
    );

    INSERT INTO notification_events (
      organization_id,
      template,
      recipient_email,
      subject,
      body_text,
      status
    ) VALUES (
      NEW.organization_id,
      'badge_request_received',
      v_recipient,
      v_subject,
      v_body,
      'pending'
    );
  END IF;

  RETURN NEW;
END;
$$;
