import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, RefreshCw, Send } from 'lucide-react';
import { SectionHeader, MetricCard } from '../../components/ui';
import { useNotifications } from '../../hooks/useNotifications';
import {
  NOTIFICATION_STATUS_LABELS,
  NOTIFICATION_TEMPLATE_LABELS,
  type NotificationEvent,
} from '../../types';

function StatusBadge({ status }: { status: NotificationEvent['status'] }) {
  const styles = {
    pending: 'border-amber-400 bg-amber-50 text-amber-800',
    sent: 'border-teal bg-teal-light text-teal',
    failed: 'border-accent bg-accent-light text-accent',
    skipped: 'border-ink-200 bg-ink-50 text-ink-500',
  };
  return (
    <span
      className={`font-mono text-2xs uppercase tracking-wider px-2 py-0.5 border ${styles[status]}`}
    >
      {NOTIFICATION_STATUS_LABELS[status]}
    </span>
  );
}

export default function EmailNotifications() {
  const { events, loading, error, summary, flushing, flushNow, requeue, apiConfigured, refetch } =
    useNotifications();
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const handleFlush = async () => {
    setActionMsg(null);
    const err = await flushNow();
    setActionMsg(err ?? 'Pending emails sent (or none in queue).');
  };

  const handleRequeue = async (id: string) => {
    setActionMsg(null);
    const err = await requeue(id);
    if (err) setActionMsg(err);
    else setActionMsg('Requeued — click Send pending to retry.');
  };

  return (
    <div className="max-w-6xl mx-auto">
      <Link
        to="/notifications"
        className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 dark:hover:text-foreground mb-6 min-h-[44px]"
      >
        <ArrowLeft size={14} aria-hidden /> Notifications
      </Link>

      <SectionHeader>Email notifications</SectionHeader>
      <p className="font-mono text-2xs text-ink-500 -mt-4 mb-6 max-w-2xl leading-relaxed">
        Outbound email queue: membership welcome, badge issued, and site-down alerts for paying members. Queued in the
        database; sent via Resend when the worker runs or when you click Send pending below. For inquiry and portal
        alerts, use{' '}
        <Link to="/notifications" className="underline font-semibold text-ink-800 dark:text-foreground">
          Notifications
        </Link>
        .
      </p>

      {error && (
        <p className="text-accent text-sm border-2 border-accent px-3 py-2 mb-4" role="alert">
          {error}
          {error.includes('notification_events') && (
            <span className="block font-mono text-2xs mt-1">Apply migration 018 on Supabase.</span>
          )}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <MetricCard label="Pending" value={summary.pending} />
        <MetricCard label="Sent (30d)" value={summary.sent} accent />
        <MetricCard label="Failed (30d)" value={summary.failed} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-6">
        <button
          type="button"
          onClick={handleFlush}
          disabled={flushing}
          className="btn-brutal-teal text-xs min-h-[44px] flex items-center justify-center gap-2 px-4"
        >
          <Send size={14} aria-hidden />
          {flushing ? 'Sending…' : 'Send pending now'}
        </button>
        <button
          type="button"
          onClick={() => refetch()}
          className="btn-brutal-outline text-xs min-h-[44px] flex items-center justify-center gap-2 px-4"
        >
          <RefreshCw size={14} aria-hidden /> Refresh
        </button>
      </div>

      {!apiConfigured && (
        <p className="text-xs text-ink-500 mb-4 border-2 border-ink-200 p-3 bg-ink-50 dark:bg-muted/30">
          Add <code className="font-mono">VITE_MONITOR_API_URL</code> and{' '}
          <code className="font-mono">VITE_MONITOR_API_KEY</code> to <code className="font-mono">.env.local</code> to
          send from CRM. Otherwise the Go worker sends pending mail when{' '}
          <code className="font-mono">RESEND_API_KEY</code> is set in <code className="font-mono">backend/.env</code>.
        </p>
      )}

      {actionMsg && (
        <p className="font-mono text-2xs text-teal mb-4" role="status">
          {actionMsg}
        </p>
      )}

      <div className="card-brutal overflow-hidden">
        <div className="border-b-3 border-ink-950 dark:border-border px-4 py-3 flex items-center gap-2">
          <Mail size={14} aria-hidden />
          <span className="font-mono text-xs uppercase tracking-wider font-semibold">Email queue</span>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-ink-400">Loading…</p>
        ) : events.length === 0 ? (
          <p className="p-6 text-sm text-ink-400">No queued emails yet.</p>
        ) : (
          <div className="divide-y divide-ink-100 max-h-[60vh] overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {NOTIFICATION_TEMPLATE_LABELS[e.template]}
                    </p>
                    <p className="font-mono text-2xs text-ink-500">
                      {e.organizations?.name ? (
                        <Link to={`/organizations/${e.organization_id}`} className="text-accent hover:underline">
                          {e.organizations.name}
                        </Link>
                      ) : (
                        '—'
                      )}{' '}
                      · {e.recipient_email}
                    </p>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
                <p className="font-mono text-2xs text-ink-400 truncate">{e.subject}</p>
                {e.status === 'failed' && e.error_message && (
                  <p className="text-2xs text-accent">{e.error_message}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 font-mono text-2xs text-ink-400">
                  <span>{new Date(e.created_at).toLocaleString()}</span>
                  {e.sent_at && <span>Sent {new Date(e.sent_at).toLocaleString()}</span>}
                  {e.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => handleRequeue(e.id)}
                      className="text-accent underline min-h-[36px]"
                    >
                      Requeue
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
