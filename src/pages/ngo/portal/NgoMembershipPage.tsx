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
import { cn } from '@/lib/utils';

const STATUS_STYLES = {
  active: 'border-teal bg-teal-light text-teal',
  expiring_soon: 'border-amber-400 bg-amber-50 text-amber-800',
  expired: 'border-accent bg-accent-light text-accent',
  pending_renewal: 'border-ink-400 bg-ink-50 text-ink-700',
  none: 'border-ink-200 bg-ink-50 text-ink-500',
};

export default function NgoMembershipPage() {
  const { organization, memberships, refetch } = useNgoPortalContext();
  const [payments, setPayments] = useState<OrganizationPayment[]>([]);
  const [autoRenew, setAutoRenew] = useState(false);
  const [autoRenewLoading, setAutoRenewLoading] = useState(false);

  useEffect(() => {
    if (!organization?.id) return;
    supabase
      .from('organization_payments')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setPayments(data as OrganizationPayment[]);
      });

    supabase
      .from('organizations')
      .select('auto_renew_membership')
      .eq('id', organization.id)
      .single()
      .then(({ data }) => {
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

  const handleAutoRenewToggle = async (newValue: boolean) => {
    if (!organization) return;
    setAutoRenewLoading(true);
    const { error } = await supabase
      .from('organizations')
      .update({ auto_renew_membership: newValue, updated_at: new Date().toISOString() })
      .eq('id', organization.id);
    setAutoRenewLoading(false);
    if (error) {
      setAutoRenew(!newValue);
      alert('Failed to update auto-renew preference: ' + error.message);
    } else {
      setAutoRenew(newValue);
    }
  };

  const handleManualRenew = async () => {
    if (!organization) return;
    const { error } = await supabase
      .from('organization_payments')
      .insert({
        organization_id: organization.id,
        product_type: 'membership_annual',
        amount_cents: MEMBERSHIP_ANNUAL_CENTS,
        currency: PRICING_CURRENCY,
        status: 'pending',
        payment_method: 'bank_transfer',
        bank_transfer_reference: organization.payment_reference,
        period_start: new Date().toISOString().split('T')[0],
        period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        notes: 'Manual renewal initiated by organization',
        recorded_by: organization.id,
      });
    if (error) {
      alert('Failed to initiate renewal: ' + error.message);
    } else {
      refetch();
    }
  };

  if (!organization) return null;

  return (
    <NgoPortalPageShell title="Membership" path="/ngo/membership">
      <div className="space-y-6">
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
                            autoRenew
                              ? 'border border-teal/40 bg-teal-light px-2 py-0.5 font-mono text-2xs font-semibold uppercase tracking-wider text-teal'
                              : 'border border-ink-300 bg-white px-2 py-0.5 font-mono text-2xs font-semibold uppercase tracking-wider text-ink-500'
                          }
                        >
                          {autoRenew ? 'On' : 'Off'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                        When on, we renew your membership and charge {membershipPrice} before
                        expiry. When off, you renew manually.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoRenew}
                    aria-label={autoRenew ? 'Turn auto-renew off' : 'Turn auto-renew on'}
                    disabled={
                      autoRenewLoading ||
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
                {autoRenew ? (
                  <p className="mt-3 flex items-center gap-1.5 font-mono text-xs text-teal">
                    <RotateCcw size={12} aria-hidden />
                    Will renew automatically before{' '}
                    {formatMembershipDate(latestMembership.expires_at)}.
                  </p>
                ) : membershipStatus !== 'none' && membershipStatus !== 'expired' ? (
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
              )}
            </div>
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