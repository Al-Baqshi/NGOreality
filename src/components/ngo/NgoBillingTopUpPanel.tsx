import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Copy, Check, CreditCard, Landmark, Wallet } from 'lucide-react';
import { ensurePaymentReference } from '../../lib/payments';
import { bankTransferDetailsConfigured, bankTransferLines, MEMBERSHIP_TOP_UP_AMOUNT_LABEL } from '../../lib/ngoBilling';
import {
  AIRWALLET_AVAILABLE,
  BANK_TRANSFER_PROCESSING_BUSINESS_DAYS,
  STRIPE_CHECKOUT_AVAILABLE,
} from '../../config/billing';

type NgoBillingTopUpPanelProps = {
  organizationId: string;
  paymentReference?: string | null;
  compact?: boolean;
  showMembershipAmount?: boolean;
};

export default function NgoBillingTopUpPanel({
  organizationId,
  paymentReference,
  compact = false,
  showMembershipAmount = true,
}: NgoBillingTopUpPanelProps) {
  const [reference, setReference] = useState(paymentReference ?? '');
  const [copied, setCopied] = useState(false);

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

  const bankLines = bankTransferLines();
  const hasBankDetails = bankTransferDetailsConfigured();

  return (
    <div className={`space-y-4 ${compact ? '' : 'border-2 border-ink-200 p-4 sm:p-5 bg-ink-50'}`}>
      <div className="flex items-start gap-2">
        <Landmark size={18} className="text-teal shrink-0 mt-0.5" aria-hidden />
        <div>
          <h3 className="text-sm font-black uppercase tracking-tight">Top up / pay membership</h3>
          {showMembershipAmount && (
            <p className="text-xs text-ink-600 mt-1 leading-relaxed">
              Annual membership is {MEMBERSHIP_TOP_UP_AMOUNT_LABEL} (NZD), including trust review, Reality Badge (when
              standards pass), and website monitoring.
            </p>
          )}
        </div>
      </div>

      <div className="p-3 bg-white border-2 border-ink-950">
        <span className="label-brutal">Your payment reference</span>
        <p className="text-xs text-ink-600 mt-1 mb-2">
          Put this exact code in your bank transfer reference field so we can match your payment manually.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-sm font-bold px-2 py-1.5 bg-ink-50 border-2 border-ink-200">
            {reference || '…'}
          </code>
          <button
            type="button"
            onClick={copyReference}
            disabled={!reference}
            className="btn-brutal-outline text-2xs py-2 px-3 min-h-[44px] flex items-center gap-1"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy reference'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="label-brutal flex items-center gap-1">
          <Building2 size={12} /> Bank transfer
        </p>
        {hasBankDetails ? (
          <dl className="text-sm space-y-1.5">
            {bankLines.map((line) => (
              <div key={line.label} className="flex flex-col sm:flex-row sm:gap-2">
                <dt className="font-mono text-2xs uppercase text-ink-400 sm:w-32 shrink-0">{line.label}</dt>
                <dd className="font-semibold font-mono text-xs">{line.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-ink-500 leading-relaxed">
            Bank account details are being finalised. Use your payment reference above when you transfer — our team will
            confirm by email.
          </p>
        )}
        <p className="text-xs text-ink-500 leading-relaxed">
          After we receive your transfer, allow up to {BANK_TRANSFER_PROCESSING_BUSINESS_DAYS} business days for the
          payment to be applied to your membership wallet. We process bank payments manually.
        </p>
      </div>

      <div className="border-t border-ink-200 pt-4 space-y-2">
        <p className="label-brutal">Other ways to pay</p>
        <ul className="text-xs text-ink-600 space-y-2">
          <li className="flex items-start gap-2">
            <CreditCard size={14} className="shrink-0 mt-0.5 text-ink-400" aria-hidden />
            <span>
              <strong className="text-ink-950">Stripe (card)</strong>
              {STRIPE_CHECKOUT_AVAILABLE
                ? ' — available soon from this portal.'
                : ' — coming soon once our payment verification is complete.'}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Wallet size={14} className="shrink-0 mt-0.5 text-ink-400" aria-hidden />
            <span>
              <strong className="text-ink-950">Airwallet</strong>
              {AIRWALLET_AVAILABLE
                ? ' — connect your wallet from Membership when enabled.'
                : ' — we are enabling this shortly.'}
            </span>
          </li>
        </ul>
      </div>

      {!compact && (
        <p className="text-2xs text-ink-400 font-mono leading-relaxed">
          Questions? Reply to any NGOreality email or visit{' '}
          <Link to="/ngo/notifications" className="underline text-teal">
            Notifications
          </Link>
          .
        </p>
      )}
    </div>
  );
}
