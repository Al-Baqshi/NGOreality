-- Payment notifications received from a provider.
--
-- This is an APPEND-ONLY RECEIPT LOG, not the billing ledger. Its job is to
-- record, verbatim and exactly once, that a provider told us something. What
-- that means commercially — activating a membership, extending a subscription —
-- is decided afterwards by reconciliation against platform.tenants and the
-- Supabase-side organization_payments.
--
-- Keeping the two apart matters: a webhook is an untrusted, retried, possibly
-- out-of-order message. Writing it straight into a ledger conflates "they told
-- us" with "it is true".

CREATE TABLE IF NOT EXISTS platform.payment_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text NOT NULL DEFAULT 'paymark'
                   CHECK (provider IN ('paymark', 'stripe', 'bank_transfer', 'manual')),

  -- The provider's own identifier. UNIQUE per provider is what makes delivery
  -- idempotent: a webhook retried five times inserts once.
  provider_txn_id  text NOT NULL,

  -- Our reference, echoed back by the payer. For membership this is the NGR-
  -- code, which is how the payment is matched to an organisation.
  merchant_ref     text NOT NULL DEFAULT '',

  status           text NOT NULL DEFAULT 'unknown',
  succeeded        boolean NOT NULL DEFAULT false,
  amount_cents     bigint,
  currency         text NOT NULL DEFAULT 'NZD',

  -- The complete verified payload. Retained because the provider's field names
  -- are not yet confirmed against a live callback, and because a payment
  -- dispute is answered with what they actually sent, not our summary of it.
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Set once a human or job has acted on this event.
  reconciled_at    timestamptz,
  reconciled_note  text NOT NULL DEFAULT '',

  received_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (provider, provider_txn_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_ref
  ON platform.payment_events(merchant_ref);
CREATE INDEX IF NOT EXISTS idx_payment_events_unreconciled
  ON platform.payment_events(received_at DESC) WHERE reconciled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_events_received
  ON platform.payment_events(received_at DESC);

-- Append-only: a receipt that can be edited is not a receipt.
CREATE OR REPLACE FUNCTION platform.reject_payment_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payment_events is append-only: notifications cannot be deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Reconciliation fields are the only mutable ones.
  IF NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_txn_id IS DISTINCT FROM OLD.provider_txn_id
     OR NEW.merchant_ref IS DISTINCT FROM OLD.merchant_ref
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.succeeded IS DISTINCT FROM OLD.succeeded
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.received_at IS DISTINCT FROM OLD.received_at
  THEN
    RAISE EXCEPTION
      'payment_events is append-only: only reconciled_at and reconciled_note may change'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_events_append_only ON platform.payment_events;
CREATE TRIGGER trg_payment_events_append_only
  BEFORE UPDATE OR DELETE ON platform.payment_events
  FOR EACH ROW EXECUTE FUNCTION platform.reject_payment_event_mutation();
