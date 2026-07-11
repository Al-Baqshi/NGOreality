import { Link } from 'react-router-dom';
import { CheckCircle, X } from 'lucide-react';
import { PUBLIC_BADGE_CRITERIA } from '../../types';
import { VERIFICATION_REVIEW_BUSINESS_DAYS_LABEL } from '../../config/billing';
import { BADGE_REQUEST_TYPE_LABELS, type BadgeRequestType } from '../../types';
import NgoBillingTopUpPanel from './NgoBillingTopUpPanel';

type VerificationSubmittedDialogProps = {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  organizationName: string;
  paymentReference: string | null;
  requestType: BadgeRequestType;
};

export default function VerificationSubmittedDialog({
  open,
  onClose,
  organizationId,
  organizationName,
  paymentReference,
  requestType,
}: VerificationSubmittedDialogProps) {
  if (!open) return null;

  const requestLabel = BADGE_REQUEST_TYPE_LABELS[requestType];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink-950/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verification-submitted-title"
    >
      <div className="card-brutal w-full max-w-lg max-h-[92vh] overflow-y-auto sm:max-h-[90vh] border-t-4 border-t-teal">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b-2 border-ink-100 bg-white p-4 sm:p-5">
          <div className="flex items-start gap-3 min-w-0">
            <CheckCircle className="text-teal shrink-0" size={28} aria-hidden />
            <div className="min-w-0">
              <h2 id="verification-submitted-title" className="text-lg font-black uppercase tracking-tight">
                Thank you
              </h2>
              <p className="text-xs text-ink-500 mt-1 truncate">{organizationName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center border-2 border-ink-200 hover:border-ink-950"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-5">
          <p className="text-sm text-ink-600 leading-relaxed">
            Your <strong>{requestLabel}</strong> has been received. We will review your organisation against NGOreality
            public trust standards and get back to you if anything needs to be added, changed, or fixed on your site.
          </p>

          <div className="p-4 border-2 border-ink-200 bg-ink-50 space-y-2">
            <p className="label-brutal">What happens next</p>
            <ul className="text-xs text-ink-600 space-y-2 list-disc pl-4 leading-relaxed">
              <li>
                <strong className="text-ink-950">Standards review</strong> — typically {VERIFICATION_REVIEW_BUSINESS_DAYS_LABEL}{' '}
                after your profile and payment are in order.
              </li>
              <li>
                <strong className="text-ink-950">Reality Badge</strong> — issued when public trust standards pass and
                membership is active.
              </li>
              <li>
                <strong className="text-ink-950">Email</strong> — we sent a confirmation to your contact email (and queued
                it for delivery). Check spam if you do not see it within an hour.
              </li>
            </ul>
          </div>

          <section>
            <p className="label-brutal mb-2">Public trust standards we check</p>
            <p className="text-xs text-ink-500 mb-3">
              The same checklist our team uses in outreach — see your live progress in the portal.
            </p>
            <ul className="text-xs text-ink-600 space-y-1.5 mb-3">
              {PUBLIC_BADGE_CRITERIA.map((c) => (
                <li key={c.criterion_key} className="flex gap-2">
                  <span className="text-teal">·</span>
                  <span>{c.criterion_label}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/ngo/standards"
              onClick={onClose}
              className="text-xs font-semibold text-teal underline"
            >
              View your standards checklist →
            </Link>
          </section>

          <NgoBillingTopUpPanel
            organizationId={organizationId}
            paymentReference={paymentReference}
            compact
            showMembershipAmount
          />

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-brutal-teal w-full min-h-[48px]">
              Continue in portal
            </button>
            <Link
              to="/ngo/membership"
              onClick={onClose}
              className="btn-brutal-outline w-full min-h-[48px] flex items-center justify-center text-center"
            >
              Membership & billing
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
