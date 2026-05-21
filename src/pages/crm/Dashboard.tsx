import { useCrmDashboardStats } from '../../hooks/useCrm';
import { useInquiries } from '../../hooks/useSupabase';
import { MetricCard, SectionHeader } from '../../components/ui';
import { Mail, ArrowRight, Globe, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { stats, loading: statsLoading, error: statsError, websitePct, monitorPct } = useCrmDashboardStats();
  const { inquiries, loading: inqLoading } = useInquiries();

  const newInquiries = inquiries.filter((i) => i.status === 'new').length;
  const recentInquiries = inquiries.filter((i) => i.status === 'new').slice(0, 5);

  const pipelineStatuses = ['listed', 'onboarding', 'under_review', 'verified', 'active', 'lapsed'] as const;
  const pipelineLabels: Record<string, string> = {
    listed: 'Listed (registry)',
    onboarding: 'Onboarding',
    under_review: 'Under Review',
    verified: 'Verified',
    active: 'Active',
    lapsed: 'Lapsed',
  };
  const pipelineColors: Record<string, string> = {
    listed: 'text-ink-500',
    onboarding: 'text-ink-600',
    under_review: 'text-amber-600',
    verified: 'text-teal',
    active: 'text-teal',
    lapsed: 'text-accent',
  };

  return (
    <div className="max-w-6xl mx-auto">
      <SectionHeader>Dashboard</SectionHeader>

      {statsError && (
        <div className="mb-4 border-3 border-accent bg-accent-light px-4 py-3 text-sm text-accent">
          Stats unavailable: {statsError}. Apply migration <code className="font-mono text-xs">010_crm_dashboard_stats</code> and refresh.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
        <MetricCard label="Total in CRM" value={statsLoading ? '—' : stats.total.toLocaleString()} />
        <MetricCard label="NZ registry" value={statsLoading ? '—' : stats.nz_registry.toLocaleString()} />
        <MetricCard label="Listed (directory)" value={statsLoading ? '—' : stats.listed.toLocaleString()} />
        <MetricCard label="NGOreality verified" value={statsLoading ? '—' : stats.verified.toLocaleString()} accent />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <MetricCard label="Outreach due" value={statsLoading ? '—' : stats.outreach_due.toLocaleString()} />
        <MetricCard label="Follow-ups due" value={statsLoading ? '—' : (stats.follow_ups_due ?? 0)} />
        <MetricCard label="Active engagements" value={statsLoading ? '—' : (stats.engagements_active ?? 0)} />
        <MetricCard label="Badge requests" value={statsLoading ? '—' : stats.badge_requests_pending} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <MetricCard label="In verification" value={statsLoading ? '—' : stats.pending.toLocaleString()} />
        <MetricCard label="New inquiries" value={inqLoading ? '—' : newInquiries} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Listed with website"
          value={statsLoading ? '—' : `${websitePct}%`}
          sub={statsLoading ? undefined : `${stats.listed_with_website.toLocaleString()} / ${stats.listed.toLocaleString()}`}
        />
        <MetricCard
          label="Monitors up"
          value={statsLoading ? '—' : `${monitorPct}%`}
          sub={statsLoading ? undefined : `${stats.monitors_up} / ${stats.monitors_total}`}
        />
        <MetricCard label="Sites down" value={statsLoading ? '—' : stats.monitors_down} />
        <MetricCard label="Open incidents" value={statsLoading ? '—' : stats.incidents_open} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <MetricCard label="Active badges" value={statsLoading ? '—' : stats.badges_active} />
        <MetricCard label="Expiring (30d)" value={statsLoading ? '—' : stats.badges_expiring_30d} />
        <MetricCard label="Expired badges" value={statsLoading ? '—' : stats.badges_expired} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-brutal">
          <div className="flex items-center justify-between border-b-3 border-ink-950 px-6 py-4">
            <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
              <Globe size={14} /> Quick actions
            </h3>
          </div>
          <div className="divide-y divide-ink-100">
            <Link to="/work-queue" className="flex items-center justify-between px-6 py-3 hover:bg-ink-50 transition-colors text-sm">
              <span>Today&apos;s work queue</span>
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
            <Link to="/outreach" className="flex items-center justify-between px-6 py-3 hover:bg-ink-50 transition-colors text-sm">
              <span>Outreach board</span>
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
            <Link to="/organizations?status=listed&outreach=not_contacted" className="flex items-center justify-between px-6 py-3 hover:bg-ink-50 transition-colors text-sm">
              <span>Start outreach (not contacted)</span>
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
            <Link to="/badges" className="flex items-center justify-between px-6 py-3 hover:bg-ink-50 transition-colors text-sm">
              <span>Badges expiring / expired</span>
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
            <Link to="/monitoring" className="flex items-center justify-between px-6 py-3 hover:bg-ink-50 transition-colors text-sm">
              <span>Website monitoring</span>
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
            <Link to="/organizations?status=onboarding" className="flex items-center justify-between px-6 py-3 hover:bg-ink-50 transition-colors text-sm">
              <span>Orgs in verification</span>
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
            <Link to="/organizations?hasWebsite=no&status=listed" className="flex items-center justify-between px-6 py-3 hover:bg-ink-50 transition-colors text-sm">
              <span>Listed — no website</span>
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
            <Link to="/verification" className="flex items-center justify-between px-6 py-3 hover:bg-ink-50 transition-colors text-sm">
              <span>Verification queue</span>
              <ArrowRight size={14} className="text-ink-300" />
            </Link>
          </div>
        </div>

        <div className="card-brutal">
          <div className="flex items-center justify-between border-b-3 border-ink-950 px-6 py-4">
            <h3 className="font-mono text-xs uppercase tracking-wider font-semibold">New Inquiries</h3>
            <Link to="/inquiries" className="flex items-center gap-1 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-accent transition-colors">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-ink-100">
            {recentInquiries.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-ink-400">No new inquiries</div>
            ) : (
              recentInquiries.map((inq) => (
                <div key={inq.id} className="flex items-center justify-between px-6 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-accent bg-accent-light font-mono text-xs font-bold text-accent">
                      <Mail size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{inq.organization_name}</div>
                      <div className="font-mono text-2xs text-ink-400 truncate">{inq.contact_name} · {inq.email}</div>
                    </div>
                  </div>
                  <span className="badge-pending shrink-0">New</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 card-brutal">
        <div className="border-b-3 border-ink-950 px-6 py-4">
          <h3 className="font-mono text-xs uppercase tracking-wider font-semibold">Pipeline overview</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-ink-100">
          {pipelineStatuses.map((status) => {
            const count = stats.pipeline[status] ?? 0;
            return (
              <Link
                key={status}
                to={`/organizations?status=${status}`}
                className="px-4 py-6 text-center hover:bg-ink-50 transition-colors"
              >
                <div className={`text-2xl sm:text-3xl font-black ${pipelineColors[status]}`}>
                  {statsLoading ? '—' : count.toLocaleString()}
                </div>
                <div className="label-brutal mt-1 text-2xs">{pipelineLabels[status]}</div>
              </Link>
            );
          })}
        </div>
      </div>

      {!statsLoading && stats.nz_registry > 0 && stats.nz_registry < 10000 && (
        <div className="mt-6 flex gap-3 border-3 border-amber-500 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
          <AlertTriangle size={18} className="shrink-0 text-amber-600" />
          <p>
            Registry count looks low ({stats.nz_registry.toLocaleString()} NZ rows). Run{' '}
            <code className="font-mono text-xs">npm run import:nz-charities</code> without{' '}
            <code className="font-mono text-xs">IMPORT_LIMIT</code> to load ~29k charities.
          </p>
        </div>
      )}
    </div>
  );
}
