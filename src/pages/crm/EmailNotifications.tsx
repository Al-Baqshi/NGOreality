import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Ban, Mail, RefreshCw, RotateCcw, Send, Trash2, UserCheck } from 'lucide-react';
import { SectionHeader, MetricCard } from '../../components/ui';
import { useNotifications } from '../../hooks/useNotifications';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  NOTIFICATION_STATUS_LABELS,
  NOTIFICATION_TEMPLATE_LABELS,
  type NotificationEvent,
  type NotificationStatus,
} from '../../types';

type StatusFilter = 'all' | NotificationStatus;

function StatusBadge({ status }: { status: NotificationEvent['status'] }) {
  const styles: Record<NotificationEvent['status'], string> = {
    pending: 'border-amber-400 bg-amber-50 text-amber-800',
    sending: 'border-sky-300 bg-sky-50 text-sky-800',
    sent: 'border-teal bg-teal-light text-teal',
    failed: 'border-accent bg-accent-light text-accent',
    skipped: 'border-ink-200 bg-ink-50 text-ink-500',
    suppressed: 'border-ink-300 bg-ink-100 text-ink-600',
  };
  return (
    <span
      className={`font-mono text-2xs uppercase tracking-wider px-2 py-0.5 border ${styles[status]}`}
    >
      {NOTIFICATION_STATUS_LABELS[status]}
    </span>
  );
}

const FILTER_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'failed', label: 'Failed to send' },
  { id: 'sent', label: 'Sent' },
  { id: 'skipped', label: 'Cancelled' },
  { id: 'suppressed', label: 'Unsubscribed' },
];

