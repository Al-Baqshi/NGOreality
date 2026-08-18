import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search, Globe, GlobeLock, AlertTriangle, CheckCircle2, HelpCircle,
  Loader2, ChevronLeft, ChevronRight, Kanban, ExternalLink, Plus, X,
} from 'lucide-react';
import NewLeadDialog from '../../components/crm/NewLeadDialog';
import {
  useOutreachLeads, useOutreachSegmentCounts, useOutreachSelection,
  bulkSetOutreachByFilter, bulkSetOutreachByIds, selectionCount, isRowSelected,
  OUTREACH_PAGE_SIZE,
  type OutreachSegment, type OutreachFilters, type OutreachLead,
} from '../../hooks/useOutreachWorklist';
import { OUTREACH_KANBAN_STATUSES, OUTREACH_STATUS_LABELS, type OutreachStatus } from '../../types';
import { EmptyState } from '../../components/ui';

/**
 * The outreach worklist.
 *
 * Replaces a kanban that could show 20 rows per column and select at most 350,
 * against 29,226 leads sitting in a single column. The two segments that
 * actually drive outreach — 14,482 with no website and 1,516 whose site is down
 * right now — were not filterable at all.
 *
 * The board is still there for moving a handful of live conversations between
 * stages; this screen is for working the backlog.
 */

interface SegmentDef {
  key: OutreachSegment;
  label: string;
  icon: typeof Globe;
  hint: string;
}

const SEGMENTS: SegmentDef[] = [
  { key: 'all', label: 'All leads', icon: Globe, hint: 'Every listed organisation that is not yet a customer' },
  { key: 'site_down', label: 'Site down', icon: AlertTriangle, hint: 'Their website is failing checks right now — the strongest reason to call' },
  { key: 'no_website', label: 'No website', icon: GlobeLock, hint: 'No website on record at all' },
  { key: 'site_ok', label: 'Site healthy', icon: CheckCircle2, hint: 'Site responding normally' },
  { key: 'url_invalid', label: 'Broken URL', icon: HelpCircle, hint: 'The URL on file is malformed — a data-quality fix, not an outage' },
  { key: 'never_checked', label: 'Never checked', icon: HelpCircle, hint: 'Has a website but we have no check result yet' },
];

