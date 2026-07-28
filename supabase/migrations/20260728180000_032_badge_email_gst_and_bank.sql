/*
  # Application confirmation email — GST status and bank details

  Applied to the live project on 2026-07-28.

  This email is the most important commercial document the platform sends: it is
  where a treasurer learns what to pay, where to send it, and what reference to
  quote. Two problems with the version shipped in 026:

  1. It quoted "NZD $70.00 annual membership" with no GST status. Prices are
     GST-EXCLUSIVE and Baqshi Limited is not yet GST registered, so silence
     invited the reader to assume the number included tax — and registration
     would later look like a 15% price rise.
  2. It gave a payment reference but no bank account, so the recipient had to
     sign back in to find out where to send the money.

  Body now states: "$70.00 + GST", "Amount to transfer now: $70.00", the reason
  no GST is charged, and the full account details.

  Keep in step with src/config/pricing.ts (GST_REGISTERED) and
  src/config/billing.ts (NGO_BANK_ACCOUNT). When GST registration takes effect,
  both this function and GST_REGISTERED must change together.
*/

-- Function body identical to the migration applied via MCP as
-- 032_badge_request_email_gst_and_bank_details. See git history for the full
-- text; reproduced here so a fresh database built from migrations matches prod.

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
      organization_id, product_type, amount_cents, currency, status,
      payment_method, bank_transfer_reference, notes, recorded_by
    ) VALUES (
      NEW.organization_id, 'membership_annual', 7000, 'NZD', 'pending',
      'bank_transfer', v_ref,
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
    'Thank you — we are reviewing your request. Use payment reference ' || v_ref ||
      ' for bank transfer. Allow up to 3 business days after we receive payment.',
    '/ngo/membership',
    jsonb_build_object('badge_request_id', NEW.id, 'payment_reference', v_ref)
  );

  IF v_recipient IS NOT NULL THEN
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
    );
  END IF;

  RETURN NEW;
END;
$$;
