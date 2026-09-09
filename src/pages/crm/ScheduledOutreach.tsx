import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import { MetricCard, QueryError } from '../../components/ui';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  cancelHeldOutreachEmails,
  enqueueOutreachEmailsByFilter,
  fetchHeldOutreachSummary,
  releaseHeldOutreachEmails,
  useOutreachSegmentCounts,
  type HeldOutreachSummary,
  type OutreachFilters,
  type OutreachSegment,
} from '../../hooks/useOutreachWorklist';
import { captureError } from '../../lib/errorReporting';
import { draftOutreachEmailForOrg } from '../../lib/crmOutreach';
import { supabase } from '../../lib/supabase';
import {
  NOTIFICATION_TEMPLATE_LABELS,
  OUTREACH_EMAIL_TEMPLATES,
  OUTREACH_STATUS_LABELS,
  OUTREACH_KANBAN_STATUSES,
  type NotificationEvent,
  type OutreachEmailTemplate,
  type OutreachStatus,
} from '../../types';

const DEFAULT_DAILY_CAP = 100;
const HELD_PAGE_SIZE = 50;

const SEGMENTS: { key: OutreachSegment; label: string }[] = [
  { key: 'all', label: 'All leads' },
  { key: 'site_down', label: 'Site down' },
  { key: 'no_website', label: 'No website' },
  { key: 'site_ok', label: 'Site healthy' },
  { key: 'url_invalid', label: 'Broken URL' },
  { key: 'never_checked', label: 'Never checked' },
];

type HeldRow = NotificationEvent & { organizations?: { name: string } | null };

