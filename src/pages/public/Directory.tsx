import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePublicDirectoryOrganizations, useCountryCounts } from '../../hooks/useSupabase';
import { Search, Shield, MapPin, ExternalLink, Tag } from 'lucide-react';
import { isNgorealityVerified } from '../../types';
import { DirectoryTrustBadge } from '../../components/ui';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';
import WorldMap from '../../components/WorldMap';
import { COUNTRY_NAMES } from '../../data/countryNames';
import { formatTagLabel } from '../../lib/tags';

const DEFAULT_COUNTRY = 'NZ';

export default function Directory() {
  const { organizations, loading } = usePublicDirectoryOrganizations();
  const { counts: countryCounts } = useCountryCounts();
  const [search, setSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [selectedTag, setSelectedTag] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const org of organizations) {
      if (selectedCountry && org.country !== selectedCountry) continue;
      for (const tag of org.tags ?? []) {
        if (!tag) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([slug, count]) => ({ slug, label: formatTagLabel(slug), count }));
  }, [organizations, selectedCountry]);

  const ngorealityVerifiedCount = organizations.filter((o) => isNgorealityVerified(o)).length;
  const registryListedCount = organizations.filter((o) => o.status === 'listed').length;
  const nzCount = countryCounts.NZ ?? 0;

  const filtered = organizations.filter((org) => {
    const matchesSearch =
      org.name.toLowerCase().includes(search.toLowerCase()) ||
      org.description.toLowerCase().includes(search.toLowerCase()) ||
      (org.charity_registration_number || '').toLowerCase().includes(search.toLowerCase()) ||
      (org.tags ?? []).some((t) => formatTagLabel(t).toLowerCase().includes(search.toLowerCase()));
    const matchesCountry = !selectedCountry || org.country === selectedCountry;
    const matchesTag = !selectedTag || (org.tags && org.tags.includes(selectedTag));
    const matchesVerified = !verifiedOnly || isNgorealityVerified(org);
    return matchesSearch && matchesCountry && matchesTag && matchesVerified;
  });

  const countryLabel = selectedCountry ? COUNTRY_NAMES[selectedCountry] || selectedCountry : 'All countries';

  return (
    <>
      <SEO
        title="Nonprofit Directory"
        description="Browse nonprofits in the NGOreality directory — registry listings and NGOreality verified organizations in New Zealand."
        path="/public/directory"
      />
      <BreadcrumbJsonLd items={[{ name: 'Home', path: '/public' }, { name: 'Directory', path: '/public/directory' }]} />
      <div>
        <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-teal" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Nonprofit Directory</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4">Directory</h1>
              <p className="text-ink-300">
                New Zealand charities from the official register, tagged by sector. NGOreality Verified badges are
                awarded after our digital independence review.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b-3 border-ink-950 bg-surface-raised">
          <div className="max-w-7xl mx-auto px-6 py-8 md:py-12">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-px w-8 bg-teal" />
                  <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">
                    {countryLabel}
                  </span>
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tight">
                  {selectedCountry === 'NZ' ? 'New Zealand map' : `Organizations in ${countryLabel}`}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-4 md:gap-6">
                <div className="text-right">
                  <div className="text-2xl font-black text-teal">{ngorealityVerifiedCount}</div>
                  <div className="font-mono text-2xs uppercase tracking-wider text-ink-400">NGOreality Verified</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-ink-950">{selectedCountry === 'NZ' ? nzCount : registryListedCount}</div>
                  <div className="font-mono text-2xs uppercase tracking-wider text-ink-400">
                    {selectedCountry === 'NZ' ? 'In New Zealand' : 'Registry listed'}
                  </div>
                </div>
              </div>
            </div>
            <div className="card-brutal p-4 md:p-6">
              <WorldMap
                countryCounts={countryCounts}
                selectedCountry={selectedCountry}
                focusCountry={selectedCountry || undefined}
                onCountryClick={(code) => {
                  setSelectedCountry((prev) => (prev === code ? '' : code));
                  setSelectedTag('');
                }}
              />
            </div>
            {selectedCountry && (
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <span className="font-mono text-xs uppercase tracking-wider text-ink-500">
                  Showing: <strong className="text-ink-950">{countryLabel}</strong>
                  {selectedCountry === 'NZ' && (
                    <span className="text-ink-400 font-normal normal-case tracking-normal ml-1">
                      ({nzCount.toLocaleString()} organizations)
                    </span>
                  )}
                </span>
                {selectedCountry !== DEFAULT_COUNTRY && (
                  <button
                    type="button"
                    onClick={() => setSelectedCountry(DEFAULT_COUNTRY)}
                    className="font-mono text-2xs uppercase tracking-wider text-teal hover:underline"
                  >
                    Back to New Zealand
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCountry('')}
                  className="font-mono text-2xs uppercase tracking-wider text-ink-400 hover:text-ink-950 underline"
                >
                  Show world map
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="border-b-3 border-ink-950 bg-surface-raised">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    type="text"
                    placeholder="Search name, CC number, or tag…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-brutal w-full pl-10 text-base"
                  />
                </div>
                <select
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="input-brutal min-w-[200px] text-base"
                >
                  <option value="">All tags</option>
                  {tagOptions.map(({ slug, label, count }) => (
                    <option key={slug} value={slug}>
                      {label} ({count})
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-2 border-3 border-ink-950 px-3 py-2.5 bg-white cursor-pointer shrink-0 min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={verifiedOnly}
                    onChange={(e) => setVerifiedOnly(e.target.checked)}
                    className="h-4 w-4 accent-teal"
                  />
                  <span className="font-mono text-2xs uppercase tracking-wider whitespace-nowrap">Verified only</span>
                </label>
              </div>

              {(selectedTag || (selectedCountry && selectedCountry !== DEFAULT_COUNTRY)) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-2xs uppercase tracking-wider text-ink-400">Active filters:</span>
                  {selectedTag && (
                    <button
                      type="button"
                      onClick={() => setSelectedTag('')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-light border border-teal text-xs font-mono uppercase tracking-wider text-teal hover:bg-teal/10 transition-colors"
                    >
                      <Tag size={10} /> {formatTagLabel(selectedTag)} <span className="text-teal/60 ml-1">×</span>
                    </button>
                  )}
                  {selectedCountry && selectedCountry !== DEFAULT_COUNTRY && (
                    <button
                      type="button"
                      onClick={() => setSelectedCountry(DEFAULT_COUNTRY)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-ink-100 border border-ink-200 text-xs font-mono uppercase tracking-wider hover:bg-ink-200 transition-colors"
                    >
                      <MapPin size={10} /> {countryLabel} <span className="text-ink-400 ml-1">×</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTag('');
                      setSelectedCountry(DEFAULT_COUNTRY);
                    }}
                    className="font-mono text-2xs uppercase tracking-wider text-ink-400 hover:text-ink-950 underline"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <span className="font-mono text-xs uppercase tracking-wider text-ink-500">
              {filtered.length.toLocaleString()} organization{filtered.length !== 1 ? 's' : ''} found
            </span>
          </div>

          {loading ? (
            <div className="text-center py-16 font-mono text-sm text-ink-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Shield size={48} className="text-ink-200 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-ink-700 mb-2">No organizations found</h3>
              <p className="text-sm text-ink-400">Try adjusting your search or tag filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((org) => (
                <Link key={org.id} to={`/public/org/${org.slug}`} className="card-brutal-hover p-6 block">
                  <div className="flex items-start gap-3 mb-4">
                    <div
                      className={`flex h-12 w-12 items-center justify-center border-2 font-mono text-lg font-black shrink-0 ${
                        isNgorealityVerified(org)
                          ? 'border-teal bg-teal-light text-teal'
                          : 'border-ink-200 bg-ink-50 text-ink-600'
                      }`}
                    >
                      {org.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold truncate">{org.name}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <DirectoryTrustBadge org={org} />
                      </div>
                      {org.charity_registration_number && (
                        <p className="font-mono text-2xs text-ink-400 mt-1">{org.charity_registration_number}</p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-ink-500 leading-relaxed line-clamp-3 mb-4">
                    {org.description || org.mission_statement || 'No description available'}
                  </p>
                  <div className="space-y-1.5 mb-4">
                    {(org.location || org.country) && (
                      <div className="flex items-center gap-1.5 text-xs text-ink-500">
                        <MapPin size={12} />
                        {org.location || COUNTRY_NAMES[org.country] || org.country}
                      </div>
                    )}
                    {org.tags && org.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {org.tags.slice(0, 4).map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setSelectedTag(tag);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 border border-ink-200 bg-ink-50 text-2xs font-mono uppercase tracking-wider text-ink-600 hover:border-teal hover:text-teal transition-colors"
                          >
                            <Tag size={10} />
                            {formatTagLabel(tag)}
                          </button>
                        ))}
                        {org.tags.length > 4 && (
                          <span className="text-2xs font-mono text-ink-300 self-center">+{org.tags.length - 4}</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-2xs font-mono text-ink-300 uppercase tracking-wider mt-1">No tags yet</p>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-mono text-teal mt-2">
                    View profile <ExternalLink size={10} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
