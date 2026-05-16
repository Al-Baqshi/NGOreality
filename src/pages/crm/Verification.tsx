import { useOrganizations } from '../../hooks/useSupabase';
import { StatusPill, VerificationBadge, SectionHeader } from '../../components/ui';
import { Shield, Landmark, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Verification() {
  const { organizations } = useOrganizations();

  const needsReview = organizations.filter(
    (o) => o.status === 'under_review' || o.status === 'onboarding'
  );
  const verified = organizations.filter(
    (o) => o.verification_level === 'verified'
  );
  const transparentFinancial = organizations.filter(
    (o) => o.verification_level === 'transparent_financial'
  );

  return (
    <div className="max-w-6xl mx-auto">
      <SectionHeader>Verification Management</SectionHeader>

      {/* Needs Review */}
      <div className="mb-8">
        <h3 className="font-mono text-xs uppercase tracking-wider font-semibold text-ink-500 mb-4 flex items-center gap-2">
          <Shield size={14} /> Awaiting Review ({needsReview.length})
        </h3>
        {needsReview.length === 0 ? (
          <div className="card-brutal p-8 text-center">
            <p className="text-sm text-ink-400">No organizations awaiting review</p>
          </div>
        ) : (
          <div className="space-y-3">
            {needsReview.map((org) => (
              <Link key={org.id} to={`/organizations/${org.id}`} className="card-brutal-hover p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center border-2 border-ink-200 bg-ink-50 font-mono text-sm font-bold text-ink-600">
                    {org.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-bold">{org.name}</div>
                    <div className="font-mono text-2xs text-ink-400 uppercase tracking-wider">{org.category} &middot; {org.location || 'No location'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill status={org.status} />
                  <ArrowRight size={16} className="text-ink-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Verified Tier */}
      <div className="mb-8">
        <h3 className="font-mono text-xs uppercase tracking-wider font-semibold text-teal mb-1 flex items-center gap-2">
          <Shield size={14} /> Verified ({verified.length})
        </h3>
        <p className="font-mono text-2xs text-ink-400 mb-4 uppercase tracking-wider">Digital & operational — non-financial</p>
        {verified.length === 0 ? (
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
                  <div>
                    <div className="text-sm font-bold">{org.name}</div>
                    <div className="font-mono text-2xs text-ink-400 uppercase tracking-wider">{org.category}</div>
                  </div>
                </div>
                <VerificationBadge level={org.verification_level} showDisclaimer />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Transparent Financial Tier */}
      <div>
        <h3 className="font-mono text-xs uppercase tracking-wider font-semibold text-accent mb-1 flex items-center gap-2">
          <Landmark size={14} /> Transparent Financial ({transparentFinancial.length})
        </h3>
        <p className="font-mono text-2xs text-ink-400 mb-4 uppercase tracking-wider">Includes financial transparency verification</p>
        {transparentFinancial.length === 0 ? (
          <div className="card-brutal p-8 text-center">
            <p className="text-sm text-ink-400">No organizations with transparent financial status yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {transparentFinancial.map((org) => (
              <Link key={org.id} to={`/organizations/${org.id}`} className="card-brutal-hover p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center border-2 border-accent bg-accent-light font-mono text-sm font-bold text-accent">
                    {org.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-bold">{org.name}</div>
                    <div className="font-mono text-2xs text-ink-400 uppercase tracking-wider">{org.category}</div>
                  </div>
                </div>
                <VerificationBadge level={org.verification_level} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
