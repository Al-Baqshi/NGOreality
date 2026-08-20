import { useEffect, useState } from 'react';
import { useOrganizationPayments } from '../../hooks/useCrm';
import {
  BANK_TRANSFER_INSTRUCTIONS,
  ensurePaymentReference,
  hasActiveMembershipPayment,
  recordPayment,
} from '../../lib/payments';
import { isMonitorApiConfigured } from '../../lib/monitorApi';
import { MEMBERSHIP_ANNUAL_CENTS, MEMBERSHIP_LABEL, PRICING_CURRENCY } from '../../config/pricing';
import { LANDING_STANDARDS_PACKAGE_CENTS } from '../../config/customerProducts';
import { PAYMENT_PRODUCT_LABELS, PAYMENT_STATUS_LABELS } from '../../types';
import { CreditCard, Copy, Check } from 'lucide-react';

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(cents / 100);
}

export default function OrganizationPayments({
  organizationId,
  organizationName,
  paymentReference,
}: {
  organizationId: string;
  organizationName: string;
  paymentReference: string | null;
}) {
  const { payments, loading, refetch } = useOrganizationPayments(organizationId);
  const [reference, setReference] = useState(paymentReference ?? '');
  const [copied, setCopied] = useState(false);
  const [recording, setRecording] = useState(false);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (paymentReference) {
      setReference(paymentReference);
      return;
    }
    ensurePaymentReference(organizationId).then(setReference);
  }, [organizationId, paymentReference]);

  const copyReference = async () => {
    if (!reference) return;
    await navigator.clipboard.writeText(reference);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRecordMembership = async () => {
    setRecording(true);
    setMessage(null);
    const { error, message: resultMsg } = await recordPayment({
      organizationId,
      productType: 'membership_annual',
      paymentMethod: 'bank_transfer',
      status: 'paid',
      notes: notes.trim() || `Annual membership for ${organizationName}`,
    });
    setRecording(false);
    if (error) {
      setMessage(error);
    } else {
      setNotes('');
      let msg = resultMsg ?? 'Membership recorded — badge and monitoring updated.';
      if (isMonitorApiConfigured()) {
        msg += ' Welcome emails queued (send via Email notifications if still pending).';
      }
      setMessage(msg);
      refetch();
    }
  };

  const handleRecordPackage = async () => {
    setRecording(true);
    setMessage(null);
    const { error, message: resultMsg } = await recordPayment({
      organizationId,
      productType: 'landing_standards_package',
      paymentMethod: 'bank_transfer',
      status: 'paid',
      notes: notes.trim() || `Trust landing package for ${organizationName}`,
    });
    setRecording(false);
    if (error) {
      setMessage(error);
    } else {
      setNotes('');
      setMessage(resultMsg ?? 'Landing package recorded — fulfill via Setup requests.');
      refetch();
    }
  };

  const membershipActive = hasActiveMembershipPayment(payments);
  const latestMembership = payments.find(
    (p) =>
      (p.product_type === 'membership_annual' || p.product_type === 'verification_annual') &&
      p.status === 'paid',
  );
  const packagePaid = payments.some(
    (p) => p.product_type === 'landing_standards_package' && p.status === 'paid',
  );

  return (
    <div className="card-brutal">
      <div className="border-b-3 border-ink-950 px-4 py-3">
        <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
          <CreditCard size={14} /> Membership & packages
        </h3>
      </div>

      <div className="p-4 space-y-4 border-b border-ink-100">
        <div className="text-sm">
          <span className="label-brutal">Annual membership (NZ)</span>
          <p className="font-semibold text-lg mt-1">
            {formatMoney(MEMBERSHIP_ANNUAL_CENTS, PRICING_CURRENCY)} / year
          </p>
          <p className="text-xs text-ink-600 mt-2 leading-relaxed">{MEMBERSHIP_LABEL}</p>
          <ul className="text-xs text-ink-500 mt-2 list-disc pl-4 space-y-1">
            <li>Public trust standards review + Reality Badge (when criteria pass)</li>
            <li>Website monitoring with email alerts if site goes down</li>
            <li>Member portal for security checklist (repository, baseline, etc.)</li>
          </ul>
          <p className="font-mono text-2xs text-ink-500 mt-2">
            {membershipActive && latestMembership?.period_end
              ? `Paid · active until ${new Date(latestMembership.period_end).toLocaleDateString()}`
              : 'Not paid — record payment after bank transfer clears'}
          </p>
        </div>

        <div className="text-sm">
          <span className="label-brutal">Trust landing package</span>
          <p className="font-semibold text-lg mt-1">
            {formatMoney(LANDING_STANDARDS_PACKAGE_CENTS, PRICING_CURRENCY)} one-off
          </p>
          <p className="font-mono text-2xs text-ink-500 mt-2">
            {packagePaid
              ? 'Paid — fulfill via Setup / Registrations queue'
              : 'Record when the $650 transfer clears (does not activate membership)'}
          </p>
        </div>

        <div className="p-3 bg-ink-50 border-2 border-ink-200">
          <span className="label-brutal">Bank transfer reference</span>
          <p className="text-xs text-ink-600 mt-1 mb-2">
            Ask the NGO to use this code as payment reference (not only org name).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-sm font-bold px-2 py-1 bg-white border-2 border-ink-950">
              {reference || '…'}
            </code>
            <button
              type="button"
              onClick={copyReference}
              disabled={!reference}
              className="btn-brutal-outline text-2xs py-1.5 px-3 min-h-[44px] flex items-center gap-1"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="font-mono text-2xs text-ink-500 mt-2">
            {BANK_TRANSFER_INSTRUCTIONS.referenceHint} · Account: {BANK_TRANSFER_INSTRUCTIONS.accountName}
          </p>
        </div>

        <textarea
          className="input-brutal w-full text-base min-h-[72px]"
          placeholder="Payment notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={recording}
            onClick={handleRecordMembership}
            className="btn-brutal-teal text-xs min-h-[48px] px-6"
          >
            {recording
              ? 'Saving…'
              : `Record membership paid (${formatMoney(MEMBERSHIP_ANNUAL_CENTS, PRICING_CURRENCY)})`}
          </button>
          <button
            type="button"
            disabled={recording}
            onClick={handleRecordPackage}
            className="btn-brutal-outline text-xs min-h-[48px] px-6"
          >
            {recording
              ? 'Saving…'
              : `Record landing package paid (${formatMoney(LANDING_STANDARDS_PACKAGE_CENTS, PRICING_CURRENCY)})`}
          </button>
        </div>
        {message && (
          <p
            className={`font-mono text-2xs ${
              message.includes('error') || message.includes('fail') ? 'text-accent' : 'text-teal'
            }`}
          >
            {message}
          </p>
        )}
      </div>

      <div className="divide-y divide-ink-100">
        {loading ? (
          <p className="p-4 font-mono text-2xs text-ink-400">Loading payments…</p>
        ) : payments.length === 0 ? (
          <p className="p-4 text-sm text-ink-400">No payments recorded yet.</p>
        ) : (
          payments.map((p) => (
            <div
              key={p.id}
              className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm"
            >
              <span className="font-medium">{PAYMENT_PRODUCT_LABELS[p.product_type] ?? p.product_type}</span>
              <span>{formatMoney(p.amount_cents, p.currency)}</span>
              <span className="font-mono text-2xs uppercase">{PAYMENT_STATUS_LABELS[p.status]}</span>
              <span className="font-mono text-2xs text-ink-400 sm:ml-auto">
                {p.paid_at ? new Date(p.paid_at).toLocaleString() : '—'} · {p.payment_method}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
