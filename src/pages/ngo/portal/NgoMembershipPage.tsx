import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calendar, CheckCircle, Clock, RotateCcw, ShieldCheck } from 'lucide-react';
import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import { supabase } from '../../../lib/supabase';
import {
  daysUntilExpiry,
  formatMembershipDate,
  getLatestMembership,
  getMembershipDisplayStatus,
  MEMBERSHIP_STATUS_LABELS,
} from '../../../lib/membership';
import { GST_PRICE_SUFFIX, MEMBERSHIP_ANNUAL_CENTS, PRICING_CURRENCY } from '../../../config/pricing';
import { PAYMENT_STATUS_LABELS, type OrganizationPayment } from '../../../types';
import NgoPortalPageShell from '../../../components/ngo/NgoPortalPageShell';
import NgoBillingTopUpPanel from '../../../components/ngo/NgoBillingTopUpPanel';
import { captureEmptyMutation, captureError } from '../../../lib/errorReporting';
import { createPendingBankPayment } from '../../../lib/payments';
import { cn } from '@/lib/utils';

const STATUS_STYLES = {
  active: 'border-teal bg-teal-light text-teal',
  expiring_soon: 'border-amber-400 bg-amber-50 text-amber-800',
  expired: 'border-accent bg-accent-light text-accent',
  pending_renewal: 'border-ink-400 bg-ink-50 text-ink-700',
  none: 'border-ink-200 bg-ink-50 text-ink-500',
};

