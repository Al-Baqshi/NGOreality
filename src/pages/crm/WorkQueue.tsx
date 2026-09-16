import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCrmDashboardStats, useWorkQueue } from '../../hooks/useCrm';
import { SectionHeader, QueryError } from '../../components/ui';
import {
  BADGE_REQUEST_STATUS_LABELS,
  ENGAGEMENT_STATUS_LABELS,
  ENGAGEMENT_TYPE_LABELS,
  NGO_SETUP_REQUEST_STATUS_LABELS,
} from '../../types';
import { Calendar, Award, AlertTriangle, Phone, CheckCircle2, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { captureEmptyMutation, captureError } from '../../lib/errorReporting';
import { formatNzDate, formatNzDateTime } from '@/lib/formatDate';

export default function WorkQueue() {
  const { stats, error: statsError, ready: statsReady, refetch: refetchStats } = useCrmDashboardStats();
  const { followUps, tasks, badgeRequests, setupRequests, incidents, followUpsError, tasksError, badgeRequestsError, setupRequestsError, incidentsError, loading, error, refetch } = useWorkQueue();

  const [taskError, setTaskError] = useState<string | null>(null);

  const completeTask = async (taskId: string) => {
    setTaskError(null);
    const { data, error: updateError } = await supabase
      .from('staff_tasks')
      .update({ status: 'done', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .select('id');
    if (updateError) {
      setTaskError(captureError(updateError, { where: 'WorkQueue.completeTask' }));
      return;
    }
    if (!data?.length) {
      setTaskError(captureEmptyMutation('WorkQueue.completeTask.empty'));
      return;
    }
    refetch();
  };

  return (
    <div className="w-full min-w-0 max-w-4xl">
      <SectionHeader>Work queue</SectionHeader>
      <p className="font-mono text-2xs text-ink-500 uppercase tracking-wider -mt-4 mb-6">
        Your daily operating list
      </p>

      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3 mb-8 lg:grid-cols-4">
        <div className="card-brutal p-4 text-center">
          <div className="text-2xl font-black">{!statsReady ? '—' : stats.outreach_due}</div>
          <div className="label-brutal mt-1">Outreach due</div>
        </div>
        <div className="card-brutal p-4 text-center">
          <div className="text-2xl font-black">{!statsReady ? '—' : stats.follow_ups_due}</div>
          <div className="label-brutal mt-1">Follow-ups</div>
        </div>
        <div className="card-brutal p-4 text-center">
          <div className="text-2xl font-black">{!statsReady ? '—' : stats.badge_requests_pending}</div>
          <div className="label-brutal mt-1">Badge requests</div>
        </div>
        <div className="card-brutal p-4 text-center">
          <div className="text-2xl font-black">{!statsReady ? '—' : stats.ngo_setup_requests_pending ?? 0}</div>
          <div className="label-brutal mt-1">NGO setup</div>
        </div>
        <div className="card-brutal p-4 text-center">
          <div className="text-2xl font-black text-accent">{!statsReady ? '—' : stats.incidents_open}</div>
          <div className="label-brutal mt-1">Sites down</div>
        </div>
      </div>

      {statsError && <QueryError message={statsError} onRetry={refetchStats} />}
      {error && <QueryError message={error} onRetry={refetch} />}
      {taskError && <QueryError message={taskError} />}

      {loading &&
      followUps.length === 0 &&
      tasks.length === 0 &&
      badgeRequests.length === 0 &&
      setupRequests.length === 0 &&
      incidents.length === 0 ? (
        <p className="font-mono text-sm text-ink-400">Loading queue…</p>
      ) : (
        <div className="space-y-8">
          <QueueSection
            title="Follow-ups due"
            icon={<Calendar size={14} />}
            empty="No follow-ups due today"
            failed={Boolean(followUpsError)}
            count={followUps.length}
          >
            {followUps.map((e) => (
              <QueueRow
                key={e.id}
                to={`/organizations/${e.organization_id}`}
                title={e.organizations?.name ?? 'Organization'}
                meta={`${ENGAGEMENT_TYPE_LABELS[e.engagement_type]} · ${ENGAGEMENT_STATUS_LABELS[e.status]}`}
                sub={e.next_follow_up_at ? formatNzDateTime(e.next_follow_up_at) : ''}
              />
            ))}
          </QueueSection>

          <QueueSection title="Tasks due" icon={<Phone size={14} />} empty="No tasks due" failed={Boolean(tasksError)} count={tasks.length}>
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-4 py-3 border-b border-ink-100 last:border-0">
                <Link to={`/organizations/${t.organization_id}`} className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{t.title}</div>
                  <div className="font-mono text-2xs text-ink-400 truncate">
                    {t.organizations?.name} · due {formatNzDate(t.due_date)}
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

          <QueueSection
            title="Badge requests"
            icon={<Award size={14} />}
            empty="No pending requests"
            failed={Boolean(badgeRequestsError)}
            count={badgeRequests.length}
            action={
              <Link to="/registrations" className="font-mono text-2xs uppercase tracking-wider text-teal hover:underline">
                Review & approve →
              </Link>
            }
          >
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
            title="NGO setup requests"
            icon={<Sparkles size={14} />}
            empty="No pending setup requests"
            failed={Boolean(setupRequestsError)}
            count={setupRequests.length}
            action={
              <Link to="/registrations" className="font-mono text-2xs uppercase tracking-wider text-teal hover:underline">
                Review & approve →
              </Link>
            }
          >
            {setupRequests.map((r) => (
              <QueueRow
                key={r.id}
                to={`/organizations/${r.organization_id}`}
                title={r.organizations?.name ?? 'Organization'}
                meta={NGO_SETUP_REQUEST_STATUS_LABELS[r.status]}
                sub={
                  r.wants_landing_package
                    ? 'Landing + standards'
                    : r.has_existing_website
                      ? 'Has website'
                      : r.request_kind.replace('_', ' ')
                }
              />
            ))}
          </QueueSection>

          <QueueSection
            title="Open website incidents"
            icon={<AlertTriangle size={14} />}
            empty="All monitors green"
            failed={Boolean(incidentsError)}
            count={incidents.length}
          >
            {incidents.map((inc) => (
              <QueueRow
                key={inc.id}
                to={`/organizations/${inc.organization_id}`}
                title={inc.organizations?.name ?? 'Organization'}
                meta={inc.error_message || 'Site unreachable'}
                sub={formatNzDateTime(inc.opened_at)}
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
  failed,
  count,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  failed?: boolean;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card-brutal">
      <div className="border-b-3 border-ink-950 px-4 py-3 flex items-center justify-between gap-2">
        <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
          {icon} {title}
        </h3>
        <div className="flex items-center gap-3">
          {action}
          <span className="font-mono text-2xs text-ink-400">{failed && count === 0 ? '—' : count}</span>
        </div>
      </div>
      {count === 0 ? (
        <p className={`px-4 py-6 text-sm text-center ${failed ? 'text-accent' : 'text-ink-400'}`}>
          {failed ? 'Could not load this list.' : empty}
        </p>
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
