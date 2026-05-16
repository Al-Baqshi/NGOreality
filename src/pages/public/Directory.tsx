import { useState, useMemo } from 'react';
import { usePublicOrganizations, useCountryCounts } from '../../hooks/useSupabase';
import { Search, Shield, MapPin, Globe, ExternalLink, Tag } from 'lucide-react';
import { CATEGORIES } from '../../types';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';
import WorldMap from '../../components/WorldMap';
import { COUNTRY_NAMES } from '../../data/countryNames';

export default function Directory() {
  const { organizations, loading } = usePublicOrganizations();
  const { counts: countryCounts } = useCountryCounts();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  // Extract all unique tags from organizations
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const org of organizations) {
      if (org.tags) {
        for (const tag of org.tags) {
          if (tag) tagSet.add(tag);
        }
      }
    }
    return Array.from(tagSet).sort();
  }, [organizations]);

  const filtered = organizations.filter((org) => {
    const matchesSearch = org.name.toLowerCase().includes(search.toLowerCase()) ||
      org.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !category || org.category === category;
    const matchesCountry = !selectedCountry || org.country === selectedCountry;
    const matchesTag = !selectedTag || (org.tags && org.tags.includes(selectedTag));
    return matchesSearch && matchesCategory && matchesCountry && matchesTag;
  });

  const totalVerified = Object.values(countryCounts).reduce((a, b) => a + b, 0);
  const totalCountries = Object.keys(countryCounts).length;

  return (
    <>
      <SEO
        title="Nonprofit Directory"
        description="Browse verified nonprofits in the NGOreality directory. Find trusted organizations by category, location, and verification level."
        path="/public/directory"
      />
      <BreadcrumbJsonLd items={[{ name: 'Home', path: '/public' }, { name: 'Directory', path: '/public/directory' }]} />
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
                Directory
              </h1>
              <p className="text-ink-300">
                Browse verified nonprofit organizations. Each has met our digital and transparency standards.
              </p>
            </div>
          </div>
        </section>

        {/* World Map */}
        <section className="border-b-3 border-ink-950 bg-surface-raised">
          <div className="max-w-7xl mx-auto px-6 py-8 md:py-12">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-px w-8 bg-teal" />
                  <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">Global Reach</span>
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tight">Where verified organizations operate</h2>
              </div>
              <div className="hidden md:flex items-center gap-6">
                <div className="text-right">
                  <div className="text-2xl font-black text-teal">{totalVerified}</div>
                  <div className="font-mono text-2xs uppercase tracking-wider text-ink-400">Verified Orgs</div>
                </div>
                <div className="h-8 w-px bg-ink-200" />
                <div className="text-right">
                  <div className="text-2xl font-black text-ink-950">{totalCountries}</div>
                  <div className="font-mono text-2xs uppercase tracking-wider text-ink-400">Countries</div>
                </div>
              </div>
            </div>
            <div className="card-brutal p-4 md:p-6">
              <WorldMap
                countryCounts={countryCounts}
                selectedCountry={selectedCountry}
                onCountryClick={(code) => {
                  setSelectedCountry(prev => prev === code ? '' : code);
                }}
              />
            </div>
            {selectedCountry && (
              <div className="mt-4 flex items-center gap-3">
                <span className="font-mono text-xs uppercase tracking-wider text-ink-500">
                  Filtered to: <strong className="text-ink-950">{COUNTRY_NAMES[selectedCountry] || selectedCountry}</strong>
                </span>
                <button
                  onClick={() => setSelectedCountry('')}
                  className="font-mono text-2xs uppercase tracking-wider text-teal hover:underline"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Filters */}
        <section className="border-b-3 border-ink-950 bg-surface-raised">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
                  <input
                    type="text"
                    placeholder="Search organizations..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-brutal w-full pl-10"
                  />
                </div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="input-brutal min-w-[180px]"
                >
                  <option value="">All Categories</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                  className="input-brutal min-w-[180px]"
                >
                  <option value="">All Situations</option>
                  {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
                {selectedCountry && (
                  <select
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    className="input-brutal min-w-[180px]"
                  >
                    <option value="">All Countries</option>
                    {Object.entries(countryCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([code, count]) => (
                        <option key={code} value={code}>
                          {COUNTRY_NAMES[code] || code} ({count})
                        </option>
                      ))}
                  </select>
                )}
              </div>
              {/* Active filter pills */}
              {(category || selectedTag || selectedCountry) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-2xs uppercase tracking-wider text-ink-400">Active filters:</span>
                  {category && (
                    <button
                      onClick={() => setCategory('')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-ink-100 border border-ink-200 text-xs font-mono uppercase tracking-wider hover:bg-ink-200 transition-colors"
                    >
                      {category} <span className="text-ink-400 ml-1">x</span>
                    </button>
                  )}
                  {selectedTag && (
                    <button
                      onClick={() => setSelectedTag('')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-light border border-teal text-xs font-mono uppercase tracking-wider text-teal hover:bg-teal/10 transition-colors"
                    >
                      <Tag size={10} /> {selectedTag} <span className="text-teal/60 ml-1">x</span>
                    </button>
                  )}
                  {selectedCountry && (
                    <button
                      onClick={() => setSelectedCountry('')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-ink-100 border border-ink-200 text-xs font-mono uppercase tracking-wider hover:bg-ink-200 transition-colors"
                    >
                      <MapPin size={10} /> {COUNTRY_NAMES[selectedCountry] || selectedCountry} <span className="text-ink-400 ml-1">x</span>
                    </button>
                  )}
                  <button
                    onClick={() => { setCategory(''); setSelectedTag(''); setSelectedCountry(''); }}
                    className="font-mono text-2xs uppercase tracking-wider text-ink-400 hover:text-ink-950 underline"
                  >
                    Clear all
                  </button>
                </div>
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
                    <div className="flex h-12 w-12 items-center justify-center border-2 border-teal bg-teal-light font-mono text-lg font-black text-teal shrink-0">
                      {org.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold truncate">{org.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="badge-verified">
                          <Shield size={10} /> Verified
                        </span>
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
                    {(org.location || org.country) && (
                      <div className="flex items-center gap-1.5 text-xs text-ink-500">
                        <MapPin size={12} /> {org.location || COUNTRY_NAMES[org.country] || org.country}
                      </div>
                    )}
                    {org.tags && org.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        <Tag size={10} className="text-ink-400 shrink-0" />
                        {org.tags.slice(0, 4).map((tag) => (
                          <button
                            key={tag}
                            onClick={() => setSelectedTag(tag)}
                            className="text-2xs font-mono uppercase tracking-wider text-ink-400 hover:text-teal hover:underline transition-colors"
                          >
                            {tag}
                          </button>
                        ))}
                        {org.tags.length > 4 && (
                          <span className="text-2xs font-mono text-ink-300">+{org.tags.length - 4}</span>
                        )}
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
