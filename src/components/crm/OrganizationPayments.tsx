import { useEffect, useState } from 'react';
import { useOrganizationPayments } from '../../hooks/useCrm';
import { BANK_TRANSFER_INSTRUCTIONS, ensurePaymentReference, recordPayment } from '../../lib/payments';
import {
  MONITORING_MONTHLY_CENTS,
  PRICING_CURRENCY,
  VERIFICATION_ANNUAL_CENTS,
} from '../../config/pricing';
import {
  PAYMENT_PRODUCT_LABELS,
  PAYMENT_STATUS_LABELS,
  type PaymentProductType,
} from '../../types';
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
  const [recording, setRecording] = useState<PaymentProductType | null>(null);
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

  const handleRecordPaid = async (productType: PaymentProductType) => {
    setRecording(productType);
    setMessage(null);
    const { error } = await recordPayment({
      organizationId,
      productType,
      paymentMethod: 'bank_transfer',
      status: 'paid',
      notes: notes.trim() || `Bank transfer recorded for ${organizationName}`,
    });
    setRecording(null);
    if (error) {
      setMessage(error);
    } else {
      setNotes('');
      setMessage('Payment recorded');
      refetch();
    }
  };

  const latestVerification = payments.find(
    (p) => p.product_type === 'verification_annual' && p.status === 'paid',
  );
  const activeMonitoring = payments.find(
    (p) =>
      p.product_type === 'monitoring_monthly' &&
      p.status === 'paid' &&
      p.period_end &&
      new Date(p.period_end) > new Date(),
  );

  return (
    <div className="card-brutal">
      <div className="border-b-3 border-ink-950 px-4 py-3">
        <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
          <CreditCard size={14} /> Payments
        </h3>
      </div>

      <div className="p-4 space-y-4 border-b border-ink-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="label-brutal">Reality Badge</span>
            <p className="font-semibold">{formatMoney(VERIFICATION_ANNUAL_CENTS, PRICING_CURRENCY)} / year</p>
            <p className="font-mono text-2xs text-ink-500 mt-1">
              {latestVerification
                ? `Paid · covers until ${latestVerification.period_end ? new Date(latestVerification.period_end).toLocaleDateString() : '—'}`
                : 'Not paid this period'}
            </p>
          </div>
          <div>
            <span className="label-brutal">Monitoring (optional)</span>
            <p className="font-semibold">{formatMoney(MONITORING_MONTHLY_CENTS, PRICING_CURRENCY)} / month</p>
            <p className="font-mono text-2xs text-ink-500 mt-1">
              {activeMonitoring
                ? `Active until ${activeMonitoring.period_end ? new Date(activeMonitoring.period_end).toLocaleDateString() : '—'}`
                : 'No active monitoring — badge year does not include uptime alerts'}
            </p>
          </div>
        </div>

        <div className="p-3 bg-ink-50 border-2 border-ink-200">
          <span className="label-brutal">Bank transfer reference</span>
          <p className="text-xs text-ink-600 mt-1 mb-2">
            Ask the NGO to use this code as payment reference (not only org name). Matches bank deposits in CRM.
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

        <p className="font-mono text-2xs text-ink-500">
          Stripe checkout (card) — connect VITE_STRIPE_PUBLISHABLE_KEY and a checkout edge function next; until then
          record bank transfers below.
        </p>

        <textarea
          className="input-brutal w-full text-base min-h-[72px]"
          placeholder="Payment notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={recording !== null}
            onClick={() => handleRecordPaid('verification_annual')}
            className="btn-brutal-teal text-xs flex-1 min-h-[44px]"
          >
            {recording === 'verification_annual' ? 'Saving…' : 'Record badge paid ($50)'}
          </button>
          <button
            type="button"
            disabled={recording !== null}
            onClick={() => handleRecordPaid('monitoring_monthly')}
            className="btn-brutal-outline text-xs flex-1 min-h-[44px]"
          >
            {recording === 'monitoring_monthly' ? 'Saving…' : 'Record monitoring paid ($13)'}
          </button>
        </div>
        {message && <p className="font-mono text-2xs text-teal">{message}</p>}
      </div>

      <div className="divide-y divide-ink-100">
        {loading ? (
          <p className="p-4 font-mono text-2xs text-ink-400">Loading payments…</p>
        ) : payments.length === 0 ? (
          <p className="p-4 text-sm text-ink-400">No payments recorded yet.</p>
        ) : (
          payments.map((p) => (
            <div key={p.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
              <span className="font-medium">{PAYMENT_PRODUCT_LABELS[p.product_type]}</span>
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
