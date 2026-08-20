import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Mail,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { SectionHeader, MetricCard } from '../../components/ui';
import { NOTIFICATION_PAGE_SIZE, useNotifications } from '../../hooks/useNotifications';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  NOTIFICATION_STATUS_LABELS,
  notificationTemplateLabel,
  type NotificationEvent,
  type NotificationStatus,
  type NotificationTemplate,
} from '../../types';

type StatusFilter = 'all' | NotificationStatus;

function StatusBadge({ status }: { status: NotificationEvent['status'] }) {
  const styles: Record<NotificationEvent['status'], string> = {
    pending: 'border-amber-400 bg-amber-50 text-amber-900',
    sending: 'border-sky-300 bg-sky-50 text-sky-800',
    sent: 'border-gold bg-gold-light text-ink-950',
    failed: 'border-accent bg-accent-light text-accent',
    skipped: 'border-ink-200 bg-ink-50 text-ink-500',
    suppressed: 'border-ink-300 bg-ink-100 text-ink-600',
  };
  return (
    <span
      className={`shrink-0 font-mono text-2xs uppercase tracking-wider px-2 py-0.5 border-2 ${styles[status]}`}
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
  const pageFromUrl = Math.max(1, Number(searchParams.get('page')) || 1);
  const [filter, setFilter] = useState<StatusFilter>(initialFilter);
  const [page, setPage] = useState(pageFromUrl);
  const [search, setSearch] = useState('');
  const [templateFilter, setTemplateFilter] = useState<'all' | NotificationTemplate>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const {
    events,
    total,
    pageSize,
    loading,
    error,
    summary,
    flushing,
    flushNow,
    requeue,
    removeFromQueue,
    restoreToQueue,
    getSuppressionInfo,
    allowEmailAgain,
    apiConfigured,
    refetch,
  } = useNotifications({ page, status: filter });
  const confirm = useConfirm();
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionIsError, setActionIsError] = useState(false);
  const showAction = (msg: string | null, isError = false) => {
    setActionIsError(Boolean(msg) && isError);
    setActionMsg(msg);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const setFilterAndUrl = (next: StatusFilter) => {
    setFilter(next);
    setPage(1);
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'all') nextParams.delete('status');
    else nextParams.set('status', next);
    nextParams.delete('page');
    setSearchParams(nextParams, { replace: true });
  };

  const setPageAndUrl = (next: number) => {
    setPage(next);
    const nextParams = new URLSearchParams(searchParams);
    if (next <= 1) nextParams.delete('page');
    else nextParams.set('page', String(next));
    setSearchParams(nextParams, { replace: true });
  };

  const templatesInQueue = useMemo(() => {
    const seen = new Set<NotificationTemplate>();
    for (const e of events) seen.add(e.template);
    return [...seen].sort((a, b) =>
      notificationTemplateLabel(a).localeCompare(notificationTemplateLabel(b)),
    );
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (templateFilter !== 'all' && e.template !== templateFilter) return false;
      if (!q) return true;
      const name = e.organizations?.name ?? '';
      const label = notificationTemplateLabel(e.template);
      return (
        name.toLowerCase().includes(q) ||
        e.recipient_email.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        label.toLowerCase().includes(q)
      );
    });
  }, [events, search, templateFilter]);

  const copyEmail = async (id: string, email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      showAction('Could not copy email.', true);
    }
  };

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

  const emptyMessage = (() => {
    if (search.trim() || templateFilter !== 'all') {
      return 'No emails match this search on this page.';
    }
    if (filter === 'all') return total === 0 ? 'No queued emails yet.' : 'No emails on this page.';
    if (filter === 'failed') return 'No failed sends on this page.';
    if (filter === 'suppressed') return 'No unsubscribed emails on this page.';
    if (filter === 'skipped') return 'No cancelled emails on this page.';
    return `No ${NOTIFICATION_STATUS_LABELS[filter].toLowerCase()} emails on this page.`;
  })();

  return (
    <div className="max-w-6xl mx-auto w-full min-w-0">
      <Link
        to="/notifications"
        className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 dark:hover:text-foreground mb-6 min-h-[44px]"
      >
        <ArrowLeft size={14} aria-hidden /> Notifications
      </Link>

      <SectionHeader
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleFlush()}
              disabled={flushing}
              className="btn-brutal-teal text-sm min-h-[44px] inline-flex items-center justify-center gap-2 px-4"
            >
              <Send size={14} aria-hidden />
              {flushing ? 'Sending…' : 'Send pending now'}
            </button>
            <button
              type="button"
              onClick={() => void refetch()}
              className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center justify-center gap-2 px-4"
            >
              <RefreshCw size={14} aria-hidden /> Refresh
            </button>
          </div>
        }
      >
        Email queue
      </SectionHeader>
      <p className="font-mono text-2xs text-ink-500 -mt-4 mb-6 max-w-2xl leading-relaxed">
        Outbound mail for outreach, membership welcome, badges, and site-down alerts. Queued here, then sent via
        Resend when you click Send pending or when the worker runs.{' '}
        <strong className="text-ink-800 dark:text-foreground">Failed</strong> is a send error, not an inbox bounce.{' '}
        <strong className="text-ink-800 dark:text-foreground">Cancelled</strong> was removed by staff.{' '}
        <strong className="text-ink-800 dark:text-foreground">Unsubscribed</strong> opted out. In-app alerts live on{' '}
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <button type="button" onClick={() => setFilterAndUrl('pending')} className="h-full min-h-[44px] text-left">
          <MetricCard compact label="Pending" value={summary.pending ?? 0} sub="In queue" />
        </button>
        <button type="button" onClick={() => setFilterAndUrl('sent')} className="h-full min-h-[44px] text-left">
          <MetricCard compact label="Sent" value={summary.sent ?? 0} sub="Last 30 days" accent />
        </button>
        <button type="button" onClick={() => setFilterAndUrl('failed')} className="h-full min-h-[44px] text-left">
          <MetricCard compact label="Failed" value={summary.failed ?? 0} sub="Last 30 days" />
        </button>
        <button type="button" onClick={() => setFilterAndUrl('skipped')} className="h-full min-h-[44px] text-left">
          <MetricCard compact label="Cancelled" value={summary.skipped ?? 0} sub="Last 30 days" />
        </button>
        <button type="button" onClick={() => setFilterAndUrl('suppressed')} className="h-full min-h-[44px] text-left">
          <MetricCard compact label="Unsubscribed" value={summary.suppressed ?? 0} sub="Last 30 days" />
        </button>
      </div>

      {filter === 'suppressed' && (
        <p className="mb-4 text-sm text-ink-600 dark:text-muted-foreground">
          Each row shows why sending was blocked. When a recipient asks to hear from you again, click{' '}
          <strong className="text-ink-800 dark:text-foreground">Allow email again</strong> on their row,
          then queue new outreach from the CRM — or use{' '}
          <strong className="text-ink-800 dark:text-foreground">Allow and requeue</strong> to retry that specific
          email.
        </p>
      )}

      {filter === 'skipped' && (summary.skipped ?? 0) > 0 && (
        <p className="mb-4 text-sm text-ink-600 dark:text-muted-foreground">
          These were removed from the queue and will not send until you click{' '}
          <strong className="text-ink-800 dark:text-foreground">Restore to queue</strong> on each row.
        </p>
      )}

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

      <div className="card-brutal overflow-hidden flex flex-col max-h-[min(78vh,860px)]">
        <div className="border-b-2 border-gold bg-ink-950 px-4 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex min-w-0 items-center gap-2">
            <Mail size={14} className="text-gold shrink-0" aria-hidden />
            <span className="font-mono text-xs uppercase tracking-wider font-semibold text-white">
              Queue
            </span>
            <span className="font-mono text-2xs uppercase bg-gold text-ink-950 px-2 py-0.5 font-semibold">
              {total.toLocaleString()}
              {filter !== 'all' ? ` · ${NOTIFICATION_STATUS_LABELS[filter]}` : ''}
              {` · ${NOTIFICATION_PAGE_SIZE}/page`}
            </span>
          </div>
        </div>

        <div className="shrink-0 border-b border-ink-200 bg-white px-4 py-3 space-y-3 dark:border-border dark:bg-card">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search org, email, or subject…"
              className="input-brutal w-full pl-9 min-h-[40px] text-sm"
              aria-label="Search email queue"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter email queue">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={filter === opt.id}
                onClick={() => setFilterAndUrl(opt.id)}
                className={`font-mono text-2xs uppercase tracking-wider px-3 py-1.5 min-h-[36px] border-2 ${
                  filter === opt.id
                    ? 'border-ink-950 bg-ink-950 text-white'
                    : 'border-ink-200 text-ink-600 hover:border-gold hover:bg-gold-light'
                }`}
              >
                {opt.label}
                {opt.id === 'pending' && (summary.pending ?? 0) > 0 ? ` (${summary.pending})` : ''}
                {opt.id === 'failed' && (summary.failed ?? 0) > 0 ? ` (${summary.failed})` : ''}
                {opt.id === 'skipped' && (summary.skipped ?? 0) > 0 ? ` (${summary.skipped})` : ''}
                {opt.id === 'suppressed' && (summary.suppressed ?? 0) > 0 ? ` (${summary.suppressed})` : ''}
              </button>
            ))}
            {templatesInQueue.length > 1 && (
              <label className="ml-auto flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-2xs uppercase tracking-wider text-ink-400">Type</span>
                <select
                  value={templateFilter}
                  onChange={(e) =>
                    setTemplateFilter(e.target.value === 'all' ? 'all' : (e.target.value as NotificationTemplate))
                  }
                  className="input-brutal min-h-[36px] py-1 text-2xs font-mono"
                  aria-label="Filter by email type"
                >
                  <option value="all">All types</option>
                  {templatesInQueue.map((t) => (
                    <option key={t} value={t}>
                      {notificationTemplateLabel(t)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-ink-400">Loading…</p>
        ) : filteredEvents.length === 0 ? (
          <p className="p-6 text-sm text-ink-400">{emptyMessage}</p>
        ) : (
          <div className="divide-y divide-ink-100 overflow-y-auto min-h-0 flex-1">
            {filteredEvents.map((e) => (
              <div
                key={e.id}
                className={`p-4 space-y-2 ${
                  e.status === 'failed'
                    ? 'bg-accent-light/20 dark:bg-accent/5'
                    : e.status === 'suppressed'
                      ? 'bg-ink-100/50 dark:bg-muted/20'
                      : 'hover:bg-gold-light/30'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {notificationTemplateLabel(e.template)}
                    </p>
                    <p className="font-mono text-2xs text-ink-500 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      {e.organizations?.name ? (
                        <Link to={`/organizations/${e.organization_id}`} className="text-accent hover:underline">
                          {e.organizations.name}
                        </Link>
                      ) : (
                        <span>—</span>
                      )}
                      <span aria-hidden>·</span>
                      <span className="truncate">{e.recipient_email}</span>
                      <button
                        type="button"
                        onClick={() => void copyEmail(e.id, e.recipient_email)}
                        className="inline-flex size-7 items-center justify-center text-ink-400 hover:text-ink-950"
                        aria-label={`Copy ${e.recipient_email}`}
                      >
                        {copiedId === e.id ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
                      </button>
                    </p>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
                <p className="font-mono text-2xs text-ink-400 truncate">{e.subject}</p>
                {(e.status === 'failed' || e.status === 'skipped' || e.status === 'suppressed') &&
                  e.error_message && (
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
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-gold/50 bg-gold-light/40 px-2 font-semibold text-ink-950 hover:bg-gold-light"
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
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-gold/50 bg-gold-light/40 px-2 font-semibold text-ink-950 hover:bg-gold-light"
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
                      onClick={() => void handleRequeue(e.id)}
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

      {total > 0 && (
        <div className="flex items-center justify-between gap-3 mt-4">
          <p className="font-mono text-2xs text-ink-500">
            {((page - 1) * pageSize + 1).toLocaleString()}–
            {Math.min(page * pageSize, total).toLocaleString()} of {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPageAndUrl(page - 1)}
              className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center gap-1 disabled:opacity-40"
            >
              <ChevronLeft size={15} /> Prev
            </button>
            <span className="font-mono text-2xs text-ink-500">
              Page {page} / {totalPages.toLocaleString()}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPageAndUrl(page + 1)}
              className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center gap-1 disabled:opacity-40"
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
