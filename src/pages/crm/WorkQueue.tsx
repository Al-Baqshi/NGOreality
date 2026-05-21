import { Link } from 'react-router-dom';
import { useCrmDashboardStats, useWorkQueue } from '../../hooks/useCrm';
import { SectionHeader } from '../../components/ui';
import { BADGE_REQUEST_STATUS_LABELS, ENGAGEMENT_STATUS_LABELS, ENGAGEMENT_TYPE_LABELS } from '../../types';
import { Calendar, Award, AlertTriangle, Phone, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function WorkQueue() {
  const { stats, loading: statsLoading } = useCrmDashboardStats();
  const { followUps, tasks, badgeRequests, incidents, loading, refetch } = useWorkQueue();

  const completeTask = async (taskId: string) => {
    await supabase
      .from('staff_tasks')
      .update({ status: 'done', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', taskId);
    refetch();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <SectionHeader>Work queue</SectionHeader>
      <p className="font-mono text-2xs text-ink-500 uppercase tracking-wider -mt-4 mb-6">
        Your daily operating list
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="card-brutal p-4 text-center">
          <div className="text-2xl font-black">{statsLoading ? '—' : stats.outreach_due}</div>
          <div className="label-brutal mt-1">Outreach due</div>
        </div>
        <div className="card-brutal p-4 text-center">
          <div className="text-2xl font-black">{statsLoading ? '—' : stats.follow_ups_due}</div>
          <div className="label-brutal mt-1">Follow-ups</div>
        </div>
        <div className="card-brutal p-4 text-center">
          <div className="text-2xl font-black">{statsLoading ? '—' : stats.badge_requests_pending}</div>
          <div className="label-brutal mt-1">Badge requests</div>
        </div>
        <div className="card-brutal p-4 text-center">
          <div className="text-2xl font-black text-accent">{statsLoading ? '—' : stats.incidents_open}</div>
          <div className="label-brutal mt-1">Sites down</div>
        </div>
      </div>

      {loading ? (
        <p className="font-mono text-sm text-ink-400">Loading queue…</p>
      ) : (
        <div className="space-y-8">
          <QueueSection
            title="Follow-ups due"
            icon={<Calendar size={14} />}
            empty="No follow-ups due today"
            count={followUps.length}
          >
            {followUps.map((e) => (
              <QueueRow
                key={e.id}
                to={`/organizations/${e.organization_id}`}
                title={e.organizations?.name ?? 'Organization'}
                meta={`${ENGAGEMENT_TYPE_LABELS[e.engagement_type]} · ${ENGAGEMENT_STATUS_LABELS[e.status]}`}
                sub={e.next_follow_up_at ? new Date(e.next_follow_up_at).toLocaleString() : ''}
              />
            ))}
          </QueueSection>

          <QueueSection title="Tasks due" icon={<Phone size={14} />} empty="No tasks due" count={tasks.length}>
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-4 py-3 border-b border-ink-100 last:border-0">
                <Link to={`/organizations/${t.organization_id}`} className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{t.title}</div>
                  <div className="font-mono text-2xs text-ink-400 truncate">
                    {t.organizations?.name} · due {t.due_date}
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => completeTask(t.id)}
                  className="btn-brutal-outline p-2 min-h-[44px] min-w-[44px] shrink-0"
                  aria-label="Mark done"
                >
                  <CheckCircle2 size={18} />
                </button>
              </div>
            ))}
          </QueueSection>

          <QueueSection title="Badge requests" icon={<Award size={14} />} empty="No pending requests" count={badgeRequests.length}>
            {badgeRequests.map((r) => (
              <QueueRow
                key={r.id}
                to={`/organizations/${r.organization_id}`}
                title={r.organizations?.name ?? 'Organization'}
                meta={BADGE_REQUEST_STATUS_LABELS[r.status]}
                sub={r.request_type}
              />
            ))}
          </QueueSection>

          <QueueSection
            title="Open website incidents"
            icon={<AlertTriangle size={14} />}
            empty="All monitors green"
            count={incidents.length}
          >
            {incidents.map((inc) => (
              <QueueRow
                key={inc.id}
                to={`/organizations/${inc.organization_id}`}
                title={inc.organizations?.name ?? 'Organization'}
                meta={inc.error_message || 'Site unreachable'}
                sub={new Date(inc.opened_at).toLocaleString()}
              />
            ))}
          </QueueSection>
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/outreach" className="btn-brutal-accent text-sm">
          Outreach board
        </Link>
        <Link to="/organizations?status=listed&outreach=not_contacted" className="btn-brutal-outline text-sm">
          Start calls
        </Link>
      </div>
    </div>
  );
}

function QueueSection({
  title,
  icon,
  empty,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="card-brutal">
      <div className="border-b-3 border-ink-950 px-4 py-3 flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
          {icon} {title}
        </h3>
        <span className="font-mono text-2xs text-ink-400">{count}</span>
      </div>
      {count === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-400 text-center">{empty}</p>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}

function QueueRow({
  to,
  title,
  meta,
  sub,
}: {
  to: string;
  title: string;
  meta: string;
  sub?: string;
}) {
  return (
    <Link to={to} className="block px-4 py-3 border-b border-ink-100 last:border-0 hover:bg-ink-50 transition-colors">
      <div className="text-sm font-semibold">{title}</div>
      <div className="font-mono text-2xs text-ink-500 uppercase tracking-wider">{meta}</div>
      {sub && <div className="font-mono text-2xs text-ink-400 mt-0.5">{sub}</div>}
    </Link>
  );
}
