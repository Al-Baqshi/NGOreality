import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import { MetricCard, QueryError } from '../../components/ui';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useOutreachSegmentCounts, type OutreachSegment } from '../../hooks/useOutreachWorklist';
import {
  addDaysIso,
  addScheduleRecipientsByFilter,
  addScheduleRecipientsByIds,
  fetchScheduleSummary,
  listOutreachSchedules,
  nzTodayIso,
  removeScheduleRecipients,
  runDueSchedulesNow,
  SCHEDULE_ROSTER_PAGE_SIZE,
  setOutreachScheduleStatus,
  upsertOutreachSchedule,
  useScheduleRecipients,
  type OutreachSchedule,
  type ScheduleSummary,
} from '../../hooks/useOutreachSchedule';
import { captureError } from '../../lib/errorReporting';
import { draftOutreachEmailForOrg } from '../../lib/crmOutreach';
import { supabase } from '../../lib/supabase';
import {
  NOTIFICATION_TEMPLATE_LABELS,
  OUTREACH_EMAIL_TEMPLATES,
  OUTREACH_STATUS_LABELS,
  OUTREACH_KANBAN_STATUSES,
  type OutreachEmailTemplate,
  type OutreachStatus,
} from '../../types';

type SearchHit = {
  id: string;
  name: string;
  email: string | null;
  slug: string | null;
};

const SEGMENTS: { key: OutreachSegment; label: string }[] = [
  { key: 'all', label: 'All leads' },
  { key: 'site_down', label: 'Site down' },
  { key: 'no_website', label: 'No website' },
  { key: 'site_ok', label: 'Site healthy' },
  { key: 'url_invalid', label: 'Broken URL' },
  { key: 'never_checked', label: 'Never checked' },
];

