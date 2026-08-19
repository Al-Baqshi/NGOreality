import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Loader2, ChevronLeft, ChevronRight, History, Search, X,
  ArrowUpRight, Send, Shield, Award, CreditCard, Building2, AlertTriangle, CheckCircle2, UserPlus,
  ChevronDown, ChevronUp, Trash2, CheckSquare, Square,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { EmptyState } from '../../components/ui';
import { useConfirm } from '../../contexts/ConfirmContext';

/**
 * Cross-organisation history.
 *
 * Until now the only way to see what had happened was the small "Activity" card
 * inside a single organisation — so "what did we do this week" was unanswerable
 * without opening organisations one at a time. Bulk outreach makes that worse:
 * one action can touch thousands of rows, and the operator needs to see that it
 * happened, and to whom.
 */

const PAGE_SIZE = 60;

interface ActivityRow {
  id: string;
  organization_id: string;
  action: string;
  description: string | null;
  performed_by: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  organizations: { name: string; slug: string | null } | null;
}

/** Curated groups: the raw action vocabulary has ~15 values and grows. */
const ACTION_FILTERS: { key: string; label: string; actions: string[] }[] = [
  { key: '', label: 'Everything', actions: [] },
  { key: 'outreach', label: 'Outreach', actions: ['outreach_updated'] },
  { key: 'signups', label: 'Sign-ups & claims', actions: ['ngo_claim', 'ngo_join', 'ngo_signup', 'customer_registered', 'created'] },
  { key: 'trust', label: 'Verification & badges', actions: ['trust_stage_change', 'badge_issued', 'badge_request_updated', 'criteria_updated'] },
  { key: 'money', label: 'Payments', actions: ['payment_recorded', 'payment_reconciled', 'membership_activated'] },
  { key: 'monitoring', label: 'Website monitoring', actions: ['website_down', 'website_up'] },
];

function iconFor(action: string) {
  if (action === 'website_down') return { Icon: AlertTriangle, tone: 'text-accent' };
  if (action === 'website_up') return { Icon: CheckCircle2, tone: 'text-teal' };
  if (action === 'outreach_updated') return { Icon: Send, tone: 'text-ink-500' };
  if (action.startsWith('ngo_') || action === 'customer_registered') return { Icon: UserPlus, tone: 'text-teal' };
  if (action.startsWith('badge') || action === 'criteria_updated') return { Icon: Award, tone: 'text-gold' };
  if (action === 'trust_stage_change') return { Icon: Shield, tone: 'text-teal' };
  if (action.startsWith('payment') || action.startsWith('membership')) return { Icon: CreditCard, tone: 'text-teal' };
  if (action === 'created') return { Icon: Building2, tone: 'text-ink-500' };
  return { Icon: History, tone: 'text-ink-400' };
}

function when(iso: string): string {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 10080) return `${Math.floor(mins / 1440)}d ago`;
  return d.toLocaleDateString();
}

