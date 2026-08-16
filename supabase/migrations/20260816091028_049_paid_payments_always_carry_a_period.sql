-- A member who pays gets invoiced a second time.
--
-- handle_badge_request_insert() suppresses the "please pay" email and its
-- invoice row when an active payment exists, testing that with
-- `period_end IS NOT NULL AND period_end > now()`. Two writers set a payment to
-- 'paid': the insert path in src/lib/payments.ts, which computes a period, and
-- reconcilePayment() in src/lib/reconciliation.ts -- the one behind the
-- one-click "clear this bank transfer" button -- which updates status, paid_at,
-- the bank reference and notes, and never touches the period. The gate then
-- reads false against a row that IS paid.
--
-- The consequence is not a stray email. The charity pays $70, staff clear the
-- transfer, the charity re-requests a badge, and our own domain sends them a
-- fresh demand for another $70 plus a duplicate invoice that permanently
-- pollutes the reconciliation queue. It has never fired only because
-- reconciliation has never been run.
--
-- Fixing the one caller leaves the hole open for the next writer -- the Paymark
-- callback lands in this table too. So the invariant is enforced where it
-- cannot be bypassed. Term lengths mirror periodForProduct() in payments.ts.

CREATE OR REPLACE FUNCTION public.ensure_payment_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' THEN
    IF NEW.period_start IS NULL THEN
      NEW.period_start := coalesce(NEW.paid_at, now());
    END IF;
    IF NEW.period_end IS NULL THEN
      NEW.period_end := NEW.period_start
        + CASE WHEN NEW.product_type = 'monitoring_monthly'
               THEN interval '1 month'
               ELSE interval '1 year'
          END;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

DROP TRIGGER IF EXISTS trg_ensure_payment_period ON public.organization_payments;
CREATE TRIGGER trg_ensure_payment_period
  BEFORE INSERT OR UPDATE ON public.organization_payments
  FOR EACH ROW EXECUTE FUNCTION public.ensure_payment_period();

-- Repair any row already in the broken state.
UPDATE public.organization_payments
   SET period_start = coalesce(period_start, paid_at, created_at),
       period_end   = coalesce(period_end,
                        coalesce(period_start, paid_at, created_at)
                        + CASE WHEN product_type = 'monitoring_monthly'
                               THEN interval '1 month' ELSE interval '1 year' END)
 WHERE status = 'paid' AND (period_start IS NULL OR period_end IS NULL);
