import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calendar, CheckCircle, Clock } from 'lucide-react';
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

const STATUS_STYLES = {
  active: 'border-teal bg-teal-light text-teal',
  expiring_soon: 'border-amber-400 bg-amber-50 text-amber-800',
  expired: 'border-accent bg-accent-light text-accent',
  pending_renewal: 'border-ink-400 bg-ink-50 text-ink-700',
  none: 'border-ink-200 bg-ink-50 text-ink-500',
};

export default function NgoMembershipPage() {
  const { organization, memberships } = useNgoPortalContext();
  const [payments, setPayments] = useState<OrganizationPayment[]>([]);

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
  }, [organization?.id]);

  const latestMembership = getLatestMembership(memberships);
  const membershipStatus = getMembershipDisplayStatus(latestMembership);
  // Always rendered with its GST status attached — a bare number here is how a
  // customer ends up believing the price was tax-inclusive when it was not.
  const membershipPrice = `${new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: PRICING_CURRENCY,
  }).format(MEMBERSHIP_ANNUAL_CENTS / 100)} ${GST_PRICE_SUFFIX}`;

  const pendingPayment = payments.find(
    (p) =>
      (p.product_type === 'membership_annual' || p.product_type === 'verification_annual') &&
      p.status === 'pending',
  );

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
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="label-brutal text-ink-400">Member since</dt>
                <dd className="font-semibold text-ink-950">{formatMembershipDate(latestMembership.started_at)}</dd>
              </div>
              <div>
                <dt className="label-brutal text-ink-400">Renews / expired</dt>
                <dd className="font-semibold text-ink-950">
                  {formatMembershipDate(latestMembership.expires_at)}
                  {membershipStatus === 'expiring_soon' && (
                    <span className="block text-xs text-amber-700 font-mono mt-1">
                      {daysUntilExpiry(latestMembership.expires_at)} days remaining
                    </span>
                  )}
                </dd>
              </div>
            </dl>
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
            Annual membership is {membershipPrice} (NZD) and includes the Reality Badge, public trust review, and website
            monitoring with email alerts.
          </p>
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
