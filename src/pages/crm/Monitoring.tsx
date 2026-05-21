import { Link } from 'react-router-dom';
import { useCrmDashboardStats, useWorkQueue } from '../../hooks/useCrm';
import { SectionHeader } from '../../components/ui';
import { Activity, Globe } from 'lucide-react';

export default function Monitoring() {
  const { stats, loading, websitePct, monitorPct } = useCrmDashboardStats();
  const { incidents, loading: incLoading } = useWorkQueue();

  return (
    <div className="max-w-4xl mx-auto">
      <SectionHeader>Website monitoring</SectionHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="card-brutal p-5 text-center">
          <div className="text-3xl font-black">{loading ? '—' : `${websitePct}%`}</div>
          <div className="label-brutal mt-1">Listed w/ website</div>
        </div>
        <div className="card-brutal p-5 text-center">
          <div className="text-3xl font-black text-teal">{loading ? '—' : `${monitorPct}%`}</div>
          <div className="label-brutal mt-1">Monitors up</div>
        </div>
        <div className="card-brutal p-5 text-center">
          <div className="text-3xl font-black text-accent">{loading ? '—' : stats.monitors_down}</div>
          <div className="label-brutal mt-1">Down now</div>
        </div>
        <div className="card-brutal p-5 text-center">
          <div className="text-3xl font-black">{loading ? '—' : stats.incidents_open}</div>
          <div className="label-brutal mt-1">Open incidents</div>
        </div>
      </div>

      <p className="font-mono text-2xs text-ink-500 mb-4 uppercase tracking-wider">
        Go worker syncs monitors from org website URLs. Run <code className="normal-case">cd backend && make worker</code> locally.
      </p>

      <div className="card-brutal">
        <div className="border-b-3 border-ink-950 px-4 py-3 flex items-center gap-2">
          <Activity size={14} />
          <h3 className="font-mono text-xs uppercase tracking-wider font-semibold">Open incidents</h3>
        </div>
        {incLoading ? (
          <p className="p-6 text-sm text-ink-400 text-center">Loading…</p>
        ) : incidents.length === 0 ? (
          <p className="p-6 text-sm text-ink-400 text-center">No open incidents</p>
        ) : (
          <div className="divide-y divide-ink-100">
            {incidents.map((inc) => (
              <Link
                key={inc.id}
                to={`/organizations/${inc.organization_id}`}
                className="flex items-start gap-3 px-4 py-3 hover:bg-ink-50"
              >
                <Globe size={16} className="text-accent shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{inc.organizations?.name}</div>
                  <div className="font-mono text-2xs text-ink-500 truncate">{inc.organizations?.website_url}</div>
                  <div className="text-xs text-accent mt-1">{inc.error_message || 'Unreachable'}</div>
                  <div className="font-mono text-2xs text-ink-400 mt-0.5">
                    Since {new Date(inc.opened_at).toLocaleString()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link
        to="/organizations?hasWebsite=no&status=listed"
        className="inline-block mt-6 btn-brutal-outline text-sm"
      >
        Listed orgs without website
      </Link>
    </div>
  );
}
