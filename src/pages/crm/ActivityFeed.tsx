import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Loader2, ChevronLeft, ChevronRight, History, Search, X,
  ArrowUpRight, Send, Shield, Award, CreditCard, Building2, AlertTriangle, CheckCircle2, UserPlus,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { EmptyState } from '../../components/ui';

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

export default function ActivityFeed() {
  const [params, setParams] = useSearchParams();
  const filterKey = params.get('type') || '';
  const q = params.get('q') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(q);

  const actions = useMemo(
    () => ACTION_FILTERS.find((f) => f.key === filterKey)?.actions ?? [],
    [filterKey],
  );

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

  // Day headers are computed from the page we have; a day that straddles a page
  // boundary simply gets its header again on the next page, which is correct.
  const grouped: { day: string; items: ActivityRow[] }[] = [];
  rows.forEach((row) => {
    const day = dayLabel(row.created_at);
    const last = grouped[grouped.length - 1];
    if (last && last.day === day) last.items.push(row);
    else grouped.push({ day, items: [row] });
  });

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

      {loading && (
        <div className="card-brutal p-8 text-center text-ink-500">
          <Loader2 className="animate-spin inline mr-2" size={16} /> Loading…
        </div>
      )}

      {!loading && !rows.length && (
        <EmptyState icon={<History size={28} />} title="Nothing here yet" description="No activity matches this filter." />
      )}

      {!loading && grouped.map((group) => (
        <section key={group.day} className="mb-6">
          <h2 className="label-brutal mb-2">{group.day}</h2>
          <div className="card-brutal divide-y-2 divide-ink-200 dark:divide-border">
            {group.items.map((row) => {
              const { Icon, tone } = iconFor(row.action);
              const isBulk = Boolean((row.metadata as { bulk?: boolean } | null)?.bulk);
              return (
                <div key={row.id} className="flex items-start gap-3 p-3">
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
                        <Link to={`/organizations/${row.organization_id}`} className="hover:text-teal inline-flex items-center gap-1">
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
        </section>
      ))}

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
