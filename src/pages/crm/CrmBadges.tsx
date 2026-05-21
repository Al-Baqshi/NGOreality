import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader } from '../../components/ui';
import { useCrmDashboardStats, useExpiringBadges } from '../../hooks/useCrm';
import { Award } from 'lucide-react';

export default function CrmBadges() {
  const [tab, setTab] = useState<'expiring' | 'expired'>('expiring');
  const { stats, loading: statsLoading } = useCrmDashboardStats();
  const { rows, loading } = useExpiringBadges(tab);

  return (
    <div className="max-w-4xl mx-auto">
      <SectionHeader>Badges & renewals</SectionHeader>

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setTab('expiring')}
          className={`px-4 py-2 min-h-[44px] font-mono text-2xs uppercase tracking-wider border-3 border-ink-950 ${
            tab === 'expiring' ? 'bg-ink-950 text-white' : 'bg-white text-ink-600'
          }`}
        >
          Expiring 30d ({statsLoading ? '—' : stats.badges_expiring_30d})
        </button>
        <button
          type="button"
          onClick={() => setTab('expired')}
          className={`px-4 py-2 min-h-[44px] font-mono text-2xs uppercase tracking-wider border-3 border-ink-950 ${
            tab === 'expired' ? 'bg-accent text-white' : 'bg-white text-ink-600'
          }`}
        >
          Expired ({statsLoading ? '—' : stats.badges_expired})
        </button>
      </div>

      <div className="card-brutal">
        <div className="border-b-3 border-ink-950 px-4 py-3 flex items-center gap-2">
          <Award size={14} />
          <h3 className="font-mono text-xs uppercase tracking-wider font-semibold">
            {tab === 'expiring' ? 'Call for renewal' : 'Expired — action needed'}
          </h3>
        </div>
        {loading ? (
          <p className="px-4 py-8 font-mono text-sm text-ink-400 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-ink-400 text-center">None in this list</p>
        ) : (
          <div className="divide-y divide-ink-100">
            {rows.map((b) => (
              <Link
                key={b.id}
                to={`/organizations/${b.organizations?.id ?? b.organization_id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-ink-50"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{b.organizations?.name}</div>
                  <div className="font-mono text-2xs text-ink-400">{b.verification_id}</div>
                </div>
                <div className="font-mono text-xs shrink-0 text-ink-600">
                  {b.expires_at ? new Date(b.expires_at).toLocaleDateString() : '—'}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