function relativeDate(iso: string | null): string {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function MonitorCell({ lead }: { lead: OutreachLead }) {
  if (!lead.website_url?.trim()) {
    return <span className="badge-pending whitespace-nowrap">No website</span>;
  }
  if (lead.monitor_status === 'down') {
    return (
      <span className="badge-failed whitespace-nowrap" title={lead.incident_opened_at ? `Down since ${new Date(lead.incident_opened_at).toLocaleDateString()}` : undefined}>
        Down{lead.consecutive_failures ? ` ×${lead.consecutive_failures}` : ''}
      </span>
    );
  }
  if (lead.monitor_status === 'up') return <span className="badge-verified whitespace-nowrap">Up</span>;
  if (lead.monitor_status === 'url_invalid') return <span className="badge-pending whitespace-nowrap">Bad URL</span>;
  return <span className="badge-pending whitespace-nowrap">Unchecked</span>;
}

export default function OutreachWorklist() {
  const [params, setParams] = useSearchParams();

  const filters: OutreachFilters = useMemo(
    () => ({
      segment: (params.get('segment') as OutreachSegment) || 'all',
      outreach: (params.get('outreach') as OutreachStatus) || '',
      q: params.get('q') || '',
    }),
    [params],
  );
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [refreshKey, setRefreshKey] = useState(0);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState(filters.q);
  const [moveTo, setMoveTo] = useState<OutreachStatus>('cold_email');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { counts } = useOutreachSegmentCounts(refreshKey);
  const { leads, total, loading, error } = useOutreachLeads(filters, page, refreshKey);
  const { selection, clear, selectAllMatching, toggle, selectIds } = useOutreachSelection();

  const selected = selectionCount(selection, total);
  const totalPages = Math.max(1, Math.ceil(total / OUTREACH_PAGE_SIZE));
  const pageAllSelected = leads.length > 0 && leads.every((l) => isRowSelected(selection, l.id));

  function update(next: Record<string, string | number | null>) {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => {
      if (v === null || v === '' ) p.delete(k);
      else p.set(k, String(v));
    });
    // Any filter change invalidates a selection built against the old filter.
    if (!('page' in next)) p.delete('page');
    setParams(p);
    clear();
  }

  async function applyBulk() {
    if (!selected) return;
    const label = OUTREACH_STATUS_LABELS[moveTo];
    if (!window.confirm(`Move ${selected.toLocaleString()} organisation${selected === 1 ? '' : 's'} to "${label}"?`)) return;

    setBusy(true);
    setNotice(null);
    try {
      // Two genuinely different operations, and conflating them is dangerous.
      //
      // 'all'  — the operator asked for everything matching the filter. The
      //          server re-derives the set, so it cannot drift from what the
      //          screen said, and only the handful of unticked ids travel.
      // 'ids'  — the operator ticked specific rows. This MUST go by id.
      //          Expressing it as "the filter minus the rest of this page"
      //          would update every other match in the segment.
      const result =
        selection.mode === 'all'
          ? await bulkSetOutreachByFilter(filters, moveTo, Array.from(selection.excluded))
          : await bulkSetOutreachByIds(Array.from(selection.ids), moveTo);

      setNotice(
        result.capped
          ? `Updated ${result.updated.toLocaleString()} of ${result.matched.toLocaleString()}. Capped at ${result.cap.toLocaleString()} per action — run it again to continue.`
          : `Updated ${result.updated.toLocaleString()} organisation${result.updated === 1 ? '' : 's'}.`,
      );
      clear();
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not apply the change.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell pb-32">
      <div className="page-header">
        <div>
          <h1 className="page-title">Outreach</h1>
          <p className="text-sm text-ink-600 dark:text-muted-foreground mt-1">
            Work the backlog by segment. Pick the reason to call, then act on the whole segment.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setNewLeadOpen(true)}
            className="btn-brutal-teal text-sm inline-flex items-center gap-2 min-h-[44px]"
          >
            <Plus size={16} /> New lead
          </button>
          <Link to="/outreach/board" className="btn-brutal-outline text-sm inline-flex items-center gap-2 min-h-[44px]">
            <Kanban size={16} /> Board view
          </Link>
        </div>
      </div>

      <NewLeadDialog
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        onCreated={() => setRefreshKey((k) => k + 1)}
        initialStage={filters.outreach || 'not_contacted'}
      />

      {/* Segments */}
      <div className="flex flex-wrap gap-2 mb-4">
        {SEGMENTS.map((seg) => {
          const Icon = seg.icon;
          const active = filters.segment === seg.key;
          const count = counts?.[seg.key as keyof typeof counts];
          return (
            <button
              key={seg.key}
              type="button"
              title={seg.hint}
              onClick={() => update({ segment: seg.key })}
              className={`border-3 px-3 py-2 min-h-[44px] inline-flex items-center gap-2 transition-colors ${
                active
                  ? 'border-ink-950 bg-ink-950 text-white dark:border-border'
                  : 'border-ink-950 dark:border-border bg-white dark:bg-card hover:bg-paper dark:hover:bg-muted'
              }`}
            >
              <Icon size={15} className={active ? '' : 'text-teal'} />
              <span className="text-sm font-semibold">{seg.label}</span>
              {typeof count === 'number' && (
                <span className={`font-mono text-2xs ${active ? 'text-ink-300' : 'text-ink-500 dark:text-muted-foreground'}`}>
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="card-brutal p-3 mb-4 flex flex-wrap items-center gap-3">
        <form
          className="flex items-center gap-2 flex-1 min-w-[220px]"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: searchDraft });
          }}
        >
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input-brutal w-full pl-9 min-h-[44px]"
              placeholder="Search by name…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-brutal text-sm min-h-[44px]">Search</button>
        </form>

        <label className="flex items-center gap-2">
          <span className="label-brutal">Stage</span>
          <select
            className="input-brutal min-h-[44px]"
            value={filters.outreach}
            onChange={(e) => update({ outreach: e.target.value })}
          >
            <option value="">Any stage</option>
            {OUTREACH_KANBAN_STATUSES.map((s) => (
              <option key={s} value={s}>{OUTREACH_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>

        {(filters.q || filters.outreach || filters.segment !== 'all') && (
          <button type="button" className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center gap-1"
            onClick={() => { setSearchDraft(''); update({ segment: 'all', outreach: null, q: null }); }}>
            <X size={14} /> Reset
          </button>
        )}
      </div>

      {notice && (
        <div className="card-brutal p-3 mb-4 text-sm bg-paper dark:bg-muted/20">{notice}</div>
      )}
      {error && (
        <div className="card-brutal p-3 mb-4 text-sm border-accent text-accent">{error}</div>
      )}

      {/* Select-all banner: the whole point of this screen */}
      {selected > 0 && (
        <div className="card-brutal p-3 mb-4 bg-ink-950 text-white flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">
            {selected.toLocaleString()} selected
          </span>
          {selection.mode === 'ids' && pageAllSelected && total > leads.length && (
            <button type="button" onClick={selectAllMatching} className="text-sm underline underline-offset-4 hover:text-teal">
              Select all {total.toLocaleString()} matching this filter
            </button>
          )}
          {selection.mode === 'all' && (
            <span className="font-mono text-2xs text-ink-300">
              Every organisation matching the current filter{selection.excluded.size > 0 && `, minus ${selection.excluded.size} you unticked`}
            </span>
          )}
          <button type="button" onClick={clear} className="text-sm underline underline-offset-4 hover:text-teal ml-auto">
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card-brutal overflow-hidden">
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-ink-950 text-white">
              <tr>
                <th className="p-3 w-10 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    className="size-5 accent-teal"
                    checked={pageAllSelected}
                    onChange={() => (pageAllSelected ? clear() : selectIds(leads.map((l) => l.id)))}
                  />
                </th>
                <th className="p-3 text-left label-brutal text-ink-300">Organisation</th>
                <th className="p-3 text-left label-brutal text-ink-300">Website</th>
                <th className="p-3 text-left label-brutal text-ink-300">Stage</th>
                <th className="p-3 text-left label-brutal text-ink-300">Last touched</th>
                <th className="p-3 text-left label-brutal text-ink-300">Contact</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-ink-500">
                    <Loader2 className="animate-spin inline mr-2" size={16} /> Loading…
                  </td>
                </tr>
              )}
              {!loading && leads.map((lead) => {
                const checked = isRowSelected(selection, lead.id);
                return (
                  <tr key={lead.id} className={`border-t-2 border-ink-200 dark:border-border ${checked ? 'bg-teal/10' : ''}`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${lead.name}`}
                        className="size-5 accent-teal"
                        checked={checked}
                        onChange={() => toggle(lead.id)}
                      />
                    </td>
                    <td className="p-3">
                      <Link to={`/organizations/${lead.id}`} className="font-semibold hover:text-teal">
                        {lead.name}
                      </Link>
                      <div className="font-mono text-2xs text-ink-500 dark:text-muted-foreground">
                        {[lead.category, lead.location].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <MonitorCell lead={lead} />
                        {lead.website_url?.trim() && (
                          <a href={lead.website_url} target="_blank" rel="noreferrer noopener"
                            className="text-ink-400 hover:text-teal" title={lead.website_url}>
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-2xs uppercase tracking-wider">
                        {OUTREACH_STATUS_LABELS[lead.outreach_status] ?? lead.outreach_status}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-2xs text-ink-500 dark:text-muted-foreground">
                      {relativeDate(lead.last_outreach_at)}
                    </td>
                    <td className="p-3 font-mono text-2xs text-ink-600 dark:text-muted-foreground">
                      {lead.email || lead.phone || '—'}
                    </td>
                  </tr>
                );
              })}
              {!loading && !leads.length && (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState
                      icon={<Search size={28} />}
                      title="Nothing in this segment"
                      description="Try another segment or clear the filters."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between gap-3 mt-4">
          <p className="font-mono text-2xs text-ink-500 dark:text-muted-foreground">
            {((page - 1) * OUTREACH_PAGE_SIZE + 1).toLocaleString()}–
            {Math.min(page * OUTREACH_PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1}
              onClick={() => update({ page: page - 1 })}
              className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center gap-1 disabled:opacity-40">
              <ChevronLeft size={15} /> Prev
            </button>
            <span className="font-mono text-2xs text-ink-500">Page {page} / {totalPages.toLocaleString()}</span>
            <button type="button" disabled={page >= totalPages}
              onClick={() => update({ page: page + 1 })}
              className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center gap-1 disabled:opacity-40">
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Bulk bar */}
      {selected > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t-3 border-ink-950 bg-white dark:bg-card dark:border-border shadow-brutal">
          <div className="page-shell !py-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold">
              {selected.toLocaleString()} selected
            </span>
            <label className="flex items-center gap-2">
              <span className="label-brutal">Move to</span>
              <select className="input-brutal min-h-[44px]" value={moveTo}
                onChange={(e) => setMoveTo(e.target.value as OutreachStatus)}>
                {OUTREACH_KANBAN_STATUSES.map((s) => (
                  <option key={s} value={s}>{OUTREACH_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={applyBulk} disabled={busy}
              className="btn-brutal-teal text-sm min-h-[44px] inline-flex items-center gap-2 disabled:opacity-50">
              {busy && <Loader2 size={15} className="animate-spin" />}
              Apply to {selected.toLocaleString()}
            </button>
            <button type="button" onClick={clear} className="btn-brutal-outline text-sm min-h-[44px] ml-auto">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
