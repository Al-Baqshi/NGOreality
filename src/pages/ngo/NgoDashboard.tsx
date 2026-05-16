import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle,
  Clock,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { useNgoPortal } from '../../hooks/useNgoPortal';
import {
  daysUntilExpiry,
  formatMembershipDate,
  getLatestMembership,
  getMembershipDisplayStatus,
  MEMBERSHIP_STATUS_LABELS,
} from '../../lib/membership';
import { StatusPill, VerificationBadge, EmptyState } from '../../components/ui';
import {
  BADGE_REQUEST_STATUS_LABELS,
  BADGE_REQUEST_TYPE_LABELS,
  type BadgeRequestType,
} from '../../types';
import SEO from '../../components/SEO';

const STATUS_STYLES = {
  active: 'border-teal bg-teal-light text-teal',
  expiring_soon: 'border-amber-400 bg-amber-50 text-amber-800',
  expired: 'border-accent bg-accent-light text-accent',
  pending_renewal: 'border-ink-400 bg-ink-50 text-ink-700',
  none: 'border-ink-200 bg-ink-50 text-ink-500',
};

export default function NgoDashboard() {
  const {
    organization,
    memberships,
    badges,
    badgeRequests,
    loading,
    error,
    hasOrganization,
    submitBadgeRequest,
  } = useNgoPortal();

  const [requestType, setRequestType] = useState<BadgeRequestType>('new_badge');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const latestMembership = getLatestMembership(memberships);
  const membershipStatus = getMembershipDisplayStatus(latestMembership);
  const activeBadge = badges.find((b) => b.is_active);

  const handleBadgeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestError('');
    setRequestSuccess(false);
    setSubmitting(true);
    const err = await submitBadgeRequest(requestType, requestNotes);
    setSubmitting(false);
    if (err) {
      setRequestError(err);
      return;
    }
    setRequestNotes('');
    setRequestSuccess(true);
  };

  if (loading) {
    return (
      <p className="font-mono text-xs uppercase tracking-wider text-ink-500 text-center py-16">
        Loading your portal…
      </p>
    );
  }

  if (!hasOrganization) {
    return (
      <>
        <SEO title="NGO Portal" path="/ngo" />
        <EmptyState
          icon={<Shield size={40} />}
          title="No organization linked"
          description="Your account is not linked to an organization yet. Sign up with your org details or link an existing profile."
        />
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
          <Link to="/ngo/signup" className="btn-brutal-accent text-center min-h-[44px] leading-[44px] px-6">
            Complete registration
          </Link>
        </div>
      </>
    );
  }

  if (!organization) return null;

  return (
    <>
      <SEO title={`${organization.name} — Portal`} path="/ngo" />
      <div className="space-y-8">
        <div>
          <p className="font-mono text-2xs uppercase tracking-[0.25em] text-ink-400 mb-2">Member portal</p>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight truncate">{organization.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <StatusPill status={organization.status} />
            <VerificationBadge level={organization.verification_level} />
          </div>
        </div>

        {error && (
          <p className="text-accent text-xs font-mono border-2 border-accent px-3 py-2" role="alert">
            {error}
          </p>
        )}

        {/* Membership */}
        <section className="card-brutal p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-teal" aria-hidden />
              <h2 className="text-lg font-black uppercase tracking-tight">Membership</h2>
            </div>
            <span
              className={`inline-flex items-center gap-1 border font-mono text-2xs font-semibold uppercase tracking-wider px-2.5 py-1 ${STATUS_STYLES[membershipStatus]}`}
            >
              {membershipStatus === 'active' && <CheckCircle size={12} />}
              {membershipStatus === 'expiring_soon' && <Clock size={12} />}
              {(membershipStatus === 'expired' || membershipStatus === 'none') && (
                <AlertTriangle size={12} />
              )}
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
              No membership period on file. Request a renewal below to start annual membership.
            </p>
          )}

          <p className="text-xs text-ink-400 mt-4 leading-relaxed">
            NGOreality membership is renewed annually. Submit a renewal request when you are ready to extend for the next year.
          </p>
        </section>

        {/* Current badge */}
        <section className="card-brutal p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Award size={18} className="text-teal" aria-hidden />
            <h2 className="text-lg font-black uppercase tracking-tight">Reality Badge</h2>
          </div>
          {activeBadge ? (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="label-brutal text-ink-400 inline">Badge ID</dt>
                <dd className="font-mono font-semibold ml-2 inline">{activeBadge.verification_id}</dd>
              </div>
              <div>
                <dt className="label-brutal text-ink-400">Issued</dt>
                <dd className="font-semibold">{formatMembershipDate(activeBadge.issued_at)}</dd>
              </div>
              {activeBadge.expires_at && (
                <div>
                  <dt className="label-brutal text-ink-400">Badge expires</dt>
                  <dd className="font-semibold">{formatMembershipDate(activeBadge.expires_at)}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-ink-500">
              No active Reality Badge yet. Request verification below once your membership is in good standing.
            </p>
          )}
        </section>

        {/* Request badge / renewal */}
        <section className="card-brutal p-5 sm:p-6 border-t-4 border-t-accent">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw size={18} className="text-accent" aria-hidden />
            <h2 className="text-lg font-black uppercase tracking-tight">Request badge or renewal</h2>
          </div>

          <form onSubmit={handleBadgeRequest} className="space-y-4">
            <div>
              <label className="label-brutal" htmlFor="request-type">Request type</label>
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
              <label className="label-brutal" htmlFor="request-notes">Notes (optional)</label>
              <textarea
                id="request-notes"
                className="input-brutal w-full min-h-[100px] text-base"
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                placeholder="Anything we should know about this request…"
              />
            </div>

            {requestError && (
              <p className="text-accent text-xs font-mono" role="alert">{requestError}</p>
            )}
            {requestSuccess && (
              <p className="text-teal text-xs font-mono flex items-center gap-1">
                <CheckCircle size={14} /> Request submitted. Our team will review it shortly.
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
        </section>

        {/* Past requests */}
        {badgeRequests.length > 0 && (
          <section>
            <h2 className="text-lg font-black uppercase tracking-tight mb-4">Your requests</h2>
            <ul className="space-y-3">
              {badgeRequests.map((req) => (
                <li key={req.id} className="card-brutal p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
          </section>
        )}
      </div>
    </>
  );
}
