import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import {
  BADGE_REQUEST_STATUS_LABELS,
  BADGE_REQUEST_TYPE_LABELS,
  type BadgeRequestType,
} from '../../../types';
import NgoPortalPageShell from '../../../components/ngo/NgoPortalPageShell';
import VerificationSubmittedDialog from '../../../components/ngo/VerificationSubmittedDialog';
import NgoBillingTopUpPanel from '../../../components/ngo/NgoBillingTopUpPanel';

export default function NgoRequestsPage() {
  const { organization, badgeRequests, submitBadgeRequest } = useNgoPortalContext();
  const [requestType, setRequestType] = useState<BadgeRequestType>('new_badge');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestError, setRequestError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successDialog, setSuccessDialog] = useState<{
    open: boolean;
    paymentReference: string | null;
    requestType: BadgeRequestType;
  }>({ open: false, paymentReference: null, requestType: 'new_badge' });

  const handleBadgeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;
    setRequestError('');
    setSubmitting(true);
    const { error, paymentReference } = await submitBadgeRequest(requestType, requestNotes);
    setSubmitting(false);
    if (error) {
      setRequestError(error);
      return;
    }
    setRequestNotes('');
    setSuccessDialog({
      open: true,
      paymentReference,
      requestType,
    });
  };

  if (!organization) return null;

  return (
    <NgoPortalPageShell title="Requests" path="/ngo/requests">
      <VerificationSubmittedDialog
        open={successDialog.open}
        onClose={() => setSuccessDialog((s) => ({ ...s, open: false }))}
        organizationId={organization.id}
        organizationName={organization.name}
        paymentReference={successDialog.paymentReference}
        requestType={successDialog.requestType}
      />

      <div className="card-brutal border-t-4 border-t-accent p-5 sm:p-6 space-y-6">
        <div className="flex items-center gap-2">
          <RefreshCw size={18} className="text-accent" aria-hidden />
          <h2 className="text-lg font-black uppercase tracking-tight">Request badge or renewal</h2>
        </div>

        <p className="text-xs text-ink-500 leading-relaxed">
          Submitting starts your verification review. After you submit, you can pay by bank transfer (use your unique
          reference), or via Stripe / Airwallet when enabled. See{' '}
          <Link to="/ngo/standards" className="text-teal font-semibold underline">
            trust standards
          </Link>{' '}
          for what we check.
        </p>

        <form onSubmit={handleBadgeRequest} className="space-y-4">
          <div>
            <label className="label-brutal" htmlFor="request-type">
              Request type
            </label>
            <select
              id="request-type"
              className="input-brutal w-full text-base"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as BadgeRequestType)}
            >
              {(Object.keys(BADGE_REQUEST_TYPE_LABELS) as BadgeRequestType[]).map((key) => (
                <option key={key} value={key}>
                  {BADGE_REQUEST_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-brutal" htmlFor="request-notes">
              Notes (optional)
            </label>
            <textarea
              id="request-notes"
              className="input-brutal w-full min-h-[100px] text-base"
              value={requestNotes}
              onChange={(e) => setRequestNotes(e.target.value)}
              placeholder="Anything we should know about this request…"
            />
          </div>

          {requestError && (
            <p className="text-accent text-xs font-mono" role="alert">
              {requestError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-brutal-accent w-full sm:w-auto min-h-[48px] px-8 disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit verification request'}
          </button>
        </form>

        <NgoBillingTopUpPanel
          organizationId={organization.id}
          paymentReference={organization.payment_reference}
        />

        {badgeRequests.length > 0 && (
          <div className="border-t border-ink-100 pt-6">
            <h3 className="text-sm font-black uppercase tracking-tight mb-3">Your past requests</h3>
            <ul className="space-y-3">
              {badgeRequests.map((req) => (
                <li
                  key={req.id}
                  className="border-2 border-ink-100 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div>
                    <p className="font-semibold text-sm">{BADGE_REQUEST_TYPE_LABELS[req.request_type]}</p>
                    <p className="font-mono text-2xs text-ink-400 uppercase">
                      {new Date(req.created_at).toLocaleDateString()}
                    </p>
                    {req.notes && <p className="text-xs text-ink-500 mt-1">{req.notes}</p>}
                  </div>
                  <span className="font-mono text-2xs uppercase tracking-wider border border-ink-200 px-2 py-1 self-start">
                    {BADGE_REQUEST_STATUS_LABELS[req.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </NgoPortalPageShell>
  );
}
