import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import { useConfirm } from '../../../contexts/ConfirmContext';
import {
  BADGE_REQUEST_STATUS_LABELS,
  BADGE_REQUEST_TYPE_HELP,
  BADGE_REQUEST_TYPE_LABELS,
  NGO_BADGE_REQUEST_TYPES,
  type BadgeRequestType,
} from '../../../types';
import NgoPortalPageShell from '../../../components/ngo/NgoPortalPageShell';
import VerificationSubmittedDialog from '../../../components/ngo/VerificationSubmittedDialog';
import NgoBillingTopUpPanel from '../../../components/ngo/NgoBillingTopUpPanel';

export default function NgoRequestsPage() {
  const confirm = useConfirm();
  const { organization, badgeRequests, badges, submitBadgeRequest, isSteward } =
    useNgoPortalContext();
  const hasActiveBadge = badges.some((b) => b.is_active);
  const [requestType, setRequestType] = useState<BadgeRequestType>(
    hasActiveBadge ? 'reissue' : 'new_badge',
  );
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

    const ok = await confirm({
      title: 'Send this request?',
      description: `Submit “${BADGE_REQUEST_TYPE_LABELS[requestType]}” for ${organization.name}? Our team will review it and follow up by email.`,
      confirmLabel: 'Send request',
    });
    if (!ok) return;

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
          <h2 className="text-lg font-black uppercase tracking-tight">Request Reality Badge</h2>
        </div>

        <p className="text-xs text-ink-500 leading-relaxed">
          {isSteward ? (
            <>
              Submitting starts your verification review. Membership renewal and payment are on{' '}
              <Link to="/ngo/membership" className="text-teal font-semibold underline">
                Membership
              </Link>{' '}
              and{' '}
              <Link to="/ngo/services" className="text-teal font-semibold underline">
                Services
              </Link>
              . See{' '}
              <Link to="/ngo/standards" className="text-teal font-semibold underline">
                trust standards
              </Link>{' '}
              for what we check.
            </>
          ) : (
            <>
              Monitoring is available now. Applying for a Reality Badge waits until NGOreality confirms you manage{' '}
              {organization.name}. That stops someone else putting a badge on a charity they do not run. If this is your
              organisation,{' '}
              <Link to="/public/contact" className="text-teal font-semibold underline">
                contact us
              </Link>
              .
            </>
          )}
        </p>

        {isSteward ? (
          <form onSubmit={(e) => void handleBadgeRequest(e)} className="space-y-4">
            <div>
              <label className="label-brutal" htmlFor="request-type">
                Request type <span className="text-accent">*</span>
              </label>
              <select
                id="request-type"
                className="input-brutal w-full text-base"
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as BadgeRequestType)}
                required
              >
                {NGO_BADGE_REQUEST_TYPES.map((key) => (
                  <option key={key} value={key}>
                    {BADGE_REQUEST_TYPE_LABELS[key]}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-ink-500 leading-relaxed">
                {BADGE_REQUEST_TYPE_HELP[requestType as 'new_badge' | 'reissue']}
              </p>
            </div>
            <div>
              <label className="label-brutal" htmlFor="request-notes">
                Notes{' '}
                <span className="font-normal normal-case tracking-normal text-ink-400">(optional)</span>
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
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </form>
        ) : null}

        {isSteward ? (
          <NgoBillingTopUpPanel
            organizationId={organization.id}
            paymentReference={organization.payment_reference}
          />
        ) : null}

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