export default function ScheduledOutreach() {
  const confirm = useConfirm();
  const [dailyCap, setDailyCap] = useState(DEFAULT_DAILY_CAP);
  const [segment, setSegment] = useState<OutreachSegment>('no_website');
  const [outreach, setOutreach] = useState<OutreachStatus | ''>('not_contacted');
  const [template, setTemplate] = useState<OutreachEmailTemplate>('outreach_cold_invite');
  const [stageCount, setStageCount] = useState(DEFAULT_DAILY_CAP);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [summary, setSummary] = useState<HeldOutreachSummary | null>(null);
  const [held, setHeld] = useState<HeldRow[]>([]);
  const [heldTotal, setHeldTotal] = useState(0);
  const [heldPage, setHeldPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { counts } = useOutreachSegmentCounts(refreshKey);

  const filters: OutreachFilters = useMemo(
    () => ({ segment, outreach, q: '' }),
    [segment, outreach],
  );

  const remainingToday = Math.max(0, dailyCap - (summary?.staged_today ?? 0));
  const effectiveStageMax = Math.min(stageCount, remainingToday, dailyCap);

  useEffect(() => {
    const draft = draftOutreachEmailForOrg(template, '{name}');
    setSubject(draft.subject);
    setBody(draft.body);
  }, [template]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, list] = await Promise.all([
        fetchHeldOutreachSummary(),
        (async () => {
          const from = (heldPage - 1) * HELD_PAGE_SIZE;
          const to = from + HELD_PAGE_SIZE - 1;
          return supabase
            .from('notification_events')
            .select('*, organizations(name)', { count: 'exact' })
            .eq('status', 'held')
            .like('template', 'outreach%')
            .order('created_at', { ascending: true })
            .range(from, to);
        })(),
      ]);
      setSummary(sum);
      if (list.error) throw list.error;
      setHeld((list.data ?? []) as HeldRow[]);
      setHeldTotal(list.count ?? 0);
    } catch (e) {
      setError(captureError(e, { where: 'ScheduledOutreach.load' }));
    } finally {
      setLoading(false);
    }
  }, [heldPage]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const heldPages = Math.max(1, Math.ceil(heldTotal / HELD_PAGE_SIZE));
  const pageAllSelected = held.length > 0 && held.every((r) => selectedIds.has(r.id));

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    if (pageAllSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        held.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        held.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }

  async function handleStage() {
    if (effectiveStageMax < 1) {
      setNotice('Daily cap reached — raise the cap or wait until tomorrow (NZ time).');
      return;
    }
    const ok = await confirm({
      title: 'Stage held emails?',
      description:
        `Prepare up to ${effectiveStageMax.toLocaleString()} ${NOTIFICATION_TEMPLATE_LABELS[template]} ` +
        `emails for the “${SEGMENTS.find((s) => s.key === segment)?.label ?? segment}” segment` +
        (outreach ? ` · ${OUTREACH_STATUS_LABELS[outreach]}` : '') +
        `.\n\nThey will NOT send until you approve below. Cron ignores held mail.`,
      confirmLabel: 'Stage for approval',
    });
    if (!ok) return;

    setBusy(true);
    setNotice(null);
    try {
      const result = await enqueueOutreachEmailsByFilter(filters, template, [], {
        subject,
        body,
        max: effectiveStageMax,
        held: true,
      });
      setNotice(
        `Held ${result.queued.toLocaleString()} · skipped no email ${result.skipped_no_email.toLocaleString()} · ` +
          `suppressed ${result.skipped_suppressed.toLocaleString()} · deduped ${result.skipped_dedupe.toLocaleString()}` +
          (result.capped ? ` · capped at ${result.cap.toLocaleString()}` : ''),
      );
      setSelectedIds(new Set());
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setNotice(captureError(e, { where: 'ScheduledOutreach.stage' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleRelease(ids?: string[]) {
    const count = ids?.length ?? Math.min(dailyCap, summary?.held ?? 0);
    if (!count) return;
    const ok = await confirm({
      title: 'Approve and release?',
      description:
        `Release ${ids?.length ? ids.length.toLocaleString() : `up to ${count.toLocaleString()}`} held email(s) to pending?\n\n` +
        `After release, cron (~2 min) or Email queue “Send pending now” will deliver them.`,
      confirmLabel: 'Approve send',
    });
    if (!ok) return;

    setBusy(true);
    setNotice(null);
    try {
      const result = await releaseHeldOutreachEmails({
        limit: ids?.length ?? dailyCap,
        ids,
      });
      setNotice(
        `Released ${result.released.toLocaleString()} — open Email queue to watch delivery or send pending now.`,
      );
      setSelectedIds(new Set());
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setNotice(captureError(e, { where: 'ScheduledOutreach.release' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(ids?: string[]) {
    const count = ids?.length ?? summary?.held ?? 0;
    if (!count) return;
    const ok = await confirm({
      title: 'Cancel held emails?',
      description: ids?.length
        ? `Cancel ${ids.length.toLocaleString()} selected held email(s)? They will not send.`
        : `Cancel all ${count.toLocaleString()} held email(s)? They will not send.`,
      confirmLabel: 'Cancel held',
    });
    if (!ok) return;

    setBusy(true);
    setNotice(null);
    try {
      const result = await cancelHeldOutreachEmails({
        ids,
        limit: ids?.length ?? 25000,
      });
      setNotice(`Cancelled ${result.cancelled.toLocaleString()} held email(s).`);
      setSelectedIds(new Set());
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setNotice(captureError(e, { where: 'ScheduledOutreach.cancel' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Scheduled outreach</h1>
          <p className="text-sm text-ink-600 dark:text-muted-foreground mt-1 max-w-2xl">
            Stage a daily batch (e.g. 100) with the same outreach email. Held mail does not send until you approve.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/outreach" className="btn-brutal-outline text-sm inline-flex items-center gap-2 min-h-[44px]">
            Outreach worklist
          </Link>
          <Link
            to="/email-notifications?status=held"
            className="btn-brutal-outline text-sm inline-flex items-center gap-2 min-h-[44px]"
          >
            <Mail size={16} /> Email queue
          </Link>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="btn-brutal-outline text-sm inline-flex items-center gap-2 min-h-[44px]"
            disabled={loading || busy}
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {error && <QueryError message={error} />}
      {notice && (
        <p className="mb-4 font-mono text-2xs text-teal" role="status">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard compact label="Held" value={summary ? summary.held : '—'} sub="Awaiting your approval" />
        <MetricCard
          compact
          label="Staged today"
          value={summary ? summary.staged_today : '—'}
          sub={`of ${dailyCap}/day cap (NZ)`}
        />
        <MetricCard
          compact
          label="Remaining today"
          value={summary ? remainingToday : '—'}
          sub="Can still stage"
          accent
        />
        <MetricCard
          compact
          label="Released today"
          value={summary ? summary.released_today : '—'}
          sub="Approved for send"
        />
      </div>

      <section className="card-brutal p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarClock size={18} className="text-ink-500" aria-hidden />
          <h2 className="font-display text-lg text-ink-950 dark:text-foreground">1. Stage a daily batch</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Daily cap</span>
            <input
              type="number"
              min={1}
              max={25000}
              value={dailyCap}
              onChange={(e) => setDailyCap(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm dark:bg-background dark:border-border"
            />
          </label>
          <label className="block text-sm">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Stage this run</span>
            <input
              type="number"
              min={1}
              max={dailyCap}
              value={stageCount}
              onChange={(e) => setStageCount(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm dark:bg-background dark:border-border"
            />
          </label>
          <label className="block text-sm">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Segment</span>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value as OutreachSegment)}
              className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm dark:bg-background dark:border-border"
            >
              {SEGMENTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                  {counts ? ` (${(counts[s.key] ?? 0).toLocaleString()})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Outreach stage</span>
            <select
              value={outreach}
              onChange={(e) => setOutreach(e.target.value as OutreachStatus | '')}
              className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm dark:bg-background dark:border-border"
            >
              <option value="">Any stage</option>
              {OUTREACH_KANBAN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {OUTREACH_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm max-w-md">
          <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Email template</span>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value as OutreachEmailTemplate)}
            className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm dark:bg-background dark:border-border"
          >
            {OUTREACH_EMAIL_TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {NOTIFICATION_TEMPLATE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm dark:bg-background dark:border-border"
          />
        </label>
        <label className="block text-sm">
          <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">
            Body <span className="normal-case tracking-normal text-ink-400">({'{name}'} personalised)</span>
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm font-mono dark:bg-background dark:border-border"
          />
        </label>

        <button
          type="button"
          disabled={busy || effectiveStageMax < 1}
          onClick={() => void handleStage()}
          className="btn-brutal-teal text-sm inline-flex items-center gap-2 min-h-[44px] px-4"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
          Stage {effectiveStageMax.toLocaleString()} held email{effectiveStageMax === 1 ? '' : 's'}
        </button>
      </section>

      <section className="card-brutal overflow-hidden">
        <div className="border-b-2 border-gold bg-ink-950 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-2xs uppercase tracking-wider text-gold">
            2. Approve held · {heldTotal.toLocaleString()} waiting
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || selectedIds.size === 0}
              onClick={() => void handleRelease(Array.from(selectedIds))}
              className="btn-brutal-teal text-2xs min-h-[36px] px-3 inline-flex items-center gap-1"
            >
              <CheckCircle2 size={14} /> Approve selected ({selectedIds.size})
            </button>
            <button
              type="button"
              disabled={busy || !summary?.held}
              onClick={() => void handleRelease()}
              className="btn-brutal-outline text-2xs min-h-[36px] px-3 inline-flex items-center gap-1 !border-gold !text-gold hover:!bg-gold/10"
            >
              <Send size={14} /> Approve next {Math.min(dailyCap, summary?.held ?? 0).toLocaleString()}
            </button>
            <button
              type="button"
              disabled={busy || (!selectedIds.size && !summary?.held)}
              onClick={() => void handleCancel(selectedIds.size ? Array.from(selectedIds) : undefined)}
              className="btn-brutal-outline text-2xs min-h-[36px] px-3 inline-flex items-center gap-1 text-accent"
            >
              <Trash2 size={14} /> Cancel {selectedIds.size ? 'selected' : 'all held'}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="p-6 font-mono text-2xs text-ink-400 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading held queue…
          </p>
        ) : held.length === 0 ? (
          <p className="p-6 text-sm text-ink-500">No held emails. Stage a batch above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-ink-100 text-left font-mono text-2xs uppercase tracking-wider text-ink-400">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={pageAllSelected}
                      onChange={togglePage}
                      aria-label="Select page"
                    />
                  </th>
                  <th className="p-3">Organisation</th>
                  <th className="p-3">To</th>
                  <th className="p-3">Template</th>
                  <th className="p-3">Staged</th>
                </tr>
              </thead>
              <tbody>
                {held.map((row) => (
                  <tr key={row.id} className="border-b border-ink-100 dark:border-border">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        aria-label={`Select ${row.organizations?.name ?? row.recipient_email}`}
                      />
                    </td>
                    <td className="p-3 font-medium text-ink-950 dark:text-foreground">
                      {row.organization_id ? (
                        <Link to={`/organizations/${row.organization_id}`} className="underline-offset-2 hover:underline">
                          {row.organizations?.name ?? 'Organisation'}
                        </Link>
                      ) : (
                        row.organizations?.name ?? '—'
                      )}
                    </td>
                    <td className="p-3 font-mono text-2xs">{row.recipient_email}</td>
                    <td className="p-3 font-mono text-2xs">
                      {NOTIFICATION_TEMPLATE_LABELS[row.template as OutreachEmailTemplate] ?? row.template}
                    </td>
                    <td className="p-3 font-mono text-2xs text-ink-500">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {heldPages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t-2 border-ink-100 px-4 py-3">
            <button
              type="button"
              disabled={heldPage <= 1}
              onClick={() => setHeldPage((p) => Math.max(1, p - 1))}
              className="btn-brutal-outline text-2xs min-h-[36px] px-3 inline-flex items-center gap-1"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="font-mono text-2xs text-ink-500">
              Page {heldPage} / {heldPages}
            </span>
            <button
              type="button"
              disabled={heldPage >= heldPages}
              onClick={() => setHeldPage((p) => Math.min(heldPages, p + 1))}
              className="btn-brutal-outline text-2xs min-h-[36px] px-3 inline-flex items-center gap-1"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
