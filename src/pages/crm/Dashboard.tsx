import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, AlertTriangle, Award, CreditCard, Inbox, Send, UserPlus,
  CheckCircle2, History,
} from 'lucide-react';
import { useCrmDashboardStats } from '../../hooks/useCrm';
import { useCrmNavCounts } from '../../hooks/useCrmNavCounts';
import { supabase } from '../../lib/supabase';
import { MetricCard } from '../../components/ui';
import RegistryInsights from '../../components/crm/RegistryInsights';

/**
 * The super-admin command centre.
 *
 * The previous dashboard showed 25 numbers of equal visual weight with no
 * ordering, so "what should I do right now" and "is anything on fire" both took
 * a scan of the whole page. Numbers are not the job; deciding is.
 *
 * So: what needs a human first, then the funnel, then what is selling, then a
 * window on recent history. A count of zero is not shown at all — an empty
 * "Needs you" list is the strongest possible signal that nothing is waiting.
 */

interface ActionItem {
  key: string;
  count: number;
  label: string;
  verb: string;
  to: string;
  icon: typeof Inbox;
  urgent?: boolean;
}

interface RecentActivity {
  id: string;
  organization_id: string;
  action: string;
  description: string | null;
  created_at: string;
  organizations: { name: string } | null;
}

function useRecentActivity(limit = 8) {
  const [rows, setRows] = useState<RecentActivity[]>([]);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('activity_log')
      .select('id, organization_id, action, description, created_at, organizations(name)')
      .order('created_at', { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        if (!cancelled) setRows((data ?? []) as unknown as RecentActivity[]);
      });
    return () => { cancelled = true; };
  }, [limit]);
  return rows;
}

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