export default function NgoMembershipPage() {
  const { organization, memberships, refetch, error: portalError } = useNgoPortalContext();
  const [payments, setPayments] = useState<OrganizationPayment[]>([]);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [autoRenewKnown, setAutoRenewKnown] = useState(false);
  const [autoRenewLoading, setAutoRenewLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!organization?.id) return;
    setActionError(null);
    supabase
      .from('organization_payments')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          const msg = captureError(error, { where: 'NgoMembershipPage.payments' });
          setPaymentsError(msg);
          setActionError((prev) => [prev, msg].filter(Boolean).join(' · '));
          return;
        }
        setPaymentsError(null);
        setPayments((data ?? []) as OrganizationPayment[]);
      });

    supabase
      .from('organizations')
      .select('auto_renew_membership')
      .eq('id', organization.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setAutoRenewKnown(false);
          setActionError((prev) =>
            [prev, captureError(error, { where: 'NgoMembershipPage.autoRenew' })].filter(Boolean).join(' · '),
          );
          return;
        }
        setAutoRenewKnown(true);
        if (data && typeof data.auto_renew_membership === 'boolean') {
          setAutoRenew(data.auto_renew_membership);
        }
      });
  }, [organization?.id]);

  const latestMembership = getLatestMembership(memberships);
  const membershipStatus = getMembershipDisplayStatus(latestMembership);
  const membershipPrice = `${new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: PRICING_CURRENCY,
  }).format(MEMBERSHIP_ANNUAL_CENTS / 100)} ${GST_PRICE_SUFFIX}`;

  const pendingPayment = payments.find(
    (p) =>
      (p.product_type === 'membership_annual' || p.product_type === 'verification_annual') &&
      p.status === 'pending',
  );
  const paymentsUnknown = Boolean(paymentsError) && payments.length === 0;

  const handleAutoRenewToggle = async (newValue: boolean) => {
    if (!organization) return;
    setAutoRenewLoading(true);
    const { data, error } = await supabase
      .from('organizations')
      .update({ auto_renew_membership: newValue, updated_at: new Date().toISOString() })
      .eq('id', organization.id)
      .select('id');
    setAutoRenewLoading(false);
    if (error) {
      setAutoRenew(!newValue);
      setActionError(captureError(error, { where: 'NgoMembershipPage.autoRenewToggle' }));
    } else if (!data?.length) {
      setAutoRenew(!newValue);
      setActionError(captureEmptyMutation('NgoMembershipPage.autoRenewToggle.empty'));
    } else {
      setActionError(null);
      setAutoRenew(newValue);
    }
  };

  const handleManualRenew = async () => {
    if (!organization) return;
    if (paymentsError) {
      setActionError(
        paymentsUnknown
          ? 'Payment status could not be loaded. Refresh and try again before starting another transfer.'
          : 'Payment status could not be refreshed. Refresh and try again before starting another transfer.',
      );
      return;
    }
    if (pendingPayment) {
      setActionError('A membership payment is already waiting for confirmation. Do not start another transfer.');
      return;
    }
    const { payment, error: payError } = await createPendingBankPayment({
      organizationId: organization.id,
      productType: 'membership_annual',
      notes: 'Manual renewal initiated by organization',
    });
    if (payError) {
      setActionError(payError);
      return;
    }
    setActionError(null);
    if (payment) {
      setPayments((prev) => [payment, ...prev.filter((p) => p.id !== payment.id)]);
    }
    refetch();
  };

  if (!organization) return null;

  return (
    <NgoPortalPageShell title="Membership" path="/ngo/membership">
      <div className="space-y-6">
        {actionError && (
          <p className="text-sm text-accent border-2 border-accent px-3 py-2">{actionError}</p>
        )}
        <div className="card-brutal p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-teal" aria-hidden />
              <h2 className="text-lg font-black uppercase tracking-tight">Annual membership</h2>
            </div>
            <span
              className={`inline-flex items-center gap-1 border font-mono text-2xs font-semibold uppercase tracking-wider px-2.5 py-1 ${STATUS_STYLES[membershipStatus]}`}
            >
              {membershipStatus === 'active' && <CheckCircle size={12} />}
              {membershipStatus === 'expiring_soon' && <Clock size={12} />}
              {(membershipStatus === 'expired' || membershipStatus === 'none') && <AlertTriangle size={12} />}
              {MEMBERSHIP_STATUS_LABELS[membershipStatus]}
            </span>
          </div>

          {latestMembership ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="label-brutal text-ink-400">Member since</dt>
                  <dd className="font-semibold text-ink-950">{formatMembershipDate(latestMembership.started_at)}</dd>
                </div>
                <div>
                  <dt className="label-brutal text-ink-400">Expires on</dt>
                  <dd className="font-semibold text-ink-950 flex items-center gap-2">
                    <span>{formatMembershipDate(latestMembership.expires_at)}</span>
                    {membershipStatus === 'expiring_soon' && (
                      <span className="text-xs text-amber-700 font-mono bg-amber-50 px-2 py-1 border border-amber-200">
                        {daysUntilExpiry(latestMembership.expires_at)} days remaining
                      </span>
                    )}
                    {membershipStatus === 'expired' && (
                      <span className="text-xs text-accent font-mono bg-accent-light px-2 py-1 border border-accent/20">
                        Expired
                      </span>
                    )}
                    {membershipStatus === 'active' && daysUntilExpiry(latestMembership.expires_at) > 60 && (
                      <span className="text-xs text-teal font-mono bg-teal-light px-2 py-1 border border-teal/20">
                        Active
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="border-2 border-ink-950 bg-ink-50 p-4 dark:border-border dark:bg-ink-800/50">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <ShieldCheck size={20} className="mt-0.5 shrink-0 text-teal" aria-hidden />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink-950 dark:text-white">
                          Auto-renew
                        </p>
                        <span
                          className={
                            !autoRenewKnown
                              ? 'border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-2xs font-semibold uppercase tracking-wider text-amber-800'
                              : autoRenew
                                ? 'border border-teal/40 bg-teal-light px-2 py-0.5 font-mono text-2xs font-semibold uppercase tracking-wider text-teal'
                                : 'border border-ink-300 bg-white px-2 py-0.5 font-mono text-2xs font-semibold uppercase tracking-wider text-ink-500'
                          }
                        >
                          {!autoRenewKnown ? 'Unknown' : autoRenew ? 'On' : 'Off'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                        {!autoRenewKnown
                          ? 'Could not load whether auto-renew is on. Refresh the page or try again.'
                          : autoRenew
                            ? `When on, we renew your membership and charge ${membershipPrice} before expiry.`
                            : `When off, you renew manually.`}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoRenewKnown ? autoRenew : undefined}
                    aria-label={
                      !autoRenewKnown
                        ? 'Auto-renew setting could not be loaded'
                        : autoRenew
                          ? 'Turn auto-renew off'
                          : 'Turn auto-renew on'
                    }
                    disabled={
                      autoRenewLoading ||
                      !autoRenewKnown ||
                      membershipStatus === 'none' ||
                      membershipStatus === 'expired'
                    }
                    onClick={() => void handleAutoRenewToggle(!autoRenew)}
                    className={cn(
                      'relative inline-flex h-9 w-[3.75rem] shrink-0 items-center rounded-full border-2 border-ink-950 transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      autoRenew ? 'bg-teal' : 'bg-ink-200 dark:bg-ink-700',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none absolute top-0.5 size-7 rounded-full border-2 border-ink-950 bg-white transition-transform',
                        autoRenew ? 'left-[calc(100%-1.875rem)]' : 'left-0.5',
                      )}
                      aria-hidden
                    />
                    <span className="sr-only">{autoRenew ? 'On' : 'Off'}</span>
                  </button>
                </div>
                {autoRenewKnown && autoRenew ? (
                  <p className="mt-3 flex items-center gap-1.5 font-mono text-xs text-teal">
                    <RotateCcw size={12} aria-hidden />
                    Will renew automatically before{' '}
                    {formatMembershipDate(latestMembership.expires_at)}.
                  </p>
                ) : autoRenewKnown && membershipStatus !== 'none' && membershipStatus !== 'expired' ? (
                  <p className="mt-3 font-mono text-xs text-ink-500">
                    Manual renewal needed before{' '}
                    {formatMembershipDate(latestMembership.expires_at)} to avoid interruption.
                  </p>
                ) : null}
                {(membershipStatus === 'none' || membershipStatus === 'expired') && (
                  <p className="mt-3 font-mono text-xs text-ink-500">
                    Auto-renew unlocks once you have an active membership.
                  </p>
                )}
              </div>

              {(membershipStatus === 'expired' || membershipStatus === 'expiring_soon' || membershipStatus === 'none') && (
                paymentsError && !pendingPayment ? (
                  <div className="mt-4 p-3 border-2 border-accent bg-accent-light text-sm">
                    <p className="font-semibold text-accent">Payment status could not be loaded</p>
                    <p className="text-xs text-ink-700 mt-1">
                      Refresh the page before starting another transfer so we do not queue a duplicate payment.
                    </p>
                  </div>
                ) : pendingPayment ? null : (
                <div className="mt-4 p-3 border-2 border-teal bg-teal-light text-sm">
                  <p className="font-semibold text-teal">Renew now</p>
                  <p className="text-xs text-ink-700 mt-1">
                    Your membership {membershipStatus === 'expired' ? 'has expired' : 'expires soon'}. Click below to initiate a manual renewal payment.
                  </p>
                  <button
                    type="button"
                    onClick={handleManualRenew}
                    className="btn-brutal-teal mt-2 min-h-[44px] px-6"
                  >
                    Renew membership ({membershipPrice})
                  </button>
                </div>
                )
              )}
            </div>
          ) : portalError ? (
            <p className="text-sm text-ink-500">Membership records could not be loaded.</p>
          ) : (
            <p className="text-sm text-ink-500">
              No active membership on file yet. Submit a{' '}
              <Link to="/ngo/requests" className="font-semibold underline">
                verification request
              </Link>{' '}
              and pay using the bank reference below (or Paymark / Airwallex when available).
            </p>
          )}

          {pendingPayment && (
            <div className="mt-4 p-3 border-2 border-amber-300 bg-amber-50 text-sm">
              <p className="font-semibold text-amber-900">Payment awaiting confirmation</p>
              <p className="text-xs text-amber-800 mt-1">
                We are waiting for your {pendingPayment.payment_method.replace('_', ' ')} (
                {PAYMENT_STATUS_LABELS[pendingPayment.status]}). Reference:{' '}
                <span className="font-mono font-bold">{organization.payment_reference ?? pendingPayment.bank_transfer_reference}</span>
              </p>
            </div>
          )}

          <p className="text-xs text-ink-400 mt-4 leading-relaxed">
            Annual membership is {membershipPrice} (NZD) and unlocks website monitoring and the member portal.
            The Reality Badge is separate: it issues automatically only after membership is active and all
            public trust standards pass.
          </p>
          {(membershipStatus === 'active' || membershipStatus === 'expiring_soon') && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 mt-3 leading-relaxed">
              Membership active — badge may still be pending standards. That is expected until review is complete.
              See{' '}
              <Link to="/ngo/badge" className="font-semibold underline">
                Reality Badge
              </Link>
              .
            </p>
          )}
        </div>

        <div className="card-brutal p-5 sm:p-6">
          <h2 className="text-lg font-black uppercase tracking-tight mb-4">Billing & top-up</h2>
          <NgoBillingTopUpPanel
            organizationId={organization.id}
            paymentReference={organization.payment_reference}
            showMembershipAmount={false}
          />
        </div>
      </div>
    </NgoPortalPageShell>
  );
}