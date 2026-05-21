import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useOrganizationsPage, type OrganizationsPageFilters } from '../../hooks/useCrm';
import { StatusPill, VerificationBadge, SectionHeader, EmptyState } from '../../components/ui';
import { Plus, Search, Building2, LayoutGrid, List, ChevronLeft, ChevronRight } from 'lucide-react';
import type { OrgStatus, OutreachStatus } from '../../types';
import { OUTREACH_STATUS_LABELS } from '../../types';

const STATUSES: (OrgStatus | 'all')[] = ['all', 'listed', 'onboarding', 'under_review', 'verified', 'active', 'lapsed'];
const OUTREACH_OPTIONS: (OutreachStatus | 'all')[] = ['all', 'not_contacted', 'contacted', 'responded', 'declined', 'not_applicable'];

function parseStatus(v: string | null): OrgStatus | 'all' {
  if (v && STATUSES.includes(v as OrgStatus | 'all')) return v as OrgStatus | 'all';
  return 'all';
}

function parseOutreach(v: string | null): OutreachStatus | 'all' {
  if (v && OUTREACH_OPTIONS.includes(v as OutreachStatus | 'all')) return v as OutreachStatus | 'all';
  return 'all';
}

function parseHasWebsite(v: string | null): 'all' | 'yes' | 'no' {
  if (v === 'yes' || v === 'no') return v;
  return 'all';
}

export default function OrganizationsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const [view, setView] = useState<'list' | 'grid'>('list');

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const statusFilter = parseStatus(searchParams.get('status'));
  const outreachFilter = parseOutreach(searchParams.get('outreach'));
  const hasWebsiteFilter = parseHasWebsite(searchParams.get('hasWebsite'));

  const filters: OrganizationsPageFilters = useMemo(
    () => ({
      status: statusFilter,
      outreach: outreachFilter,
      hasWebsite: hasWebsiteFilter,
      search: searchParams.get('q') ?? undefined,
      country: searchParams.get('country') ?? undefined,
    }),
    [statusFilter, outreachFilter, hasWebsiteFilter, searchParams],
  );

  const { organizations, totalCount, totalPages, loading, pageSize } = useOrganizationsPage(filters, page);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      const trimmed = searchInput.trim();
      if (trimmed) next.set('q', trimmed);
      else next.delete('q');
      next.set('page', '1');
      if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput, searchParams, setSearchParams]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all' || !value) next.delete(key);
    else next.set(key, value);
    next.set('page', '1');
    setSearchParams(next, { replace: true });
  };

  const goToPage = (p: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(Math.min(Math.max(1, p), totalPages)));
    setSearchParams(next, { replace: true });
  };

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div className="max-w-6xl mx-auto min-w-0 w-full">
      <SectionHeader
        action={
          <Link to="/organizations/new" className="btn-brutal-accent text-sm flex items-center justify-center gap-2 min-h-[44px]">
            <Plus size={16} className="shrink-0" />
            <span className="sm:hidden">Add org</span>
            <span className="hidden sm:inline">Add Organization</span>
          </Link>
        }
      >
        Organizations
      </SectionHeader>

      <p className="font-mono text-2xs text-ink-500 uppercase tracking-wider mb-4 -mt-2">
        {loading ? 'Loading…' : `${totalCount.toLocaleString()} matching · page ${page} of ${totalPages}`}
      </p>

      <div className="flex flex-col gap-4 mb-6">
        <div className="relative w-full">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            placeholder="Search by name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="input-brutal w-full pl-10 text-base"
          />
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => updateParam('status', e.target.value)}
            className="input-brutal text-sm flex-1 sm:flex-none"
          >
            <option value="all">All statuses</option>
            <option value="listed">Listed (registry)</option>
            <option value="onboarding">Onboarding</option>
            <option value="under_review">Under review</option>
            <option value="verified">Verified</option>
            <option value="active">Active</option>
            <option value="lapsed">Lapsed</option>
          </select>
          <select
            value={outreachFilter}
            onChange={(e) => updateParam('outreach', e.target.value)}
            className="input-brutal text-sm flex-1 sm:flex-none"
          >
            <option value="all">All outreach</option>
            {OUTREACH_OPTIONS.filter((o) => o !== 'all').map((o) => (
              <option key={o} value={o}>
                {OUTREACH_STATUS_LABELS[o]}
              </option>
            ))}
          </select>
          <select
            value={hasWebsiteFilter}
            onChange={(e) => updateParam('hasWebsite', e.target.value)}
            className="input-brutal text-sm flex-1 sm:flex-none"
          >
            <option value="all">Website: any</option>
            <option value="yes">Has website</option>
            <option value="no">No website</option>
          </select>
          <div className="flex border-3 border-ink-950 sm:ml-auto">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`p-2 min-h-[44px] min-w-[44px] ${view === 'list' ? 'bg-ink-950 text-white' : 'bg-white text-ink-600'}`}
              aria-label="List view"
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`p-2 min-h-[44px] min-w-[44px] ${view === 'grid' ? 'bg-ink-950 text-white' : 'bg-white text-ink-600'}`}
              aria-label="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 font-mono text-sm text-ink-400">Loading...</div>
      ) : organizations.length === 0 ? (
        <EmptyState
          icon={<Building2 size={48} />}
          title="No organizations found"
          description="Try different filters or search terms."
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {organizations.map((org) => (
            <OrgCard key={org.id} org={org} />
          ))}
        </div>
      ) : (
        <div className="card-brutal overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_120px_100px_100px_80px] gap-2 border-b-3 border-ink-950 px-4 py-2 font-mono text-2xs uppercase tracking-wider text-ink-500">
            <span>Name</span>
            <span>Registry #</span>
            <span>Status</span>
            <span>Outreach</span>
            <span>Web</span>
          </div>
          <div className="divide-y divide-ink-100">
            {organizations.map((org) => (
              <Link
                key={org.id}
                to={`/organizations/${org.id}`}
                className="flex flex-col md:grid md:grid-cols-[1fr_120px_100px_100px_80px] gap-1 md:gap-2 md:items-center px-4 py-3 hover:bg-ink-50 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{org.name}</div>
                  <div className="font-mono text-2xs text-ink-400 truncate">{org.location || org.country}</div>
                </div>
                <span className="font-mono text-2xs text-ink-500 truncate">
                  {org.charity_registration_number || org.external_id || '—'}
                </span>
                <StatusPill status={org.status} />
                <span className="font-mono text-2xs uppercase text-ink-500">
                  {OUTREACH_STATUS_LABELS[org.outreach_status]}
                </span>
                <span className="font-mono text-2xs">{org.website_url?.trim() ? 'Yes' : 'No'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
          <p className="font-mono text-2xs text-ink-500 uppercase tracking-wider">
            Showing {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {totalCount.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="btn-brutal-outline p-2 min-h-[44px] min-w-[44px] disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="font-mono text-xs px-2">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="btn-brutal-outline p-2 min-h-[44px] min-w-[44px] disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OrgCard({ org }: { org: import('../../types').Organization }) {
  return (
    <Link to={`/organizations/${org.id}`} className="card-brutal-hover p-5 block">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-bold leading-tight">{org.name}</h3>
        <StatusPill status={org.status} />
      </div>
      {(org.charity_registration_number || org.external_id) && (
        <p className="font-mono text-2xs text-ink-400 mb-2">
          #{org.charity_registration_number || org.external_id}
        </p>
      )}
      <VerificationBadge level={org.verification_level} showDisclaimer />
    </Link>
  );
}
