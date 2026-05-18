import { usePublicOrganizations } from '../../hooks/useSupabase';
import { Shield, Landmark, MapPin, Globe, ExternalLink, Search } from 'lucide-react';
import { useState } from 'react';
import { CATEGORIES } from '../../types';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';
import { FINANCIAL_VERIFICATION_ENABLED } from '../../config/features';
import FinancialComingSoon from '../../components/FinancialComingSoon';

export default function Verified() {
  const { organizations, loading } = usePublicOrganizations();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'verified'>('all');

  const filtered = organizations.filter((org) => {
    const matchesSearch = org.name.toLowerCase().includes(search.toLowerCase()) ||
      org.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !category || org.category === category;
    const matchesTier =
      tierFilter === 'all' ||
      (tierFilter === 'verified' && (org.verification_level === 'verified' || org.verification_level === 'transparent_financial'));
    return matchesSearch && matchesCategory && matchesTier;
  });

  const verifiedCount = organizations.filter((o) => o.verification_level === 'verified').length;
  const financialCount = organizations.filter((o) => o.verification_level === 'transparent_financial').length;

  return (
    <>
      <SEO
        title="Verified Organizations"
        description="Browse nonprofits that have earned the NGOreality Reality Badge. These organizations meet defined digital and transparency standards."
        path="/public/verified"
      />
      <BreadcrumbJsonLd items={[{ name: 'Home', path: '/public' }, { name: 'Verified', path: '/public/verified' }]} />
    <div>
      {/* Hero */}
      <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-12 bg-teal" />
              <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Verified Organizations</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4">
              Verified
            </h1>
            <p className="text-ink-300 text-lg mb-6">
              These organizations have met NGOreality standards. Each has a functional live site, a clear mission, and accessible operations.
            </p>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-teal" />
                <span className="font-mono text-xs uppercase tracking-wider text-ink-300">
                  {verifiedCount} Reality Badge
                </span>
              </div>
              {FINANCIAL_VERIFICATION_ENABLED && (
                <div className="flex items-center gap-2">
                  <Landmark size={16} className="text-accent" />
                  <span className="font-mono text-xs uppercase tracking-wider text-ink-300">
                    {financialCount} Transparent Financial
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tier Legend */}
      <section className="border-b-3 border-ink-950 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-teal" />
              <span className="badge-verified">Verified</span>
              <span className="font-mono text-2xs text-ink-400 ml-1">Digital & operational (non-financial)</span>
            </div>
            {FINANCIAL_VERIFICATION_ENABLED ? (
              <div className="flex items-center gap-2">
                <Landmark size={14} className="text-accent" />
                <span className="badge-failed">Transparent Financial</span>
                <span className="font-mono text-2xs text-ink-400 ml-1">Includes financial transparency</span>
              </div>
            ) : (
              <FinancialComingSoon variant="compact" />
            )}
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="border-b-3 border-ink-950 bg-surface-raised">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="text"
                placeholder="Search verified organizations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-brutal w-full pl-10"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input-brutal"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {FINANCIAL_VERIFICATION_ENABLED && (
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as 'all' | 'verified')}
                className="input-brutal"
              >
                <option value="all">All Tiers</option>
                <option value="verified">Verified Only</option>
              </select>
            )}
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <span className="font-mono text-xs uppercase tracking-wider text-ink-500">
            {filtered.length} organization{filtered.length !== 1 ? 's' : ''} found
          </span>
        </div>

        {loading ? (
          <div className="text-center py-16 font-mono text-sm text-ink-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Shield size={48} className="text-ink-200 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-ink-700 mb-2">No organizations found</h3>
            <p className="text-sm text-ink-400">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((org) => (
              <div key={org.id} className="card-brutal-hover p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className={`flex h-12 w-12 items-center justify-center border-2 shrink-0 font-mono text-lg font-black
                    ${FINANCIAL_VERIFICATION_ENABLED && org.verification_level === 'transparent_financial'
                      ? 'border-accent bg-accent-light text-accent'
                      : 'border-teal bg-teal-light text-teal'
                    }`}>
                    {org.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold">{org.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {FINANCIAL_VERIFICATION_ENABLED && org.verification_level === 'transparent_financial' ? (
                        <span className="badge-failed">
                          <Landmark size={10} /> Transparent Financial
                        </span>
                      ) : (
                        <span className="badge-verified">
                          <Shield size={10} /> Verified
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-ink-500 leading-relaxed line-clamp-3 mb-4">
                  {org.description || org.mission_statement || 'No description available'}
                </p>
                <div className="space-y-1.5 mb-4">
                  {org.category && (
                    <div className="font-mono text-2xs uppercase tracking-wider text-ink-400">
                      {org.category}
                    </div>
                  )}
                  {org.location && (
                    <div className="flex items-center gap-1.5 text-xs text-ink-500">
                      <MapPin size={12} /> {org.location}
                    </div>
                  )}
                </div>
                {org.website_url && (
                  <a
                    href={org.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-teal hover:underline"
                  >
                    <Globe size={12} /> Visit Website <ExternalLink size={10} />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
    </>
  );
}
