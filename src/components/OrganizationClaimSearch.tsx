import { useState } from 'react';
import { Search, MapPin, Check } from 'lucide-react';
import { useOrganizationClaimSearch, type ClaimSearchOrganization } from '../hooks/useOrganizationClaimSearch';
import { ORG_STATUS_LABELS } from '../types';

interface OrganizationClaimSearchProps {
  selected: ClaimSearchOrganization | null;
  onSelect: (org: ClaimSearchOrganization | null) => void;
  onRegisterNew: () => void;
}

export default function OrganizationClaimSearch({ selected, onSelect, onRegisterNew }: OrganizationClaimSearchProps) {
  const [query, setQuery] = useState(selected?.name ?? '');
  const { results, loading, searched, searchError } = useOrganizationClaimSearch(query);

  return (
    <div className="space-y-3">
      <div>
        <label className="label-brutal" htmlFor="claim-org-search">
          Find your organization
        </label>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            id="claim-org-search"
            type="search"
            autoComplete="off"
            className="input-brutal w-full text-base pl-10"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selected && e.target.value !== selected.name) {
                onSelect(null);
              }
            }}
            placeholder="Search by name or charity registration number"
          />
        </div>
        <p className="text-2xs text-ink-400 mt-1 font-mono">
          Search the NZ directory. Type at least 2 characters.
        </p>
      </div>

      {searchError && (
        <p className="text-accent text-xs font-mono border-2 border-accent px-3 py-2" role="alert">
          Directory search failed: {searchError}. If this persists, apply Supabase migration{' '}
          <code className="text-2xs">021_ngo_claim_search_rls</code>.
        </p>
      )}

      {selected && (
        <div className="border-2 border-teal bg-teal-light p-3 flex items-start gap-2">
          <Check size={16} className="text-teal shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold truncate">{selected.name}</p>
            {selected.charity_registration_number && (
              <p className="font-mono text-2xs text-ink-600">Reg. {selected.charity_registration_number}</p>
            )}
            {selected.location && (
              <p className="text-2xs text-ink-500 flex items-center gap-1 mt-0.5">
                <MapPin size={10} /> {selected.location}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              setQuery('');
            }}
            className="font-mono text-2xs uppercase tracking-wider text-ink-500 underline shrink-0 min-h-[44px] px-1"
          >
            Change
          </button>
        </div>
      )}

      {!selected && query.trim().length >= 2 && (
        <div className="border-2 border-ink-200 bg-white max-h-64 overflow-y-auto divide-y divide-ink-100">
          {loading && (
            <p className="px-4 py-3 font-mono text-2xs text-ink-400 uppercase tracking-wider">Searching…</p>
          )}
          {!loading && searched && results.length === 0 && (
            <div className="px-4 py-4 text-center">
              <p className="text-sm text-ink-600 mb-3">No match in our directory.</p>
              <button type="button" onClick={onRegisterNew} className="btn-brutal-outline text-2xs min-h-[44px] px-4">
                Register a new organization
              </button>
            </div>
          )}
          {!loading &&
            results.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => {
                  onSelect(org);
                  setQuery(org.name);
                }}
                className="w-full text-left px-4 py-3 hover:bg-ink-50 transition-colors min-h-[44px]"
              >
                <p className="text-sm font-semibold leading-snug">{org.name}</p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {org.charity_registration_number && (
                    <span className="font-mono text-2xs text-ink-500">Reg. {org.charity_registration_number}</span>
                  )}
                  {org.status === 'listed' && (
                    <span className="font-mono text-2xs uppercase tracking-wider text-sky-700">
                      {ORG_STATUS_LABELS.listed}
                    </span>
                  )}
                </div>
                {org.location && (
                  <p className="text-2xs text-ink-400 mt-0.5">{org.location}</p>
                )}
              </button>
            ))}
        </div>
      )}

      <p className="text-xs text-ink-500 text-center">
        Not listed yet?{' '}
        <button type="button" onClick={onRegisterNew} className="font-semibold text-ink-950 underline min-h-[44px]">
          Register a new organization
        </button>
      </p>
    </div>
  );
}
