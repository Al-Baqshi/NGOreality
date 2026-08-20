import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useOrganizationsPage, type OrganizationsPageFilters } from '../../hooks/useCrm';
import { OrgTrustStatusBadge, SectionHeader, EmptyState } from '../../components/ui';
import { Plus, Search, Building2, LayoutGrid, List, ChevronLeft, ChevronRight } from 'lucide-react';
import type { OrgStatus, OutreachStatus } from '../../types';
import { ORG_STATUS_LABELS, OUTREACH_STATUS_LABELS } from '../../types';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const FILTER_TRIGGER =
  'h-auto w-full min-h-[44px] min-w-[12rem] rounded-none border-3 border-ink-950 bg-white px-3 py-2 font-mono text-sm text-ink-950 shadow-none hover:bg-gold-light/50 focus-visible:border-ink-950 focus-visible:ring-2 focus-visible:ring-gold data-[size=default]:h-auto dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted';
const FILTER_CONTENT =
  'rounded-none border-3 border-ink-950 bg-white p-1 shadow-brutal max-h-72 min-w-(--anchor-width) dark:border-border dark:bg-card';
const FILTER_ITEM =
  'rounded-none py-2.5 pl-3 pr-8 text-sm text-ink-950 focus:bg-gold focus:text-ink-950 data-highlighted:bg-gold data-highlighted:text-ink-950 dark:text-foreground';

const STATUSES: (OrgStatus | 'all')[] = ['all', 'listed', 'onboarding', 'under_review', 'verified', 'active', 'lapsed'];
const OUTREACH_OPTIONS: (OutreachStatus | 'all')[] = [
  'all',
  'not_contacted',
  'cold_email',
  'no_website',
  'website_issues',
  'contacted',
  'follow_up',
  'registered',
  'declined',
  'not_applicable',
];

const OUTREACH_GROUPS: { label: string; values: OutreachStatus[] }[] = [
  { label: 'Pipeline', values: ['not_contacted', 'cold_email', 'contacted', 'follow_up', 'declined'] },
  { label: 'Website', values: ['no_website', 'website_issues'] },
  { label: 'Inbound', values: ['registered'] },
  { label: 'Other', values: ['not_applicable'] },
];

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

      <div className="flex flex-col gap-5 mb-6">
        <div className="relative w-full">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search by name…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="input-brutal w-full pl-10 text-base min-h-[48px]"
          />
        </div>
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-ink-500">Status</span>
            <Select value={statusFilter} onValueChange={(v) => updateParam('status', v ?? 'all')}>
              <SelectTrigger className={FILTER_TRIGGER} aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={FILTER_CONTENT} align="start" alignItemWithTrigger={false}>
                <SelectItem value="all" className={FILTER_ITEM}>All statuses</SelectItem>
                {STATUSES.filter((s) => s !== 'all').map((s) => (
                  <SelectItem key={s} value={s} className={FILTER_ITEM}>
                    {ORG_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-ink-500">Outreach</span>
            <Select value={outreachFilter} onValueChange={(v) => updateParam('outreach', v ?? 'all')}>
              <SelectTrigger className={FILTER_TRIGGER} aria-label="Filter by outreach">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={FILTER_CONTENT} align="start" alignItemWithTrigger={false}>
                <SelectItem value="all" className={FILTER_ITEM}>All outreach</SelectItem>
                {OUTREACH_GROUPS.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel className="px-3 py-1.5 font-mono text-2xs font-semibold uppercase tracking-wider text-gold">
                      {group.label}
                    </SelectLabel>
                    {group.values.map((s) => (
                      <SelectItem key={s} value={s} className={FILTER_ITEM}>
                        {OUTREACH_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-ink-500">Website</span>
            <Select value={hasWebsiteFilter} onValueChange={(v) => updateParam('hasWebsite', v ?? 'all')}>
              <SelectTrigger className={FILTER_TRIGGER} aria-label="Filter by website">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={FILTER_CONTENT} align="start" alignItemWithTrigger={false}>
                <SelectItem value="all" className={FILTER_ITEM}>Any</SelectItem>
                <SelectItem value="yes" className={FILTER_ITEM}>Has website</SelectItem>
                <SelectItem value="no" className={FILTER_ITEM}>No website</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <div className="flex border-3 border-ink-950 shrink-0 self-stretch lg:self-end">
            <button
              type="button"
              onClick={() => setView('list')}
              className={`p-2 min-h-[44px] min-w-[44px] ${view === 'list' ? 'bg-ink-950 text-white' : 'bg-white text-ink-600 hover:bg-gold-light'}`}
              aria-label="List view"
              aria-pressed={view === 'list'}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`p-2 min-h-[44px] min-w-[44px] ${view === 'grid' ? 'bg-ink-950 text-white' : 'bg-white text-ink-600 hover:bg-gold-light'}`}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
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
          <div className="hidden md:grid grid-cols-[1fr_140px_150px_170px_72px] gap-3 bg-ink-950 px-4 py-3 font-mono text-2xs uppercase tracking-wider text-gold">
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
                className="flex flex-col md:grid md:grid-cols-[1fr_140px_150px_170px_72px] gap-1 md:gap-3 md:items-center px-4 py-3 hover:bg-gold-light/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{org.name}</div>
                  <div className="font-mono text-2xs text-ink-400 truncate">{org.location || org.country}</div>
                </div>
                <span className="font-mono text-2xs text-ink-500 truncate">
                  {org.charity_registration_number || org.external_id || '—'}
                </span>
                <OrgTrustStatusBadge org={org} showHint={false} />
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
        <OrgTrustStatusBadge org={org} showHint={false} />
      </div>
      {(org.charity_registration_number || org.external_id) && (
        <p className="font-mono text-2xs text-ink-400 mb-2">
          #{org.charity_registration_number || org.external_id}
        </p>
      )}
    </Link>
  );
}
