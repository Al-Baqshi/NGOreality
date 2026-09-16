import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle, Copy, CreditCard, Layout, Send, Shield } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import NgoPortalPageShell from '../../../components/ngo/NgoPortalPageShell';
import {
  BANK_TRANSFER_INSTRUCTIONS,
  createPendingBankPayment,
  ensurePaymentReference,
  reportBankTransferSent,
} from '../../../lib/payments';
import { submitNgoSetupRequest } from '../../../lib/ngoSetupRequests';
import { MEMBERSHIP_ANNUAL_CENTS, GST_PRICE_SUFFIX, PRICING_CURRENCY } from '../../../config/pricing';
import {
  LANDING_STANDARDS_PACKAGE_CENTS,
  LANDING_STANDARDS_PACKAGE_LABEL,
} from '../../../config/customerProducts';
import { BANK_TRANSFER_PROCESSING_BUSINESS_DAYS, NGO_BANK_ACCOUNT } from '../../../config/billing';
import { formatNzDateTime } from '../../../lib/formatDate';
import { PAYMENT_PRODUCT_LABELS, type OrganizationPayment, type PaymentProductType } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { captureError } from '../../../lib/errorReporting';
import { cn } from '@/lib/utils';

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-100 py-2 last:border-b-0 dark:border-border">
      <div className="min-w-0">
        <p className="font-mono text-2xs uppercase tracking-wider text-ink-500">{label}</p>
        <p className="truncate font-mono text-sm font-bold text-ink-950 dark:text-foreground">{value || '…'}</p>
      </div>
      <button
        type="button"
        disabled={!value}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard can be blocked; the value is on screen to copy by hand.
          }
        }}
        className="inline-flex min-h-[40px] shrink-0 items-center gap-1 border-2 border-ink-200 px-2.5 font-mono text-2xs uppercase hover:border-teal dark:border-border"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function money(cents: number) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: PRICING_CURRENCY }).format(
    cents / 100,
  );
}

