import { useOrganizationsPage } from '../../hooks/useCrm';
import { StatusPill, VerificationBadge, SectionHeader } from '../../components/ui';
import { Shield, Landmark, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FINANCIAL_VERIFICATION_ENABLED } from '../../config/features';
import FinancialComingSoon from '../../components/FinancialComingSoon';

export default function Verification() {
  const { organizations: needsReview, loading: reviewLoading } = useOrganizationsPage(
    { status: 'onboarding' },
    1,
  );
  const { organizations: underReview, loading: underLoading } = useOrganizationsPage(
    { status: 'under_review' },
    1,
  );
  const { organizations: verified, loading: verifiedLoading } = useOrganizationsPage(
    { status: 'verified' },
    1,
  );

  const queue = [...needsReview, ...underReview].slice(0, 100);
  const queueLoading = reviewLoading || underLoading;

  return (
    <div className="max-w-6xl mx-auto">
      <SectionHeader>Verification Management</SectionHeader>

      <div className="mb-8">
        <h3 className="font-mono text-xs uppercase tracking-wider font-semibold text-ink-500 mb-4 flex items-center gap-2">
          <Shield size={14} /> Awaiting review ({queue.length}+)
        </h3>
        {queueLoading ? (
          <div className="card-brutal p-8 text-center text-sm text-ink-400">Loading...</div>
        ) : queue.length === 0 ? (
          <div className="card-brutal p-8 text-center">
            <p className="text-sm text-ink-400">No organizations awaiting review</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((org) => (
              <Link
                key={org.id}
                to={`/organizations/${org.id}`}
                className="card-brutal-hover p-5 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-ink-200 bg-ink-50 font-mono text-sm font-bold text-ink-600">
                    {org.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{org.name}</div>
                    <div className="font-mono text-2xs text-ink-400 uppercase tracking-wider truncate">
                      {org.category} · {org.location || 'No location'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusPill status={org.status} />
                  <ArrowRight size={16} className="text-ink-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
        <Link
          to="/organizations?status=onboarding"
          className="inline-block mt-3 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-accent"
        >
          View all in pipeline →
        </Link>
      </div>

      <div className="mb-8">
        <h3 className="font-mono text-xs uppercase tracking-wider font-semibold text-teal mb-1 flex items-center gap-2">
          <Shield size={14} /> Verified ({verifiedLoading ? '…' : verified.length}+ on this page)
        </h3>
        <p className="font-mono text-2xs text-ink-400 mb-4 uppercase tracking-wider">
          Digital & operational — non-financial
        </p>
        {verified.length === 0 && !verifiedLoading ? (
          <div className="card-brutal p-8 text-center">
            <p className="text-sm text-ink-400">No verified organizations yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {verified.map((org) => (
              <Link key={org.id} to={`/organizations/${org.id}`} className="card-brutal-hover p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center border-2 border-teal bg-teal-light font-mono text-sm font-bold text-teal">
                    {org.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{org.name}</div>
                    <div className="font-mono text-2xs text-ink-400 uppercase tracking-wider truncate">
                      {org.category}
                    </div>
                  </div>
                </div>
                <VerificationBadge level={org.verification_level} showDisclaimer />
              </Link>
            ))}
          </div>
        )}
      </div>

      {FINANCIAL_VERIFICATION_ENABLED ? (
        <div>
          <h3 className="font-mono text-xs uppercase tracking-wider font-semibold text-accent mb-1 flex items-center gap-2">
            <Landmark size={14} /> Transparent Financial
          </h3>
          <FinancialComingSoon variant="crm" />
        </div>
      ) : (
        <FinancialComingSoon variant="crm" />
      )}
    </div>
  );
}