/** Group rows by calendar day so the feed reads as a diary, not a wall. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Stable key for grouping — avoids "Today" collisions across pages. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function DaySelectCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="size-4 shrink-0 accent-teal cursor-pointer"
      aria-label={label}
    />
  );
}

export default function ActivityFeed() {
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const filterKey = params.get('type') || '';
  const q = params.get('q') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(q);

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dayExpanded, setDayExpanded] = useState<Record<string, boolean>>({});
  const [deleteBusy, setDeleteBusy] = useState(false);

  const actions = useMemo(
    () => ACTION_FILTERS.find((f) => f.key === filterKey)?.actions ?? [],
    [filterKey],
  );

  const grouped = useMemo(() => {
    const groups: { key: string; day: string; items: ActivityRow[] }[] = [];
    rows.forEach((row) => {
      const key = dayKey(row.created_at);
      const day = dayLabel(row.created_at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(row);
      else groups.push({ key, day, items: [row] });
    });
    return groups;
  }, [rows]);

  // Default new day sections to expanded — do not reset toggles the user already set.
  useEffect(() => {
    setDayExpanded((prev) => {
      let changed = false;
      const next = { ...prev };
      grouped.forEach((g) => {
        if (!(g.key in next)) {
          next[g.key] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [grouped]);

  const isDayExpanded = useCallback(
    (key: string) => dayExpanded[key] !== false,
    [dayExpanded],
  );

  const toggleDay = (key: string) => {
    setDayExpanded((prev) => ({ ...prev, [key]: prev[key] === false }));
  };

  const expandAll = () => {
    setDayExpanded((prev) => {
      const next = { ...prev };
      grouped.forEach((g) => { next[g.key] = true; });
      return next;
    });
  };

  const collapseAll = () => {
    setDayExpanded((prev) => {
      const next = { ...prev };
      grouped.forEach((g) => { next[g.key] = false; });
      return next;
    });
  };

  const allDaysExpanded = grouped.length > 0 && grouped.every((g) => isDayExpanded(g.key));
  const allDaysCollapsed = grouped.length > 0 && grouped.every((g) => !isDayExpanded(g.key));

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectIds = (ids: string[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (selected) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const toggleDaySelection = (items: ActivityRow[]) => {
    const ids = items.map((r) => r.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    selectIds(ids, !allSelected);
  };

  const daySelectionState = (items: ActivityRow[]) => {
    const ids = items.map((r) => r.id);
    const selectedCount = ids.filter((id) => selectedIds.has(id)).length;
    return {
      selectedCount,
      allSelected: ids.length > 0 && selectedCount === ids.length,
      someSelected: selectedCount > 0 && selectedCount < ids.length,
    };
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(rows.map((r) => r.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const idsToDelete = Array.from(selectedIds);
    const ok = await confirm({
      title: 'Delete activity entries?',
      description: `Delete ${idsToDelete.length} selected activity entr${idsToDelete.length === 1 ? 'y' : 'ies'}? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    setDeleteBusy(true);
    try {
      const { error: deleteError } = await supabase.from('activity_log').delete().in('id', idsToDelete);
      if (deleteError) throw deleteError;
      const deleted = new Set(idsToDelete);
      setRows((prev) => prev.filter((r) => !deleted.has(r.id)));
      setTotal((t) => Math.max(0, t - idsToDelete.length));
      clearSelection();
      setSelectionMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    let query = supabase
      .from('activity_log')
      .select(
        'id, organization_id, action, description, performed_by, created_at, metadata, organizations(name, slug)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (actions.length) query = query.in('action', actions);
    if (q) query = query.ilike('description', `%${q}%`);

    query.then(({ data, error, count }) => {
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setRows([]);
        setTotal(0);
      } else {
        setRows((data ?? []) as unknown as ActivityRow[]);
        setTotal(count ?? 0);
        setError(null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [actions, q, page]);

  function update(next: Record<string, string | number | null>) {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => {
      if (v === null || v === '') p.delete(k);
      else p.set(k, String(v));
    });
    if (!('page' in next)) p.delete('page');
    setParams(p);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="text-sm text-ink-600 dark:text-muted-foreground mt-1">
            Everything that has happened, newest first — across every organisation.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {ACTION_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => update({ type: f.key })}
            className={`border-3 px-3 py-2 min-h-[44px] text-sm font-semibold transition-colors ${
              filterKey === f.key
                ? 'border-ink-950 bg-ink-950 text-white dark:border-border'
                : 'border-ink-950 dark:border-border bg-white dark:bg-card hover:bg-paper dark:hover:bg-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <form
        className="card-brutal p-3 mb-4 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: draft });
        }}
      >
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input-brutal w-full pl-9 min-h-[44px]"
            placeholder="Search what happened…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-brutal text-sm min-h-[44px]">Search</button>
        {(q || filterKey) && (
          <button
            type="button"
            className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center gap-1"
            onClick={() => { setDraft(''); update({ q: null, type: null }); }}
          >
            <X size={14} /> Reset
          </button>
        )}
      </form>

      {error && <div className="card-brutal p-3 mb-4 text-sm border-accent text-accent">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="font-mono text-2xs uppercase tracking-wider text-ink-500">
          {!loading && total > 0
            ? `${total.toLocaleString()} entr${total === 1 ? 'y' : 'ies'}`
            : loading
              ? 'Loading…'
              : 'No entries'}
        </p>
        {!loading && grouped.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={expandAll}
              disabled={allDaysExpanded}
              className="btn-brutal-outline text-sm min-h-[40px] inline-flex items-center gap-1 disabled:opacity-40"
            >
              <ChevronDown size={14} aria-hidden />
              Expand all days
            </button>
            <button
              type="button"
              onClick={collapseAll}
              disabled={allDaysCollapsed}
              className="btn-brutal-outline text-sm min-h-[40px] inline-flex items-center gap-1 disabled:opacity-40"
            >
              <ChevronUp size={14} aria-hidden />
              Collapse all days
            </button>
            <button
              type="button"
              onClick={toggleSelectionMode}
              className={`text-sm min-h-[40px] inline-flex items-center gap-1 ${
                selectionMode ? 'btn-brutal-outline' : 'btn-brutal-teal'
              }`}
            >
              <CheckSquare size={14} aria-hidden />
              {selectionMode ? 'Exit selection' : 'Select to delete'}
            </button>
          </div>
        )}
      </div>

      {selectionMode && (
        <section
          className="mb-4 w-full overflow-hidden rounded-lg border-2 border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-white to-amber-50/60 p-3 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:via-card dark:to-card"
          aria-label="Selection actions"
        >
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="rounded-md bg-amber-500 px-2 py-1 font-mono text-2xs font-bold tabular-nums text-white">
              {selectedIds.size}
            </span>
            <span className="text-sm font-semibold text-ink-800 dark:text-foreground">
              selected on this page
            </span>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <button
                type="button"
                onClick={selectAllVisible}
                disabled={selectedIds.size === rows.length || rows.length === 0}
                className="btn-brutal-outline text-xs min-h-[36px] inline-flex items-center gap-1 disabled:opacity-40"
              >
                <CheckSquare size={13} aria-hidden />
                Select all on page
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selectedIds.size === 0}
                className="btn-brutal-outline text-xs min-h-[36px] inline-flex items-center gap-1 disabled:opacity-40"
              >
                <Square size={13} aria-hidden />
                Clear
              </button>
              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                disabled={selectedIds.size === 0 || deleteBusy}
                className="btn-brutal-accent text-xs min-h-[36px] inline-flex items-center gap-1 disabled:opacity-40"
              >
                {deleteBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} aria-hidden />}
                Delete selected
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-500 dark:text-muted-foreground">
            Tip: use the checkbox on each day header to select or clear that whole day.
          </p>
        </section>
      )}

      {loading && (
        <div className="card-brutal p-8 text-center text-ink-500">
          <Loader2 className="animate-spin inline mr-2" size={16} /> Loading…
        </div>
      )}

      {!loading && !rows.length && (
        <EmptyState icon={<History size={28} />} title="Nothing here yet" description="No activity matches this filter." />
      )}

      {!loading && grouped.map((group) => {
        const expanded = isDayExpanded(group.key);
        const { allSelected, someSelected, selectedCount } = daySelectionState(group.items);
        return (
          <section key={group.key} className="mb-6">
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-ink-200/80 bg-paper/60 px-3 py-2 dark:border-border dark:bg-muted/20">
              {selectionMode && (
                <DaySelectCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={() => toggleDaySelection(group.items)}
                  label={`Select all activity for ${group.day}`}
                />
              )}
              <button
                type="button"
                onClick={() => toggleDay(group.key)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-expanded={expanded}
              >
                {expanded ? (
                  <ChevronUp size={16} className="shrink-0 text-ink-500" aria-hidden />
                ) : (
                  <ChevronDown size={16} className="shrink-0 text-ink-500" aria-hidden />
                )}
                <h2 className="label-brutal mb-0">{group.day}</h2>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {selectionMode && selectedCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-mono text-[10px] tabular-nums text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                    {selectedCount} selected
                  </span>
                )}
                <span className="font-mono text-2xs text-ink-400">
                  {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => toggleDay(group.key)}
                  className="btn-brutal-outline text-2xs min-h-[32px] px-2 py-1"
                >
                  {expanded ? 'Collapse' : 'Expand'}
                </button>
              </div>
            </div>
            {expanded && (
              <div className="card-brutal divide-y-2 divide-ink-200 dark:divide-border">
                {group.items.map((row) => {
                  const { Icon, tone } = iconFor(row.action);
                  const isBulk = Boolean((row.metadata as { bulk?: boolean } | null)?.bulk);
                  const isSelected = selectedIds.has(row.id);
                  return (
                    <div
                      key={row.id}
                      role={selectionMode ? 'button' : undefined}
                      tabIndex={selectionMode ? 0 : undefined}
                      onKeyDown={
                        selectionMode
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleSelect(row.id);
                              }
                            }
                          : undefined
                      }
                      className={`flex items-start gap-3 p-3 transition-colors ${
                        selectionMode ? 'cursor-pointer hover:bg-ink-50/80 dark:hover:bg-muted/40' : ''
                      } ${isSelected && selectionMode ? 'bg-amber-50/90 ring-2 ring-inset ring-amber-300/80 dark:bg-amber-950/20 dark:ring-amber-700/50' : ''}`}
                      onClick={selectionMode ? () => toggleSelect(row.id) : undefined}
                    >
                      {selectionMode && (
                        <DaySelectCheckbox
                          checked={isSelected}
                          indeterminate={false}
                          onChange={() => toggleSelect(row.id)}
                          label={`Select activity: ${row.description || row.action}`}
                        />
                      )}
                      <Icon size={16} className={`${tone} shrink-0 mt-0.5`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          {row.description || row.action}
                          {isBulk && (
                            <span className="ml-2 font-mono text-2xs uppercase tracking-wider text-ink-400">bulk</span>
                          )}
                        </p>
                        <p className="font-mono text-2xs text-ink-500 dark:text-muted-foreground mt-0.5">
                          {row.organizations?.name ? (
                            <Link
                              to={`/organizations/${row.organization_id}`}
                              className="hover:text-teal inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {row.organizations.name} <ArrowUpRight size={11} />
                            </Link>
                          ) : (
                            <span>Unknown organisation</span>
                          )}
                          {row.performed_by ? ` · ${row.performed_by}` : ''}
                        </p>
                      </div>
                      <time
                        className="font-mono text-2xs text-ink-400 shrink-0 whitespace-nowrap"
                        dateTime={row.created_at}
                        title={new Date(row.created_at).toLocaleString()}
                      >
                        {when(row.created_at)}
                      </time>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {total > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-2xs text-ink-500 dark:text-muted-foreground">
            {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => update({ page: page - 1 })}
              className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center gap-1 disabled:opacity-40">
              <ChevronLeft size={15} /> Prev
            </button>
            <span className="font-mono text-2xs text-ink-500">Page {page} / {totalPages.toLocaleString()}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => update({ page: page + 1 })}
              className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center gap-1 disabled:opacity-40">
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}