export default function NgoServicesPage() {
  const { user, isAuthenticated } = useAuth();
  const { organization, refetch } = useNgoPortalContext();
  const [payments, setPayments] = useState<OrganizationPayment[]>([]);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState<PaymentProductType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightBank, setHighlightBank] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const bankPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!organization?.id) return;
    let cancelled = false;
    setError(null);
    void (async () => {
      const failures: string[] = [];
      try {
        const ref = await ensurePaymentReference(organization.id);
        if (!cancelled) setReference(ref);
      } catch (err) {
        failures.push(captureError(err, { where: 'NgoServicesPage.paymentReference' }));
      }
      const { data, error: listError } = await supabase
        .from('organization_payments')
        .select('*')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (listError) {
        const msg = captureError(listError, { where: 'NgoServicesPage.payments' });
        failures.push(msg);
        setPaymentsError(msg);
      } else {
        setPaymentsError(null);
        setPayments((data ?? []) as OrganizationPayment[]);
      }
      setError(failures.length ? failures.join(' · ') : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [organization?.id]);

  if (!organization) return null;

  const membershipPaid = payments.some(
    (p) =>
      (p.product_type === 'membership_annual' || p.product_type === 'verification_annual') &&
      p.status === 'paid',
  );
  const packagePaid = payments.some(
    (p) => p.product_type === 'landing_standards_package' && p.status === 'paid',
  );
  const membershipPending = payments.find(
    (p) =>
      (p.product_type === 'membership_annual' || p.product_type === 'verification_annual') &&
      p.status === 'pending',
  );
  const packagePending = payments.find(
    (p) => p.product_type === 'landing_standards_package' && p.status === 'pending',
  );
  const paymentsUnknown = Boolean(paymentsError) && payments.length === 0;
  const pendingTransfers = payments.filter(
    (p) => p.status === 'pending' && p.payment_method === 'bank_transfer',
  );

  const reportSent = async (payment: OrganizationPayment) => {
    setReporting(payment.id);
    setError(null);
    const { error: reportError } = await reportBankTransferSent(payment.id);
    setReporting(null);
    if (reportError) {
      setError(reportError);
      return;
    }
    setMessage(
      `Thanks — we will look for ${money(payment.amount_cents)} with reference ${payment.bank_transfer_reference || reference} and confirm by email.`,
    );
    await refreshPayments();
  };

  const refreshPayments = async () => {
    const { data, error: listError } = await supabase
      .from('organization_payments')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });
    if (listError) {
      const msg = captureError(listError, { where: 'NgoServicesPage.refreshPayments' });
      setPaymentsError(msg);
      setError(msg);
      return;
    }
    setPaymentsError(null);
    setPayments((data ?? []) as OrganizationPayment[]);
    await refetch();
  };

  const showBankInstructions = (ref: string, statusText: string) => {
    setError(null);
    setReference(ref);
    setMessage(statusText);
    setHighlightBank(true);
    // Defer scroll so the status message has painted above the bank panel.
    window.requestAnimationFrame(() => {
      bankPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    window.setTimeout(() => setHighlightBank(false), 3500);
  };

  /** Already have a pending transfer — only re-show bank details (no new payment). */
  const showPendingBankAgain = (
    pending: OrganizationPayment,
    productType: PaymentProductType,
  ) => {
    const ref =
      pending.bank_transfer_reference?.trim() ||
      reference ||
      organization.payment_reference ||
      '';
    showBankInstructions(
      ref,
      `${PAYMENT_PRODUCT_LABELS[productType]} — transfer ${money(pending.amount_cents)} with reference ${ref || '…'}.`,
    );
  };

  const startPayment = async (productType: PaymentProductType) => {
    if (!isAuthenticated) {
      setError('Please sign in again to request payment instructions.');
      return;
    }

    setBusy(productType);
    setError(null);
    setMessage(null);

    const recordedBy = user?.email ?? user?.id ?? 'ngo_portal';

    try {
      const { payment, reference: ref, error: payError } = await createPendingBankPayment({
        organizationId: organization.id,
        productType,
        notes:
          productType === 'landing_standards_package'
            ? 'NGO requested trust landing package via portal'
            : 'NGO requested Reality Badge membership via portal',
        recordedBy,
      });

      if (payError) {
        setError(payError);
        return;
      }

      if (productType === 'landing_standards_package' && user?.id) {
        const { data: existingSetup, error: setupLookupError } = await supabase
          .from('ngo_setup_requests')
          .select('id')
          .eq('organization_id', organization.id)
          .eq('request_kind', 'landing_standards')
          .in('status', ['pending', 'in_review'])
          .limit(1)
          .maybeSingle();

        if (setupLookupError) {
          setError(
            `Payment ready, but we could not check existing setup requests: ${captureError(setupLookupError, { where: 'NgoServicesPage.setupLookup' })}`,
          );
        } else if (!existingSetup) {
          const { error: setupError } = await submitNgoSetupRequest({
            organizationId: organization.id,
            userId: user.id,
            hasExistingWebsite: Boolean(organization.website_url?.trim()),
            wantsLandingPackage: true,
            logoUrl: organization.logo_url ?? '',
            brandPrimary: organization.brand_primary ?? '',
            brandSecondary: organization.brand_secondary ?? '',
            notes: 'Requested with bank payment from Services page',
            questionnaire: {
              has_existing_website: Boolean(organization.website_url?.trim()),
              wants_landing_package: true,
            },
          });
          if (setupError) {
            // Payment is already queued — show bank details anyway, surface setup issue.
            setError(`Payment ready, but setup request failed: ${setupError}`);
          }
        }
      }

      const amountLabel = payment ? money(payment.amount_cents) : '';
      showBankInstructions(
        ref,
        payment
          ? `${PAYMENT_PRODUCT_LABELS[productType]} — transfer ${amountLabel} with reference ${ref}.`
          : `Use reference ${ref} on your bank transfer.`,
      );
      await refreshPayments();
    } catch (err) {
      setError(captureError(err, { where: 'NgoServicesPage.startPayment' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <NgoPortalPageShell
      title="Services & payment"
      path="/ngo/services"
    >
      <div className="space-y-6">
        <div
          ref={bankPanelRef}
          className={cn(
            'card-brutal space-y-4 border-l-4 border-l-teal p-5 transition-shadow scroll-mt-24',
            highlightBank && 'ring-2 ring-teal shadow-brutal',
          )}
        >
          <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider">
            <CreditCard size={14} /> Pay by bank transfer
          </h2>
          {message ? (
            <p className="rounded-md border-2 border-teal/40 bg-teal/5 px-3 py-2 text-sm text-teal" role="status">
              {message}
            </p>
          ) : null}

          <ol className="grid gap-2 text-sm text-ink-600 sm:grid-cols-3 dark:text-muted-foreground">
            <li><span className="font-mono font-bold text-ink-950 dark:text-foreground">1.</span> Choose a service below</li>
            <li><span className="font-mono font-bold text-ink-950 dark:text-foreground">2.</span> Transfer from your bank with the reference</li>
            <li><span className="font-mono font-bold text-ink-950 dark:text-foreground">3.</span> Press &ldquo;I&rsquo;ve made the payment&rdquo;</li>
          </ol>

          <div className="border-2 border-ink-100 px-3 dark:border-border">
            <CopyValue label="Account name" value={NGO_BANK_ACCOUNT.accountName} />
            <CopyValue label={`Account number (${NGO_BANK_ACCOUNT.bankName})`} value={NGO_BANK_ACCOUNT.accountNumber} />
            <CopyValue label="Reference — use exactly" value={reference} />
          </div>
          <p className="font-mono text-2xs text-ink-500">{BANK_TRANSFER_INSTRUCTIONS.referenceHint}</p>

          {pendingTransfers.length > 0 ? (
            <ul className="space-y-3">
              {pendingTransfers.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 border-2 border-gold/50 bg-gold-light/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-ink-950 dark:text-foreground">
                      {PAYMENT_PRODUCT_LABELS[p.product_type]} — {money(p.amount_cents)}
                    </p>
                    <p className="font-mono text-2xs text-ink-500">
                      Reference {p.bank_transfer_reference || reference || '…'}
                    </p>
                    {p.customer_reported_paid_at ? (
                      <p className="mt-1 text-xs text-teal">
                        You told us you paid on {formatNzDateTime(p.customer_reported_paid_at)}. We are
                        checking our bank account — usually within {BANK_TRANSFER_PROCESSING_BUSINESS_DAYS}{' '}
                        business days.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-ink-500">Waiting for your transfer.</p>
                    )}
                  </div>
                  {p.customer_reported_paid_at ? (
                    <span className="inline-flex min-h-[44px] shrink-0 items-center gap-2 font-mono text-2xs uppercase text-teal">
                      <CheckCircle size={14} aria-hidden /> Payment reported
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={reporting !== null}
                      onClick={() => void reportSent(p)}
                      className="btn-brutal-teal inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 px-4 text-xs"
                    >
                      <Send size={14} aria-hidden />
                      {reporting === p.id ? 'Sending…' : 'I’ve made the payment'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {error && (
          <p className="border-2 border-accent px-3 py-2 text-sm text-accent" role="alert">
            {error}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
          <div className="card-brutal flex h-full flex-col gap-4 p-5">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-teal" />
              <h3 className="font-black uppercase tracking-tight">Reality Badge membership</h3>
            </div>
            <p className="text-2xl font-black">
              {money(MEMBERSHIP_ANNUAL_CENTS)}{' '}
              <span className="text-sm font-mono font-normal text-ink-500">/ year {GST_PRICE_SUFFIX}</span>
            </p>
            <p className="flex-1 text-sm text-ink-600 dark:text-muted-foreground">
              Public trust standards review, Reality Badge when criteria pass, and website monitoring
              alerts.
            </p>
            <div className="mt-auto space-y-2">
              {membershipPaid ? (
                <p className="inline-flex min-h-[48px] items-center gap-2 text-sm font-semibold text-teal">
                  <CheckCircle size={16} /> Membership paid
                </p>
              ) : paymentsUnknown ? (
                <p className="min-h-[48px] text-sm text-accent" role="status">
                  Payment status could not be loaded.
                </p>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (membershipPending) {
                      showPendingBankAgain(membershipPending, 'membership_annual');
                      return;
                    }
                    void startPayment('membership_annual');
                  }}
                  className="btn-brutal-teal w-full min-h-[48px]"
                >
                  {busy === 'membership_annual'
                    ? 'Preparing…'
                    : membershipPending
                      ? 'Show bank instructions again'
                      : `Pay ${money(MEMBERSHIP_ANNUAL_CENTS)} by bank transfer`}
                </button>
              )}
              <p className="min-h-[2.75rem] font-mono text-2xs text-ink-500">
                {membershipPending && !membershipPaid
                  ? 'Pending — we will activate membership after we receive your transfer.'
                  : null}
              </p>
            </div>
          </div>

          <div className="card-brutal flex h-full flex-col gap-4 p-5">
            <div className="flex items-center gap-2">
              <Layout size={18} className="text-teal" />
              <h3 className="font-black uppercase tracking-tight">Trust landing page</h3>
            </div>
            <p className="text-2xl font-black">
              {money(LANDING_STANDARDS_PACKAGE_CENTS)}{' '}
              <span className="text-sm font-mono font-normal text-ink-500">one-off {GST_PRICE_SUFFIX}</span>
            </p>
            <p className="flex-1 text-sm text-ink-600 dark:text-muted-foreground">
              {LANDING_STANDARDS_PACKAGE_LABEL}. Membership is separate if you also want the badge.
            </p>
            <div className="mt-auto space-y-2">
              {packagePaid ? (
                <p className="inline-flex min-h-[48px] items-center gap-2 text-sm font-semibold text-teal">
                  <CheckCircle size={16} /> Package paid — our team will fulfill
                </p>
              ) : paymentsUnknown ? (
                <p className="min-h-[48px] text-sm text-accent" role="status">
                  Payment status could not be loaded.
                </p>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (packagePending) {
                      showPendingBankAgain(packagePending, 'landing_standards_package');
                      return;
                    }
                    void startPayment('landing_standards_package');
                  }}
                  className="btn-brutal-teal w-full min-h-[48px]"
                >
                  {busy === 'landing_standards_package'
                    ? 'Preparing…'
                    : packagePending
                      ? 'Show bank instructions again'
                      : `Pay ${money(LANDING_STANDARDS_PACKAGE_CENTS)} by bank transfer`}
                </button>
              )}
              <p className="min-h-[2.75rem] font-mono text-2xs text-ink-500">
                {packagePending && !packagePaid
                  ? 'Pending — a setup request is also queued for our team.'
                  : null}
              </p>
            </div>
          </div>
        </div>
      </div>
    </NgoPortalPageShell>
  );
}
