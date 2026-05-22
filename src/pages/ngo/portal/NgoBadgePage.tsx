import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';
import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import { formatMembershipDate } from '../../../lib/membership';
import NgoPortalPageShell from '../../../components/ngo/NgoPortalPageShell';

export default function NgoBadgePage() {
  const { badges } = useNgoPortalContext();
  const activeBadge = badges.find((b) => b.is_active);

  return (
    <NgoPortalPageShell title="Reality Badge" path="/ngo/badge">
      <div className="card-brutal p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Award size={18} className="text-teal" aria-hidden />
          <h2 className="text-lg font-black uppercase tracking-tight">Your badge</h2>
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
            No active Reality Badge yet. Complete{' '}
            <Link to="/ngo/standards" className="font-semibold underline">
              trust standards
            </Link>{' '}
            and{' '}
            <Link to="/ngo/membership" className="font-semibold underline">
              membership
            </Link>
            , then submit a request from{' '}
            <Link to="/ngo/requests" className="font-semibold underline">
              Requests
            </Link>
            .
          </p>
        )}
      </div>
    </NgoPortalPageShell>
  );
}
