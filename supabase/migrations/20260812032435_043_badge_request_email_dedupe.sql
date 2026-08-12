/*
  # One badge request, one payment email

  handle_badge_request_insert guards the organization_payments row with
  IF NOT EXISTS, so a second request does not create a second invoice. The
  notification_events insert had no such guard, so every request queued another
  email carrying bank account details and a payment demand.

  Combined with the pre-042 world — where any account could claim any charity
  and request a badge — that was a loop: claim a charity, submit N requests,
  and NGOreality's own verified domain sends N "transfer $70 to this ASB
  account" emails to the charity's registry address. 042 closed the attacker
  path (only a steward may insert a badge_request at all). This closes the
  remaining one: a legitimate steward clicking twice.

  Two guards, deliberately independent:

    1. The email is tied to the SAME condition as the payment row. If no new
       payment was created, no new payment email is sent. The portal
       notification still fires, so a re-application is acknowledged on screen
       — it just does not re-send bank details.

    2. A partial unique index makes a duplicate physically impossible even if
       some future path bypasses the trigger. Paired with ON CONFLICT DO
       NOTHING so it silently dedupes rather than failing the member's request
       — an application that errors because we already emailed them would be a
       worse bug than the one being fixed.

  The index is scoped to status='pending' so next year's renewal can queue a
  fresh email once this one has actually been sent.

  Verified: three badge requests in a row produce 1 payment and 1 email.
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_events_one_pending_badge_email
  ON notification_events (organization_id, template)
  WHERE status = 'pending' AND template = 'badge_request_received';

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
  v_payment_created boolean := false;
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
      organization_id, product_type, amount_cents, currency, status,
      payment_method, bank_transfer_reference, notes, recorded_by
    ) VALUES (
      NEW.organization_id, 'membership_annual', 7000, 'NZD', 'pending',
      'bank_transfer', v_ref,
      'Awaiting bank transfer — ' || replace(NEW.request_type, '_', ' ') || ' request',
      'system'
    );
    v_payment_created := true;
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

  -- Always acknowledge in the portal: a re-application should visibly land.
  PERFORM public.insert_portal_notification_ngo(
    NEW.organization_id,
    'badge_request_submitted',
    'Application received',
    'Thank you — we are reviewing your request. Use payment reference ' || v_ref ||
      ' for bank transfer. Allow up to 3 business days after we receive payment.',
    '/ngo/membership',
    jsonb_build_object('badge_request_id', NEW.id, 'payment_reference', v_ref)
  );

  -- The EMAIL, however, only when there is genuinely a new payment to make.
  IF v_recipient IS NOT NULL AND v_payment_created THEN
    v_subject := '[NGOreality] Application received — ' || COALESCE(v_org_name, 'your organisation');
    v_body := concat(
      'Kia ora,', E'\n\n',
      'Thank you for submitting your NGOreality verification request (',
        replace(NEW.request_type, '_', ' '), ') for ',
        COALESCE(v_org_name, 'your organisation'), '.', E'\n\n',
      'What happens next:', E'\n',
      '- We review your site against our public trust standards (see your portal checklist).', E'\n',
      '- If anything needs updating, we will email you.', E'\n',
      '- Your Reality Badge is issued when standards pass and membership is active.', E'\n',
      '- Typical review time: about 5-10 business days after payment and standards are in order.', E'\n\n',
      'PAYMENT', E'\n',
      'Annual membership: NZD $70.00 + GST', E'\n',
      'Amount to transfer now: NZD $70.00', E'\n',
      'Baqshi Limited is not currently GST registered, so no GST is charged.', E'\n\n',
      'Bank account name: Baqshi Limited', E'\n',
      'Bank: ASB Bank', E'\n',
      'Account number: 12-3044-0117466-00', E'\n',
      'Reference (required): ', v_ref, E'\n\n',
      'Please put that reference in the transfer so we can match your payment.', E'\n',
      'Bank transfers are matched manually and can take up to 3 business days to apply.', E'\n\n',
      'Sign in: https://www.ngoreality.com/ngo', E'\n\n',
      '— NGOreality'
    );

    INSERT INTO notification_events (
      organization_id, template, recipient_email, subject, body_text, status
    ) VALUES (
      NEW.organization_id, 'badge_request_received', v_recipient, v_subject, v_body, 'pending'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
