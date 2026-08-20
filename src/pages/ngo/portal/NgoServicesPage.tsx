import { useEffect, useRef, useState } from 'react';
import { CheckCircle, CreditCard, Layout, Shield } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import NgoPortalPageShell from '../../../components/ngo/NgoPortalPageShell';
import {
  BANK_TRANSFER_INSTRUCTIONS,
  createPendingBankPayment,
  ensurePaymentReference,
} from '../../../lib/payments';
import { submitNgoSetupRequest } from '../../../lib/ngoSetupRequests';
import { MEMBERSHIP_ANNUAL_CENTS, GST_PRICE_SUFFIX, PRICING_CURRENCY } from '../../../config/pricing';
import {
  LANDING_STANDARDS_PACKAGE_CENTS,
  LANDING_STANDARDS_PACKAGE_LABEL,
} from '../../../config/customerProducts';
import { NGO_BANK_ACCOUNT } from '../../../config/billing';
import { PAYMENT_PRODUCT_LABELS, type OrganizationPayment, type PaymentProductType } from '../../../types';
import { supabase } from '../../../lib/supabase';
import { cn } from '@/lib/utils';

function money(cents: number) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: PRICING_CURRENCY }).format(
    cents / 100,
  );
}

export default function NgoServicesPage() {
  const { user, centralUser, isAuthenticated } = useAuth();
  const { organization, refetch } = useNgoPortalContext();
  const [payments, setPayments] = useState<OrganizationPayment[]>([]);
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState<PaymentProductType | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightBank, setHighlightBank] = useState(false);
  const bankPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!organization?.id) return;
    void ensurePaymentReference(organization.id).then(setReference);
    void supabase
      .from('organization_payments')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setPayments(data as OrganizationPayment[]);
      });
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

  const refreshPayments = async () => {
    const { data } = await supabase
      .from('organization_payments')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false });
    if (data) setPayments(data as OrganizationPayment[]);
    await refetch();
  };

  const showBankInstructions = (ref: string, statusText: string) => {
    setReference(ref);
    setMessage(statusText);
    setHighlightBank(true);
    bankPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => setHighlightBank(false), 2500);
  };

  const startPayment = async (productType: PaymentProductType) => {
    if (!isAuthenticated) {
      setError('Please sign in again to request payment instructions.');
      return;
    }

    setBusy(productType);
    setError(null);
    setMessage(null);

    const recordedBy = user?.email ?? centralUser?.email ?? user?.id ?? centralUser?.id ?? 'ngo_portal';

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
        const { data: existingSetup } = await supabase
          .from('ngo_setup_requests')
          .select('id')
          .eq('organization_id', organization.id)
          .eq('request_kind', 'landing_standards')
          .in('status', ['pending', 'in_review'])
          .limit(1)
          .maybeSingle();

        if (!existingSetup) {
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
      setError(err instanceof Error ? err.message : 'Could not prepare payment instructions.');
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
            'card-brutal space-y-3 border-l-4 border-l-teal p-5 transition-shadow',
            highlightBank && 'ring-2 ring-teal shadow-brutal',
          )}
        >
          <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider">
            <CreditCard size={14} /> Bank transfer
          </h2>
          <p className="text-sm text-ink-600 dark:text-muted-foreground">
            Pay to <strong>{NGO_BANK_ACCOUNT.accountName}</strong> ({NGO_BANK_ACCOUNT.bankName}){' '}
            <code className="font-mono font-bold">{NGO_BANK_ACCOUNT.accountNumber}</code>. Use this
            reference exactly: <code className="font-mono font-bold">{reference || '…'}</code>
          </p>
          <p className="font-mono text-2xs text-ink-500">{BANK_TRANSFER_INSTRUCTIONS.referenceHint}</p>
        </div>

        {error && (
          <p className="border-2 border-accent px-3 py-2 text-sm text-accent" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="border-2 border-teal/40 bg-teal/5 px-3 py-2 text-sm text-teal" role="status">
            {message}
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
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void startPayment('membership_annual')}
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
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void startPayment('landing_standards_package')}
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