const STATUS_LABEL: Record<OutreachSchedule['status'], string> = {
  draft: 'Draft',
  armed: 'Armed — will send',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formatSendTime(t: string): string {
  // "09:00:00" or "09:00"
  return t.slice(0, 5);
}

export default function ScheduledOutreach() {
  const confirm = useConfirm();
  const todayNz = nzTodayIso();

  const [schedules, setSchedules] = useState<OutreachSchedule[]>([]);
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<OutreachSchedule | null>(null);
  const [summary, setSummary] = useState<ScheduleSummary | null>(null);

  const [name, setName] = useState('Daily outreach');
  const [sendTime, setSendTime] = useState('09:00');
  const [startsOn, setStartsOn] = useState(todayNz);
  const [durationDays, setDurationDays] = useState(7);
  const [dailyCap, setDailyCap] = useState(100);
  const [template, setTemplate] = useState<OutreachEmailTemplate>('outreach_cold_invite');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState<OutreachSegment>('no_website');
  const [outreach, setOutreach] = useState<OutreachStatus | ''>('not_contacted');
  const [addCount, setAddCount] = useState(100);

  const [orgSearch, setOrgSearch] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSelected, setSearchSelected] = useState<Set<string>>(new Set());

  const [rosterPage, setRosterPage] = useState(1);
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endsOn = useMemo(() => addDaysIso(startsOn, Math.max(1, durationDays) - 1), [startsOn, durationDays]);
  const { counts } = useOutreachSegmentCounts(refreshKey);
  const { rows, total, loading: rosterLoading, error: rosterError } = useScheduleRecipients(
    scheduleId,
    rosterPage,
    refreshKey,
  );

  const rosterPages = Math.max(1, Math.ceil(total / SCHEDULE_ROSTER_PAGE_SIZE));
  const pageAllSelected = rows.length > 0 && rows.every((r) => selectedOrgIds.has(r.organization_id));
  const editable = schedule?.status === 'draft' || schedule?.status === 'paused' || schedule?.status === 'armed' || !schedule;

  useEffect(() => {
    const draft = draftOutreachEmailForOrg(template, '{name}');
    setSubject(draft.subject);
    setBody(draft.body);
  }, [template]);

  const applyScheduleToForm = useCallback((s: OutreachSchedule) => {
    setSchedule(s);
    setScheduleId(s.id);
    setName(s.name);
    setSendTime(formatSendTime(s.send_time));
    setStartsOn(s.starts_on);
    const days = Math.max(1, Math.round(
      (new Date(s.ends_on + 'T00:00:00Z').getTime() - new Date(s.starts_on + 'T00:00:00Z').getTime()) /
        86_400_000,
    ) + 1);
    setDurationDays(days);
    setDailyCap(s.daily_cap);
    setTemplate(s.template);
    setSubject(s.subject ?? '');
    setBody(s.body ?? '');
    setSegment((s.segment as OutreachSegment) || 'all');
    setOutreach((s.outreach_status as OutreachStatus) || '');
    setRosterPage(1);
    setSelectedOrgIds(new Set());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listOutreachSchedules();
      setSchedules(list);
      const active =
        (scheduleId && list.find((s) => s.id === scheduleId)) ||
        list.find((s) => s.status === 'armed' || s.status === 'draft' || s.status === 'paused') ||
        list[0] ||
        null;
      if (active) {
        applyScheduleToForm(active);
        const sum = await fetchScheduleSummary(active.id);
        setSummary(sum);
      } else {
        setSchedule(null);
        setScheduleId(null);
        setSummary(null);
      }
    } catch (e) {
      setError(captureError(e, { where: 'ScheduledOutreach.load' }));
    } finally {
      setLoading(false);
    }
  }, [applyScheduleToForm, scheduleId]);

  useEffect(() => {
    void load();
    // intentionally only on refreshKey — scheduleId changes via applyScheduleToForm
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function refreshSummary(id: string) {
    try {
      setSummary(await fetchScheduleSummary(id));
    } catch (e) {
      setNotice(captureError(e, { where: 'ScheduledOutreach.summary' }));
    }
  }

  async function handleSave() {
    setBusy(true);
    setNotice(null);
    setNoticeIsError(false);
    try {
      const saved = await upsertOutreachSchedule({
        id: scheduleId,
        name,
        sendTime,
        startsOn,
        endsOn,
        dailyCap,
        template,
        subject,
        body,
        segment,
        outreachStatus: outreach,
      });
      setNotice(`Saved schedule · ${formatSendTime(saved.send_time)} NZ · ${saved.starts_on} → ${saved.ends_on}`);
      applyScheduleToForm(saved);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setNoticeIsError(true);
      setNotice(captureError(e, { where: 'ScheduledOutreach.save' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleNew() {
    setSchedule(null);
    setScheduleId(null);
    setSummary(null);
    setName('Daily outreach');
    setSendTime('09:00');
    setStartsOn(todayNz);
    setDurationDays(7);
    setDailyCap(100);
    setTemplate('outreach_cold_invite');
    setSegment('no_website');
    setOutreach('not_contacted');
    setAddCount(100);
    setSelectedOrgIds(new Set());
    setRosterPage(1);
    const draft = draftOutreachEmailForOrg('outreach_cold_invite', '{name}');
    setSubject(draft.subject);
    setBody(draft.body);
    setNotice('New schedule — save to create, then add contacts to the roster.');
  }

  async function handleSaveInternal() {
    const saved = await upsertOutreachSchedule({
      id: scheduleId,
      name,
      sendTime,
      startsOn,
      endsOn,
      dailyCap,
      template,
      subject,
      body,
      segment,
      outreachStatus: outreach,
    });
    applyScheduleToForm(saved);
    return saved;
  }

  /** Ensure a schedule row exists before roster mutations. */
  async function ensureScheduleSaved(): Promise<string> {
    if (scheduleId) return scheduleId;
    const saved = await handleSaveInternal();
    return saved.id;
  }

  async function handleArm() {
    const ok = await confirm({
      title: 'Arm this schedule?',
      description:
        `Emails will send automatically at ${sendTime} New Zealand time each day from ${startsOn} to ${endsOn}, ` +
        `up to ${dailyCap}/day, to new queued contacts only.\n\nArming is your permission to send.`,
      confirmLabel: 'Arm schedule',
    });
    if (!ok) return;
    setBusy(true);
    setNotice(null);
    setNoticeIsError(false);
    try {
      const saved = await handleSaveInternal();
      const updated = await setOutreachScheduleStatus(saved.id, 'armed');
      applyScheduleToForm(updated);
      await refreshSummary(updated.id);
      setNotice('Armed — will auto-send at the NZ time each day in the window.');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setNoticeIsError(true);
      setNotice(captureError(e, { where: 'ScheduledOutreach.arm' }));
    } finally {
      setBusy(false);
    }
  }

  async function handlePause() {
    if (!scheduleId) return;
    setBusy(true);
    try {
      const updated = await setOutreachScheduleStatus(scheduleId, 'paused');
      applyScheduleToForm(updated);
      await refreshSummary(updated.id);
      setNotice('Paused — no further automatic sends until you arm again.');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setNotice(captureError(e, { where: 'ScheduledOutreach.pause' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!scheduleId) return;
    const ok = await confirm({
      title: 'Cancel schedule?',
      description: 'Stops all future sends. Queued roster contacts stay but will not be released.',
      confirmLabel: 'Cancel schedule',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const updated = await setOutreachScheduleStatus(scheduleId, 'cancelled');
      applyScheduleToForm(updated);
      await refreshSummary(updated.id);
      setNotice('Schedule cancelled.');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setNotice(captureError(e, { where: 'ScheduledOutreach.cancel' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFromSegment() {
    setBusy(true);
    setNotice(null);
    setNoticeIsError(false);
    try {
      const id = await ensureScheduleSaved();
      const result = await addScheduleRecipientsByFilter(id, {
        segment,
        outreach,
        max: addCount,
      });
      setNotice(
        `Added ${result.added.toLocaleString()} · skipped no email ${result.skipped_no_email} · ` +
          `suppressed ${result.skipped_suppressed} · already outreached ${result.skipped_dedupe} · ` +
          `already on roster ${result.skipped_on_roster}`,
      );
      setRefreshKey((k) => k + 1);
      await refreshSummary(id);
    } catch (e) {
      setNoticeIsError(true);
      setNotice(captureError(e, { where: 'ScheduledOutreach.add' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFromSearch() {
    if (!searchSelected.size) {
      setNoticeIsError(true);
      setNotice('Tick the checkbox next to each organisation, then click Add selected.');
      return;
    }
    setBusy(true);
    setNotice(null);
    setNoticeIsError(false);
    try {
      const id = await ensureScheduleSaved();
      const result = await addScheduleRecipientsByIds(id, Array.from(searchSelected));
      const msg =
        `Added ${result.added.toLocaleString()} from search · skipped no email ${result.skipped_no_email} · ` +
        `suppressed ${result.skipped_suppressed} · already outreached ${result.skipped_dedupe} · ` +
        `already on roster ${result.skipped_on_roster}`;
      if (result.added === 0) {
        setNoticeIsError(true);
        setNotice(
          `Nothing added. ${msg}. Orgs with no email, suppressed addresses, or already on this roster are skipped.`,
        );
      } else {
        setNotice(msg);
        setSearchSelected(new Set());
      }
      setRefreshKey((k) => k + 1);
      await refreshSummary(id);
    } catch (e) {
      setNoticeIsError(true);
      setNotice(captureError(e, { where: 'ScheduledOutreach.addSearch' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddOneFromSearch(orgId: string) {
    setBusy(true);
    setNotice(null);
    setNoticeIsError(false);
    try {
      const id = await ensureScheduleSaved();
      const result = await addScheduleRecipientsByIds(id, [orgId]);
      if (result.added === 0) {
        setNoticeIsError(true);
        setNotice(
          `Could not add that organisation (no email ${result.skipped_no_email}, suppressed ${result.skipped_suppressed}, already on roster ${result.skipped_on_roster}).`,
        );
      } else {
        setNotice(`Added 1 organisation to the roster.`);
        setSearchSelected((prev) => {
          const next = new Set(prev);
          next.delete(orgId);
          return next;
        });
      }
      setRefreshKey((k) => k + 1);
      await refreshSummary(id);
    } catch (e) {
      setNoticeIsError(true);
      setNotice(captureError(e, { where: 'ScheduledOutreach.addOne' }));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const q = orgSearch.trim();
    if (q.length < 2) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      const safe = q.replace(/[%_,]/g, ' ').trim();
      void supabase
        .from('organizations')
        .select('id, name, email, slug')
        .eq('status', 'listed')
        .eq('is_customer', false)
        .or(`name.ilike.%${safe}%,email.ilike.%${safe}%`)
        .order('name', { ascending: true })
        .limit(25)
        .then(({ data, error: qError }) => {
          if (cancelled) return;
          if (qError) {
            setNoticeIsError(true);
            setNotice(captureError(qError, { where: 'ScheduledOutreach.search' }));
            setSearchHits([]);
          } else {
            setSearchHits((data ?? []) as SearchHit[]);
          }
          setSearchLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [orgSearch]);

  function toggleSearchHit(id: string) {
    setSearchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRemoveSelected() {
    if (!scheduleId || !selectedOrgIds.size) return;
    setBusy(true);
    try {
      const result = await removeScheduleRecipients(scheduleId, Array.from(selectedOrgIds));
      setNotice(`Removed ${result.removed.toLocaleString()} queued contact(s).`);
      setSelectedOrgIds(new Set());
      setRefreshKey((k) => k + 1);
      await refreshSummary(scheduleId);
    } catch (e) {
      setNotice(captureError(e, { where: 'ScheduledOutreach.remove' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleRunNow() {
    const ok = await confirm({
      title: 'Run due schedules now?',
      description:
        'If the NZ send time has already passed today for an armed schedule, this releases today’s slice immediately. Otherwise nothing happens.',
      confirmLabel: 'Run now',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await runDueSchedulesNow();
      setNotice(
        `Runner: ${result.schedules_run} schedule(s) · released ${result.released} · completed expired ${result.completed_expired}`,
      );
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setNotice(captureError(e, { where: 'ScheduledOutreach.runNow' }));
    } finally {
      setBusy(false);
    }
  }

  function toggleRow(orgId: string) {
    setSelectedOrgIds((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  function togglePage() {
    if (pageAllSelected) {
      setSelectedOrgIds((prev) => {
        const next = new Set(prev);
        rows.forEach((r) => next.delete(r.organization_id));
        return next;
      });
    } else {
      setSelectedOrgIds((prev) => {
        const next = new Set(prev);
        rows.forEach((r) => next.add(r.organization_id));
        return next;
      });
    }
  }

  const nextPreview =
    summary?.next_send_preview && schedule
      ? `Next send: ${summary.next_send_preview} at ${formatSendTime(schedule.send_time)} NZ · up to ${schedule.daily_cap} new contacts · Day ${summary.day_index} of ${summary.total_days}`
      : schedule?.status === 'armed'
        ? 'No further send days in this window (or roster empty).'
        : 'Arm the schedule to auto-send at the NZ time.';

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Scheduled outreach</h1>
          <p className="text-sm text-ink-600 dark:text-muted-foreground mt-1 max-w-2xl">
            Daily auto-send at a New Zealand time. Build a roster of contacts; each day only new queued people
            are emailed — never repeats.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void handleNew()} className="btn-brutal-outline text-sm min-h-[44px] inline-flex items-center gap-2">
            <Plus size={16} /> New schedule
          </button>
          <Link to="/outreach" className="btn-brutal-outline text-sm inline-flex items-center gap-2 min-h-[44px]">
            Outreach worklist
          </Link>
          <Link
            to="/email-notifications?status=pending"
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
        <p
          className={`mb-4 font-mono text-2xs ${noticeIsError ? 'text-accent' : 'text-teal'}`}
          role="status"
        >
          {notice}
        </p>
      )}

      {!scheduleId && (
        <p className="mb-4 border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" role="status">
          Tip: fill section 1, then use <strong>Add segment to roster</strong> or search below — the schedule is saved automatically when you add contacts.
        </p>
      )}

      {schedules.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {schedules.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                applyScheduleToForm(s);
                setRefreshKey((k) => k + 1);
              }}
              className={`btn-brutal-outline text-2xs min-h-[36px] px-3 ${
                s.id === scheduleId ? '!border-teal !text-teal' : ''
              }`}
            >
              {s.name} · {STATUS_LABEL[s.status]} · {formatSendTime(s.send_time)} NZ
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard compact label="Queued" value={summary ? summary.queued : '—'} sub="Waiting to send" />
        <MetricCard compact label="Released" value={summary ? summary.released : '—'} sub="Already sliced" />
        <MetricCard
          compact
          label="Released today"
          value={summary ? summary.released_today : '—'}
          sub="NZ calendar day"
          accent
        />
        <MetricCard
          compact
          label="Window"
          value={summary ? `${summary.day_index}/${summary.total_days}` : '—'}
          sub={schedule ? `${schedule.starts_on} → ${schedule.ends_on}` : 'Set dates below'}
        />
      </div>

      <p className="mb-6 font-mono text-2xs text-ink-500 border-2 border-ink-100 px-3 py-2 dark:border-border">
        <CalendarClock size={14} className="inline mr-1 -mt-0.5" />
        {nextPreview}
        {schedule && (
          <span className="ml-2 text-ink-800 dark:text-foreground">· Status: {STATUS_LABEL[schedule.status]}</span>
        )}
      </p>

      <section className="card-brutal p-4 mb-6 space-y-4">
        <h2 className="font-display text-lg text-ink-950 dark:text-foreground">1. Schedule (NZ time)</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm sm:col-span-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!editable && !!schedule && schedule.status !== 'armed'}
              className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm dark:bg-background dark:border-border"
            />
          </label>
          <label className="block text-sm">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Send time (NZ)</span>
            <input
              type="time"
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
              className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm dark:bg-background dark:border-border"
            />
          </label>
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
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Starts on (NZ)</span>
            <input
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm dark:bg-background dark:border-border"
            />
          </label>
          <label className="block text-sm">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Run for (days)</span>
            <input
              type="number"
              min={1}
              max={90}
              value={durationDays}
              onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm dark:bg-background dark:border-border"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Ends on</span>
            <input
              type="date"
              value={endsOn}
              readOnly
              className="mt-1 w-full border-2 border-ink-200 bg-ink-50 px-3 py-2 text-sm dark:bg-muted dark:border-border"
            />
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
            Body <span className="normal-case tracking-normal text-ink-400">({'{name}'}, {'{page}'})</span>
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm font-mono dark:bg-background dark:border-border"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className="btn-brutal-outline text-sm min-h-[44px] px-4"
          >
            {busy ? <Loader2 size={16} className="animate-spin inline" /> : null} Save schedule
          </button>
          {schedule?.status !== 'armed' && schedule?.status !== 'completed' && schedule?.status !== 'cancelled' && (
            <button
              type="button"
              disabled={busy || !scheduleId}
              onClick={() => void handleArm()}
              className="btn-brutal-teal text-sm min-h-[44px] px-4 inline-flex items-center gap-2"
            >
              <Play size={16} /> Arm (auto-send)
            </button>
          )}
          {schedule?.status === 'armed' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handlePause()}
              className="btn-brutal-outline text-sm min-h-[44px] px-4 inline-flex items-center gap-2"
            >
              <Pause size={16} /> Pause
            </button>
          )}
          {schedule && schedule.status !== 'cancelled' && schedule.status !== 'completed' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCancel()}
              className="btn-brutal-outline text-sm min-h-[44px] px-4 inline-flex items-center gap-2 text-accent"
            >
              <XCircle size={16} /> Cancel
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRunNow()}
            className="btn-brutal-outline text-sm min-h-[44px] px-4"
          >
            Run due now
          </button>
        </div>
      </section>

      <section className="card-brutal p-4 mb-6 space-y-4">
        <h2 className="font-display text-lg text-ink-950 dark:text-foreground">2. Add contacts to roster</h2>
        <p className="text-sm text-ink-600 dark:text-muted-foreground">
          Only new people are added — skips no email, suppressed, already on this roster, or already emailed this
          template in the last year.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <label className="block text-sm">
            <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">Add up to</span>
            <input
              type="number"
              min={1}
              max={5000}
              value={addCount}
              onChange={(e) => setAddCount(Math.max(1, Number(e.target.value) || 1))}
              className="mt-1 w-full border-2 border-ink-200 bg-white px-3 py-2 text-sm dark:bg-background dark:border-border"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleAddFromSegment()}
              className="btn-brutal-teal text-sm min-h-[44px] px-4 w-full inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add segment to roster
            </button>
          </div>
        </div>

        <div className="border-t-2 border-ink-100 pt-4 dark:border-border space-y-3">
          <h3 className="font-mono text-2xs uppercase tracking-wider text-ink-500">
            Or search and pick organisations
          </h3>
          <label className="block text-sm max-w-xl">
            <span className="sr-only">Search organisations</span>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden />
              <input
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                placeholder="Search by name or email (min 2 characters)…"
                className="w-full border-2 border-ink-200 bg-white pl-10 pr-3 py-2 text-sm min-h-[44px] dark:bg-background dark:border-border"
              />
            </div>
          </label>

          {searchLoading && (
            <p className="font-mono text-2xs text-ink-400 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Searching…
            </p>
          )}

          {!searchLoading && orgSearch.trim().length >= 2 && searchHits.length === 0 && (
            <p className="text-sm text-ink-500">No listed non-customer organisations match.</p>
          )}

          {searchHits.length > 0 && (
            <div className="border-2 border-ink-200 dark:border-border overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-ink-50 dark:bg-muted">
                    <tr className="text-left font-mono text-2xs uppercase tracking-wider text-ink-400">
                      <th className="p-2 w-10">
                        <input
                          type="checkbox"
                          checked={searchHits.length > 0 && searchHits.every((h) => searchSelected.has(h.id))}
                          onChange={() => {
                            const allSelected = searchHits.every((h) => searchSelected.has(h.id));
                            setSearchSelected((prev) => {
                              const next = new Set(prev);
                              if (allSelected) searchHits.forEach((h) => next.delete(h.id));
                              else searchHits.forEach((h) => next.add(h.id));
                              return next;
                            });
                          }}
                          aria-label="Select all search results"
                        />
                      </th>
                      <th className="p-2">Organisation</th>
                      <th className="p-2">Email</th>
                      <th className="p-2 w-28" />
                    </tr>
                  </thead>
                  <tbody>
                    {searchHits.map((hit) => (
                      <tr
                        key={hit.id}
                        className={`border-t border-ink-100 dark:border-border cursor-pointer ${
                          searchSelected.has(hit.id) ? 'bg-teal/10' : 'hover:bg-ink-50 dark:hover:bg-muted/40'
                        }`}
                        onClick={() => toggleSearchHit(hit.id)}
                      >
                        <td className="p-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={searchSelected.has(hit.id)}
                            onChange={() => toggleSearchHit(hit.id)}
                            aria-label={`Select ${hit.name}`}
                          />
                        </td>
                        <td className="p-2 font-medium">{hit.name}</td>
                        <td className="p-2 font-mono text-2xs">{hit.email ?? '—'}</td>
                        <td className="p-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleAddOneFromSearch(hit.id)}
                            className="btn-brutal-outline text-2xs min-h-[36px] px-2 disabled:opacity-50"
                          >
                            Add
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t-2 border-ink-200 dark:border-border p-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy || searchSelected.size === 0}
                  onClick={() => void handleAddFromSearch()}
                  className="btn-brutal-teal text-sm min-h-[44px] px-4 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add selected ({searchSelected.size})
                </button>
                <button
                  type="button"
                  disabled={busy || searchHits.length === 0}
                  onClick={() => {
                    setSearchSelected(new Set(searchHits.map((h) => h.id)));
                    // Defer add to next tick so state has the selection; call with ids directly instead
                    void (async () => {
                      setBusy(true);
                      setNotice(null);
                      setNoticeIsError(false);
                      try {
                        const id = await ensureScheduleSaved();
                        const result = await addScheduleRecipientsByIds(
                          id,
                          searchHits.map((h) => h.id),
                        );
                        if (result.added === 0) {
                          setNoticeIsError(true);
                          setNotice(
                            `Nothing added from results. Skipped no email ${result.skipped_no_email}, suppressed ${result.skipped_suppressed}, on roster ${result.skipped_on_roster}.`,
                          );
                        } else {
                          setNotice(`Added ${result.added.toLocaleString()} organisation(s) from search results.`);
                          setSearchSelected(new Set());
                        }
                        setRefreshKey((k) => k + 1);
                        await refreshSummary(id);
                      } catch (e) {
                        setNoticeIsError(true);
                        setNotice(captureError(e, { where: 'ScheduledOutreach.addAllHits' }));
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                  className="btn-brutal-outline text-sm min-h-[44px] px-4 disabled:opacity-50"
                >
                  Add all results ({searchHits.length})
                </button>
                {searchSelected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchSelected(new Set())}
                    className="btn-brutal-outline text-2xs min-h-[36px] px-3"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card-brutal overflow-hidden">
        <div className="border-b-2 border-gold bg-ink-950 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-mono text-2xs uppercase tracking-wider text-gold">
            3. Roster · {total.toLocaleString()} contact{total === 1 ? '' : 's'}
          </h2>
          <button
            type="button"
            disabled={busy || selectedOrgIds.size === 0}
            onClick={() => void handleRemoveSelected()}
            className="btn-brutal-outline text-2xs min-h-[36px] px-3 inline-flex items-center gap-1 !border-gold !text-gold"
          >
            <Trash2 size={14} /> Remove selected queued ({selectedOrgIds.size})
          </button>
        </div>

        {rosterError && <div className="p-4"><QueryError message={rosterError} /></div>}

        {!scheduleId ? (
          <p className="p-6 text-sm text-ink-500">Save a schedule to manage its roster.</p>
        ) : rosterLoading || loading ? (
          <p className="p-6 font-mono text-2xs text-ink-400 flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading roster…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-ink-500">No contacts yet. Add from a segment or search above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-ink-100 text-left font-mono text-2xs uppercase tracking-wider text-ink-400">
                  <th className="p-3 w-10">
                    <input type="checkbox" checked={pageAllSelected} onChange={togglePage} aria-label="Select page" />
                  </th>
                  <th className="p-3">Organisation</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Order</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-ink-100 dark:border-border">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedOrgIds.has(row.organization_id)}
                        disabled={row.status !== 'queued'}
                        onChange={() => toggleRow(row.organization_id)}
                        aria-label={`Select ${row.organizations?.name ?? row.organization_id}`}
                      />
                    </td>
                    <td className="p-3 font-medium">
                      <Link
                        to={`/organizations/${row.organization_id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {row.organizations?.name ?? 'Organisation'}
                      </Link>
                    </td>
                    <td className="p-3 font-mono text-2xs">{row.organizations?.email ?? '—'}</td>
                    <td className="p-3 font-mono text-2xs uppercase">{row.status}</td>
                    <td className="p-3 font-mono text-2xs text-ink-500">{row.sort_order}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rosterPages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t-2 border-ink-100 px-4 py-3">
            <button
              type="button"
              disabled={rosterPage <= 1}
              onClick={() => setRosterPage((p) => Math.max(1, p - 1))}
              className="btn-brutal-outline text-2xs min-h-[36px] px-3 inline-flex items-center gap-1"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="font-mono text-2xs text-ink-500">
              Page {rosterPage} / {rosterPages}
            </span>
            <button
              type="button"
              disabled={rosterPage >= rosterPages}
              onClick={() => setRosterPage((p) => Math.min(rosterPages, p + 1))}
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