export default function Dashboard() {
  const { stats, loading, error, websitePct, monitorPct } = useCrmDashboardStats();
  const counts = useCrmNavCounts();
  const recent = useRecentActivity();

  const actions: ActionItem[] = [
    { key: 'inquiries', count: counts.inquiries, label: 'new enquiry', verb: 'Reply', to: '/inquiries', icon: Inbox, urgent: true },
    { key: 'badges', count: stats?.badge_requests_pending ?? 0, label: 'badge request', verb: 'Review', to: '/registrations', icon: Award, urgent: true },
    { key: 'setup', count: stats?.ngo_setup_requests_pending ?? 0, label: 'setup request', verb: 'Review', to: '/registrations', icon: UserPlus, urgent: true },
    { key: 'unreconciled', count: counts.unreconciled, label: 'payment to reconcile', verb: 'Match', to: '/reconciliation', icon: CreditCard },
    { key: 'followups', count: stats?.follow_ups_due ?? 0, label: 'follow-up due', verb: 'Work', to: '/work-queue', icon: Send },
    { key: 'tasks', count: stats?.tasks_due_today ?? 0, label: 'task due', verb: 'Do', to: '/work-queue', icon: CheckCircle2 },
    { key: 'incidents', count: stats?.incidents_open ?? 0, label: 'site down', verb: 'Check', to: '/monitoring', icon: AlertTriangle },
  ].filter((a) => a.count > 0);

  const n = (v: number | undefined) => (loading || v === undefined ? '—' : v.toLocaleString());

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-ink-600 dark:text-muted-foreground mt-1">
            What needs you, how the funnel is moving, and what is selling.
          </p>
        </div>
        <Link to="/activity" className="btn-brutal-outline text-sm inline-flex items-center gap-2 min-h-[44px]">
          <History size={16} /> Full history
        </Link>
      </div>

      {error && (
        <div className="card-brutal border-accent p-3 mb-4 text-sm text-accent">
          Stats unavailable: {error}
        </div>
      )}

      {/* 1. What needs a human */}
      <section className="mb-8">
        <h2 className="label-brutal mb-2">Needs you now</h2>
        {actions.length === 0 ? (
          <div className="card-brutal p-5 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-teal shrink-0" />
            <p className="text-sm">
              {loading ? 'Checking…' : 'Nothing is waiting. Everything in the queues is clear.'}
            </p>
          </div>
        ) : (
          <div className="card-brutal divide-y-2 divide-ink-200 dark:divide-border">
            {actions.map(({ key, count, label, verb, to, icon: Icon, urgent }) => (
              <Link key={key} to={to}
                className="flex items-center gap-3 p-4 hover:bg-paper dark:hover:bg-muted transition-colors group">
                <Icon size={18} className={urgent ? 'text-accent shrink-0' : 'text-ink-500 shrink-0'} />
                <span className="text-2xl font-black tabular-nums">{count.toLocaleString()}</span>
                <span className="text-sm text-ink-700 dark:text-foreground/80">
                  {label}{count === 1 ? '' : 's'} waiting
                </span>
                <span className="ml-auto text-sm font-semibold inline-flex items-center gap-1 group-hover:text-teal">
                  {verb} <ArrowRight size={15} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 2. Funnel — the registry becoming customers */}
      <section className="mb-8">
        <h2 className="label-brutal mb-2">Funnel</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Link to="/outreach" className="card-brutal-hover p-4 block">
            <p className="label-brutal">Leads to contact</p>
            <p className="stat-value">{n(stats?.outreach_due)}</p>
            <p className="stat-sub">not yet contacted</p>
          </Link>
          <Link to="/outreach?segment=site_down" className="card-brutal-hover p-4 block">
            <p className="label-brutal">Site down</p>
            <p className="stat-value text-accent">{n(stats?.monitors_down)}</p>
            <p className="stat-sub">strongest reason to call</p>
          </Link>
          <Link to="/outreach?segment=no_website" className="card-brutal-hover p-4 block">
            <p className="label-brutal">No website</p>
            <p className="stat-value">{n(stats?.listed_without_website)}</p>
            <p className="stat-sub">needs one built</p>
          </Link>
          <Link to="/organizations?status=onboarding" className="card-brutal-hover p-4 block">
            <p className="label-brutal">Onboarding</p>
            <p className="stat-value">{n(stats?.pending)}</p>
            <p className="stat-sub">signed up, in progress</p>
          </Link>
          <Link to="/customers" className="card-brutal-hover p-4 block">
            <p className="label-brutal">Customers</p>
            <p className="stat-value text-teal">{n(stats?.verified)}</p>
            <p className="stat-sub">verified or active</p>
          </Link>
        </div>
      </section>

      {/* 3. Products — what is actually selling */}
      <section className="mb-8">
        <h2 className="label-brutal mb-2">Products</h2>
        <div className="responsive-grid">
          <MetricCard label="Active badges" value={n(stats?.badges_active)} />
          <MetricCard label="Expiring in 30 days" value={n(stats?.badges_expiring_30d)} />
          <MetricCard label="Expired badges" value={n(stats?.badges_expired)} />
          <MetricCard label="Active engagements" value={n(stats?.engagements_active)} />
        </div>
        <p className="mt-2 font-mono text-2xs text-ink-500 dark:text-muted-foreground">
          Pricing lives on{' '}
          <Link to="/public/pricing" className="underline underline-offset-2 hover:text-teal">the public pricing page</Link>.
        </p>
      </section>

      {/* 4. Coverage — the health of the registry we monitor */}
      <section className="mb-8">
        <h2 className="label-brutal mb-2">Registry coverage</h2>
        <div className="responsive-grid">
          <MetricCard label="Listed with a website" value={loading ? '—' : `${websitePct}%`} />
          <MetricCard label="Monitors reporting up" value={loading ? '—' : `${monitorPct}%`} />
          <MetricCard label="Without a website" value={n(stats?.listed_without_website)} />
          <MetricCard label="In NZ registry" value={n(stats?.nz_registry)} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 mb-8">
        {/* 5. Recent history */}
        <section>
          <h2 className="label-brutal mb-2">Latest activity</h2>
          <div className="card-brutal divide-y-2 divide-ink-200 dark:divide-border">
            {recent.length === 0 && (
              <p className="p-4 text-sm text-ink-500 dark:text-muted-foreground">Nothing recorded yet.</p>
            )}
            {recent.map((row) => (
              <div key={row.id} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{row.description || row.action}</p>
                  <Link to={`/organizations/${row.organization_id}`}
                    className="font-mono text-2xs text-ink-500 dark:text-muted-foreground hover:text-teal">
                    {row.organizations?.name ?? 'Unknown organisation'}
                  </Link>
                </div>
                <span className="font-mono text-2xs text-ink-400 shrink-0">{ago(row.created_at)}</span>
              </div>
            ))}
            <Link to="/activity" className="flex items-center justify-between p-3 text-sm font-semibold hover:text-teal">
              See full history <ArrowRight size={15} />
            </Link>
          </div>
        </section>

        <section>
          <h2 className="label-brutal mb-2">Registry insight</h2>
          <RegistryInsights country="NZ" />
        </section>
      </div>
    </div>
  );
}