export default function EmailNotifications() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const initialFilter: StatusFilter =
    statusParam === 'pending' ||
    statusParam === 'sent' ||
    statusParam === 'failed' ||
    statusParam === 'skipped' ||
    statusParam === 'suppressed' ||
    statusParam === 'sending'
      ? statusParam
      : 'all';
  const [filter, setFilter] = useState<StatusFilter>(initialFilter);

  const { events, loading, error, summary, flushing, flushNow, requeue, removeFromQueue, restoreToQueue, getSuppressionInfo, allowEmailAgain, apiConfigured, refetch } =
    useNotifications();
  const confirm = useConfirm();
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionIsError, setActionIsError] = useState(false);
  const showAction = (msg: string | null, isError = false) => {
    setActionIsError(Boolean(msg) && isError);
    setActionMsg(msg);
  };

  const setFilterAndUrl = (next: StatusFilter) => {
    setFilter(next);
    if (next === 'all') searchParams.delete('status');
    else searchParams.set('status', next);
    setSearchParams(searchParams, { replace: true });
  };

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.status === filter);
  }, [events, filter]);

  const handleFlush = async () => {
    const pendingCount = summary.pending ?? 0;
    const ok = await confirm({
      title: 'Send pending emails?',
      description: `Deliver ${pendingCount.toLocaleString()} pending email${pendingCount === 1 ? '' : 's'} in the queue now?`,
      confirmLabel: 'Send now',
    });
    if (!ok) return;
    showAction(null);
    const err = await flushNow();
    showAction(err ?? 'Pending emails sent (or none in queue).', Boolean(err));
  };

  const handleRequeue = async (id: string) => {
    showAction(null);
    const err = await requeue(id);
    showAction(err ?? 'Requeued — click Send pending to retry.', Boolean(err));
  };

  const handleRemoveFromQueue = async (id: string, subject: string) => {
    const ok = await confirm({
      title: 'Remove from queue?',
      description: `Cancel this pending send? The email will not be delivered.\n\n"${subject}"`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    showAction(null);
    const err = await removeFromQueue(id);
    showAction(err ?? 'Removed from queue — marked as cancelled.', Boolean(err));
  };

  const handleRestoreToQueue = async (id: string, subject: string) => {
    const ok = await confirm({
      title: 'Restore to queue?',
      description: `Put this email back in the pending queue?\n\n"${subject}"`,
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    showAction(null);
    const err = await restoreToQueue(id);
    showAction(err ?? 'Restored to pending queue.', Boolean(err));
  };

  const handleAllowEmailAgain = async (email: string, subject: string, eventId: string) => {
    const info = await getSuppressionInfo(email);
    const reason = info?.reason ?? 'unknown';
    const isRisky = reason === 'bounce' || reason === 'complaint';
    const reasonLine =
      reason === 'unsubscribe'
        ? 'They previously unsubscribed via the email link.'
        : reason === 'bounce'
          ? 'This address bounced — re-enabling may hurt deliverability.'
          : reason === 'complaint'
            ? 'This address filed a spam complaint — re-enabling is risky.'
            : reason === 'manual'
              ? 'This address was blocked manually.'
              : info
                ? 'This address is on the suppression list.'
                : 'This address is not currently on the suppression list — this queued send is still marked unsubscribed.';

    const ok = await confirm({
      title: 'Allow email again?',
      description: `${reasonLine}\n\nRemove ${email} from the suppression list? They can receive outreach again. This blocked send will not auto-resend — queue a new email from Outreach, or requeue below after allowing.\n\n"${subject}"`,
      confirmLabel: 'Allow email again',
      variant: isRisky ? 'danger' : 'default',
    });
    if (!ok) return;
    showAction(null);
    const err = await allowEmailAgain(email, eventId, false);
    showAction(err ?? `${email} can receive email again — this send was not requeued.`, Boolean(err));
  };

  const handleAllowAndRequeue = async (email: string, subject: string, eventId: string) => {
    const info = await getSuppressionInfo(email);
    const reason = info?.reason ?? 'unknown';
    const isRisky = reason === 'bounce' || reason === 'complaint';

    const ok = await confirm({
      title: 'Allow and requeue?',
      description: `Remove ${email} from the suppression list and put this email back in the pending queue?\n\n"${subject}"`,
      confirmLabel: 'Allow and requeue',
      variant: isRisky ? 'danger' : 'default',
    });
    if (!ok) return;
    showAction(null);
    const err = await allowEmailAgain(email, eventId, true);
    showAction(err ?? 'Address allowed and email requeued — click Send pending when ready.', Boolean(err));
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
        Outbound email queue: outreach campaigns, membership welcome, badge issued, and site-down alerts. Queued in the
        database; sent via Resend when the worker runs or when you click Send pending below.{' '}
        <strong className="text-ink-800 dark:text-foreground">Failed</strong> means Resend or the worker rejected the
        send — not inbox bounce. For inquiry and portal alerts, use{' '}
        <Link to="/notifications" className="underline font-semibold text-ink-800 dark:text-foreground">
          Notifications
        </Link>
        .{' '}
        <strong className="text-ink-800 dark:text-foreground">Cancelled</strong> means staff removed a pending send;{' '}
        <strong className="text-ink-800 dark:text-foreground">Unsubscribed</strong> means the recipient opted out and mail
        will not be sent to that address. Use the status filters below the summary cards — click{' '}
        <strong className="text-ink-800 dark:text-foreground">Unsubscribed</strong> or{' '}
        <strong className="text-ink-800 dark:text-foreground">Cancelled</strong> — to see reasons on each row.
      </p>

      {error && (
        <p className="text-accent text-sm border-2 border-accent px-3 py-2 mb-4" role="alert">
          {error}
          {error.includes('notification_events') && (
            <span className="block font-mono text-2xs mt-1">Apply migration 018 on Supabase.</span>
          )}
        </p>
      )}

      {(summary.skipped ?? 0) > 0 && filter !== 'skipped' && (
        <div
          className="mb-4 flex flex-wrap items-start gap-2 border-2 border-ink-200 bg-ink-50/80 px-3 py-2 dark:border-border dark:bg-muted/30"
          role="status"
        >
          <RotateCcw size={16} className="text-ink-500 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm text-ink-800 dark:text-foreground flex-1 min-w-0">
            <strong>{summary.skipped}</strong> cancelled email{summary.skipped === 1 ? '' : 's'} can be restored to
            the pending queue.
          </p>
          <button
            type="button"
            onClick={() => setFilterAndUrl('skipped')}
            className="btn-brutal-outline text-2xs min-h-[36px] px-3 shrink-0"
          >
            View cancelled
          </button>
        </div>
      )}

      {(summary.suppressed ?? 0) > 0 && filter !== 'suppressed' && (
        <div
          className="mb-4 flex flex-wrap items-start gap-2 border-2 border-ink-300 bg-ink-100/60 px-3 py-2 dark:border-border dark:bg-muted/30"
          role="status"
        >
          <Ban size={16} className="text-ink-600 shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm text-ink-800 dark:text-foreground flex-1 min-w-0">
            <strong>{summary.suppressed}</strong> address{summary.suppressed === 1 ? '' : 'es'} unsubscribed or
            suppressed — open the list to read why each one was blocked.
          </p>
          <button
            type="button"
            onClick={() => setFilterAndUrl('suppressed')}
            className="btn-brutal-outline text-2xs min-h-[36px] px-3 shrink-0"
          >
            View unsubscribed
          </button>
        </div>
      )}

      {summary.failed > 0 && (
        <div
          className="mb-4 border-2 border-accent bg-accent-light/40 dark:bg-accent/10 px-3 py-2 flex flex-wrap items-start gap-2"
          role="status"
        >
          <AlertTriangle size={16} className="text-accent shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm text-ink-800 dark:text-foreground flex-1 min-w-0">
            <strong>{summary.failed}</strong> email{summary.failed === 1 ? '' : 's'} failed to send in the last 30
            days. Open each row for the error, fix the issue, then <strong>Requeue</strong> and send again.
          </p>
          <button
            type="button"
            onClick={() => setFilterAndUrl('failed')}
            className="btn-brutal-accent text-2xs min-h-[36px] px-3 shrink-0"
          >
            Show failed only
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <button type="button" onClick={() => setFilterAndUrl('pending')} className="text-left min-h-[44px]">
          <MetricCard label="Pending" value={summary.pending ?? 0} />
        </button>
        <button type="button" onClick={() => setFilterAndUrl('sent')} className="text-left min-h-[44px]">
          <MetricCard label="Sent (30d)" value={summary.sent ?? 0} accent />
        </button>
        <button type="button" onClick={() => setFilterAndUrl('failed')} className="text-left min-h-[44px]">
          <MetricCard label="Failed (30d)" value={summary.failed ?? 0} />
        </button>
        <button type="button" onClick={() => setFilterAndUrl('skipped')} className="text-left min-h-[44px]">
          <MetricCard label="Cancelled (30d)" value={summary.skipped ?? 0} />
        </button>
        <button type="button" onClick={() => setFilterAndUrl('suppressed')} className="text-left min-h-[44px]">
          <MetricCard label="Unsubscribed (30d)" value={summary.suppressed ?? 0} />
        </button>
      </div>

      {filter === 'suppressed' && (
        <p className="mb-4 text-sm text-ink-600 dark:text-muted-foreground">
          Each row shows why sending was blocked. When a recipient asks to hear from you again, click{' '}
          <strong className="text-ink-800 dark:text-foreground">Allow email again</strong> on their row,
          then queue new outreach from the CRM — or use <strong className="text-ink-800 dark:text-foreground">Allow and requeue</strong>{' '}
          to retry that specific email.
        </p>
      )}

      {filter === 'skipped' && (summary.skipped ?? 0) > 0 && (
        <p className="mb-4 text-sm text-ink-600 dark:text-muted-foreground">
          These were removed from the queue and will not send until you click{' '}
          <strong className="text-ink-800 dark:text-foreground">Restore to queue</strong> on each row.
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Filter email queue">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={filter === opt.id}
            onClick={() => setFilterAndUrl(opt.id)}
            className={`font-mono text-2xs uppercase tracking-wider px-3 py-2 min-h-[44px] border-2 ${
              filter === opt.id
                ? 'border-ink-950 bg-ink-950 text-white dark:border-foreground dark:bg-foreground dark:text-background'
                : 'border-ink-200 hover:border-ink-400'
            }`}
          >
            {opt.label}
            {opt.id === 'pending' && (summary.pending ?? 0) > 0 ? ` (${summary.pending})` : ''}
            {opt.id === 'failed' && (summary.failed ?? 0) > 0 ? ` (${summary.failed})` : ''}
            {opt.id === 'skipped' && (summary.skipped ?? 0) > 0 ? ` (${summary.skipped})` : ''}
            {opt.id === 'suppressed' && (summary.suppressed ?? 0) > 0 ? ` (${summary.suppressed})` : ''}
          </button>
        ))}
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
        <p
          className={`font-mono text-2xs mb-4 ${actionIsError ? 'text-accent' : 'text-teal'}`}
          role="status"
        >
          {actionMsg}
        </p>
      )}

      <div className="card-brutal overflow-hidden">
        <div className="border-b-3 border-ink-950 dark:border-border px-4 py-3 flex flex-wrap items-center gap-2">
          <Mail size={14} aria-hidden />
          <span className="font-mono text-xs uppercase tracking-wider font-semibold">Email queue</span>
          {filter !== 'all' && (
            <span className="font-mono text-2xs text-ink-500">
              · {NOTIFICATION_STATUS_LABELS[filter]} ({filteredEvents.length})
            </span>
          )}
        </div>
        {loading ? (
          <p className="p-6 text-sm text-ink-400">Loading…</p>
        ) : filteredEvents.length === 0 ? (
          <p className="p-6 text-sm text-ink-400">
            {filter === 'failed'
              ? 'No failed sends in the latest queue rows — good. Failed items from the last 30 days may still appear in the count above after you send more mail.'
              : filter === 'suppressed'
                ? 'No unsubscribed or suppressed emails in the last 30 days.'
                : filter === 'skipped'
                  ? 'No cancelled emails in the last 30 days.'
                  : filter === 'all'
                    ? 'No queued emails yet.'
                    : `No ${NOTIFICATION_STATUS_LABELS[filter].toLowerCase()} emails in the latest queue rows.`}
          </p>
        ) : (
          <div className="divide-y divide-ink-100 max-h-[60vh] overflow-y-auto">
            {filteredEvents.map((e) => (
              <div
                key={e.id}
                className={`p-4 space-y-2 ${
                  e.status === 'failed'
                    ? 'bg-accent-light/20 dark:bg-accent/5'
                    : e.status === 'suppressed'
                      ? 'bg-ink-100/50 dark:bg-muted/20'
                      : ''
                }`}
              >
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
                {(e.status === 'failed' || e.status === 'skipped' || e.status === 'suppressed') && e.error_message && (
                  <p
                    className={`text-xs font-mono leading-snug break-words ${
                      e.status === 'failed' ? 'text-accent' : 'text-ink-600 dark:text-muted-foreground'
                    }`}
                  >
                    {e.error_message}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 font-mono text-2xs text-ink-400">
                  <span>{new Date(e.created_at).toLocaleString()}</span>
                  {e.sent_at && <span>Sent {new Date(e.sent_at).toLocaleString()}</span>}
                  {e.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveFromQueue(e.id, e.subject)}
                      className="inline-flex min-h-[36px] items-center gap-1 text-accent underline hover:no-underline"
                    >
                      <Trash2 size={12} aria-hidden />
                      Remove from queue
                    </button>
                  )}
                  {e.status === 'skipped' && (
                    <button
                      type="button"
                      onClick={() => void handleRestoreToQueue(e.id, e.subject)}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-teal/40 bg-teal/5 px-2 text-teal font-semibold hover:bg-teal/10"
                    >
                      <RotateCcw size={12} aria-hidden />
                      Restore to queue
                    </button>
                  )}
                  {e.status === 'suppressed' && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleAllowEmailAgain(e.recipient_email, e.subject, e.id)}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-teal/40 bg-teal/5 px-2 text-teal font-semibold hover:bg-teal/10"
                      >
                        <UserCheck size={12} aria-hidden />
                        Allow email again
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAllowAndRequeue(e.recipient_email, e.subject, e.id)}
                        className="inline-flex min-h-[36px] items-center gap-1 text-accent underline hover:no-underline"
                      >
                        Allow and requeue
                      </button>
                    </>
                  )}
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
