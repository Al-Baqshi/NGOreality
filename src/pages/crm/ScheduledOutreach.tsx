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
  deleteOutreachSchedule,
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
  type ScheduleRecipientStatus,
  type ScheduleSummary,
  type AddRecipientsResult,
  type AddRecipientSkip,
} from '../../hooks/useOutreachSchedule';
import { captureError } from '../../lib/errorReporting';
import { draftOutreachEmailForOrg } from '../../lib/crmOutreach';
import { supabase } from '../../lib/supabase';
import { formatNzDate } from '@/lib/formatDate';
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

/** Roster status → staff-facing label (queued = held in email queue until NZ send time). */
const RECIPIENT_STATUS_LABEL: Record<ScheduleRecipientStatus, string> = {
  queued: 'Held (waiting)',
  released: 'Released (sending)',
  sent: 'Sent',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
};

const INITIAL_DRAFT = draftOutreachEmailForOrg('outreach_cold_invite', '{name}');

const SKIP_REASON_LABEL: Record<string, string> = {
  no_email: 'No email',
  suppressed: 'Suppressed',
  on_roster: 'Already on roster',
  already_emailed: 'Already emailed',
};

function formatAddResult(result: AddRecipientsResult): string {
  return (
    `Added ${result.added.toLocaleString()}` +
    ` · no email ${result.skipped_no_email}` +
    ` · suppressed ${result.skipped_suppressed}` +
    ` · already emailed ${result.skipped_dedupe}` +
    ` · already on roster ${result.skipped_on_roster}`
  );
}

function skipListFromResult(result: AddRecipientsResult): AddRecipientSkip[] {
  return Array.isArray(result.skips) ? result.skips : [];
}

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
  const [subject, setSubject] = useState(INITIAL_DRAFT.subject);
  const [body, setBody] = useState(INITIAL_DRAFT.body);
  const [segment, setSegment] = useState<OutreachSegment>('no_website');
  const [outreach, setOutreach] = useState<OutreachStatus | ''>('not_contacted');
  const [addCount, setAddCount] = useState(100);

  const [orgSearch, setOrgSearch] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchSelected, setSearchSelected] = useState<Set<string>>(new Set());

  const [rosterPage, setRosterPage] = useState(1);
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
  /** Full reload (initial / Refresh / pick schedule) — may re-apply form from DB. */
  const [listRefreshKey, setListRefreshKey] = useState(0);
  /** Roster + segment counts only — does not wipe the form. */
  const [rosterRefreshKey, setRosterRefreshKey] = useState(0);
  /** True while editing a brand-new schedule that is not saved yet. */
  const [composingNew, setComposingNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [skipDetails, setSkipDetails] = useState<AddRecipientSkip[]>([]);
  const [skipsTruncated, setSkipsTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endsOn = useMemo(() => addDaysIso(startsOn, Math.max(1, durationDays) - 1), [startsOn, durationDays]);
  const { counts } = useOutreachSegmentCounts(rosterRefreshKey);
  const { rows, total, loading: rosterLoading, error: rosterError } = useScheduleRecipients(
    scheduleId,
    rosterPage,
    rosterRefreshKey,
  );

  const rosterPages = Math.max(1, Math.ceil(total / SCHEDULE_ROSTER_PAGE_SIZE));
  const pageAllSelected = rows.length > 0 && rows.every((r) => selectedOrgIds.has(r.organization_id));
  const editable =
    schedule?.status === 'draft' ||
    schedule?.status === 'paused' ||
    schedule?.status === 'armed' ||
    schedule?.status === 'completed' ||
    !schedule;

  function bumpRoster() {
    setRosterRefreshKey((k) => k + 1);
  }

  function bumpListAndRoster() {
    setListRefreshKey((k) => k + 1);
    setRosterRefreshKey((k) => k + 1);
  }

  function applyAddOutcome(result: AddRecipientsResult, options?: { emptyHint?: string }) {
    const msg = formatAddResult(result);
    const skips = skipListFromResult(result);
    setSkipDetails(skips);
    setSkipsTruncated(Boolean(result.skips_truncated));
    if (result.added === 0) {
      setNoticeIsError(true);
      setNotice(options?.emptyHint ? `${options.emptyHint} ${msg}.` : `Nothing added. ${msg}.`);
    } else {
      setNoticeIsError(false);
      setNotice(msg);
    }
  }

  function clearNotices() {
    setNotice(null);
    setNoticeIsError(false);
    setSkipDetails([]);
    setSkipsTruncated(false);
  }

  function applyTemplateDraft(t: OutreachEmailTemplate) {
    setTemplate(t);
    const draft = draftOutreachEmailForOrg(t, '{name}');
    setSubject(draft.subject);
    setBody(draft.body);
  }

  const applyScheduleToForm = useCallback((s: OutreachSchedule) => {
    setComposingNew(false);
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

  const load = useCallback(async (
    mode: 'full' | 'soft' = 'full',
    preferId?: string | null,
  ) => {
    if (mode === 'full') setLoading(true);
    setError(null);
    try {
      const list = await listOutreachSchedules();
      setSchedules(list);

      const effectiveId = preferId !== undefined ? preferId : scheduleId;

      // Keep blank "New schedule" form; only refresh the schedule chips list.
      if (composingNew && !effectiveId) {
        setSummary(null);
        return;
      }

      const active =
        (effectiveId && list.find((s) => s.id === effectiveId)) ||
        (mode === 'full' && !effectiveId
          ? list.find((s) => s.status === 'armed' || s.status === 'draft' || s.status === 'paused') ||
            list[0] ||
            null
          : null);

      if (active) {
        if (mode === 'full') {
          applyScheduleToForm(active);
        } else {
          setComposingNew(false);
          setSchedule(active);
          setScheduleId(active.id);
        }
        const sum = await fetchScheduleSummary(active.id);
        setSummary(sum);
      } else if (mode === 'full') {
        setSchedule(null);
        setScheduleId(null);
        setSummary(null);
      }
    } catch (e) {
      setError(captureError(e, { where: 'ScheduledOutreach.load' }));
    } finally {
      if (mode === 'full') setLoading(false);
    }
  }, [applyScheduleToForm, composingNew, scheduleId]);

  useEffect(() => {
    void load('full');
    // intentionally only on listRefreshKey — scheduleId changes via applyScheduleToForm
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRefreshKey]);

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
      setNotice(`Saved schedule · ${formatSendTime(saved.send_time)} NZ · ${formatNzDate(saved.starts_on)} → ${formatNzDate(saved.ends_on)}`);
      applyScheduleToForm(saved);
      await refreshSummary(saved.id);
      bumpRoster();
      void load('soft', saved.id);
    } catch (e) {
      setNoticeIsError(true);
      setNotice(captureError(e, { where: 'ScheduledOutreach.save' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleNew() {
    setComposingNew(true);
    setSchedule(null);
    setScheduleId(null);
    setSummary(null);
    setName('Daily outreach');
    setSendTime('09:00');
    setStartsOn(todayNz);
    setDurationDays(7);
    setDailyCap(100);
    applyTemplateDraft('outreach_cold_invite');
    setSegment('no_website');
    setOutreach('not_contacted');
    setAddCount(100);
    setSelectedOrgIds(new Set());
    setRosterPage(1);
    setNotice('New schedule — add contacts or save; draft is kept if you Refresh.');
    setNoticeIsError(false);
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

  /** Persist current form (create or update) before roster mutations so held emails use latest draft. */
  async function ensureScheduleSaved(): Promise<string> {
    const saved = await handleSaveInternal();
    // Ensure roster queries use this id even before the next React paint.
    setScheduleId(saved.id);
    setComposingNew(false);
    return saved.id;
  }

  async function handleArm() {
    setBusy(true);
    setNotice(null);
    setNoticeIsError(false);
    try {
      const saved = await handleSaveInternal();
      const sum = await fetchScheduleSummary(saved.id);
      setSummary(sum);
      if ((sum.queued ?? 0) < 1) {
        setNoticeIsError(true);
        setNotice('Add at least one contact to the roster before arming.');
        bumpRoster();
        return;
      }
      const ok = await confirm({
        title: 'Arm this schedule?',
        description:
          `Emails release only in a short New Zealand window at ${sendTime} each day from ${startsOn} to ${endsOn} ` +
          `(about 20 minutes from that time), up to ${dailyCap}/day, to new held contacts only.\n\n` +
          `Arming after today’s window waits until the next day’s ${sendTime} NZ.\n\nArming is your permission to send.`,
        confirmLabel: 'Arm schedule',
      });
      if (!ok) return;
      const updated = await setOutreachScheduleStatus(saved.id, 'armed');
      applyScheduleToForm(updated);
      await refreshSummary(updated.id);
      setNotice('Armed — will auto-send at the NZ time each day in the window.');
      bumpRoster();
      void load('soft', updated.id);
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
      bumpRoster();
      void load('soft', updated.id);
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
      description: 'Stops all future sends. Held roster contacts stay but will not be released.',
      confirmLabel: 'Cancel schedule',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const updated = await setOutreachScheduleStatus(scheduleId, 'cancelled');
      applyScheduleToForm(updated);
      await refreshSummary(updated.id);
      setNotice('Schedule cancelled.');
      bumpRoster();
      void load('soft', updated.id);
    } catch (e) {
      setNotice(captureError(e, { where: 'ScheduledOutreach.cancel' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!scheduleId) return;
    const ok = await confirm({
      title: 'Delete this schedule?',
      description:
        `Permanently removes “${name}”, its roster, and cancels held emails waiting to send. ` +
        'Emails already released to the queue may still deliver.',
      confirmLabel: 'Delete schedule',
    });
    if (!ok) return;
    setBusy(true);
    clearNotices();
    try {
      const result = await deleteOutreachSchedule(scheduleId);
      setNotice(
        `Schedule deleted${result.held_cancelled ? ` · ${result.held_cancelled} held email(s) cancelled` : ''}.`,
      );
      setNoticeIsError(false);
      await handleNew();
      bumpListAndRoster();
    } catch (e) {
      setNoticeIsError(true);
      setNotice(captureError(e, { where: 'ScheduledOutreach.delete' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFromSegment() {
    setBusy(true);
    clearNotices();
    try {
      const id = await ensureScheduleSaved();
      const result = await addScheduleRecipientsByFilter(id, {
        segment,
        outreach,
        max: addCount,
      });
      applyAddOutcome(result, {
        emptyHint:
          result.skipped_dedupe > 0
            ? 'Nothing added from segment — many matches already have a recent/held email for this template. Try search Add for specific orgs, or a different segment.'
            : 'Nothing added from segment.',
      });
      bumpRoster();
      await refreshSummary(id);
      void load('soft', id);
    } catch (e) {
      setNoticeIsError(true);
      setSkipDetails([]);
      setNotice(captureError(e, { where: 'ScheduledOutreach.add' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddFromSearch() {
    if (!searchSelected.size) {
      setNoticeIsError(true);
      setSkipDetails([]);
      setNotice('Tick the checkbox next to each organisation, then click Add selected.');
      return;
    }
    setBusy(true);
    clearNotices();
    try {
      const id = await ensureScheduleSaved();
      const result = await addScheduleRecipientsByIds(id, Array.from(searchSelected));
      applyAddOutcome(result);
      if (result.added > 0) setSearchSelected(new Set());
      bumpRoster();
      await refreshSummary(id);
      void load('soft', id);
    } catch (e) {
      setNoticeIsError(true);
      setSkipDetails([]);
      setNotice(captureError(e, { where: 'ScheduledOutreach.addSearch' }));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddOneFromSearch(orgId: string) {
    setBusy(true);
    clearNotices();
    try {
      const id = await ensureScheduleSaved();
      const result = await addScheduleRecipientsByIds(id, [orgId]);
      applyAddOutcome(result, { emptyHint: 'Could not add that organisation.' });
      if (result.added > 0) {
        setSearchSelected((prev) => {
          const next = new Set(prev);
          next.delete(orgId);
          return next;
        });
      }
      bumpRoster();
      await refreshSummary(id);
      void load('soft', id);
    } catch (e) {
      setNoticeIsError(true);
      setSkipDetails([]);
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
      setNotice(`Removed ${result.removed.toLocaleString()} held contact(s).`);
      setSelectedOrgIds(new Set());
      bumpRoster();
      await refreshSummary(scheduleId);
      void load('soft', scheduleId);
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
        'Only works during today’s NZ send window (send time plus about 20 minutes). Outside that window nothing is released — wait for the next day’s slot.',
      confirmLabel: 'Run now',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await runDueSchedulesNow();
      setNotice(
        `Runner: ${result.schedules_run} schedule(s) · released ${result.released} · completed expired ${result.completed_expired}`,
      );
      bumpRoster();
      void load('soft', scheduleId);
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
      ? `Next send: ${summary.next_send_preview} around ${formatSendTime(schedule.send_time)} NZ (20‑min window) · up to ${schedule.daily_cap} new contacts · Day ${summary.day_index} of ${summary.total_days}`
      : schedule?.status === 'armed'
        ? 'No further send days in this window (or roster empty).'
        : 'Arm the schedule to auto-send at the NZ time.';

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Scheduled outreach</h1>
          <p className="text-sm text-ink-600 dark:text-muted-foreground mt-1 max-w-2xl">
            Daily auto-send at a New Zealand time. Each day releases only inside a short window at that
            time (e.g. 9:00–9:20 NZ) — not earlier, and not later the same day if you arm after the slot.
            Top up the roster anytime during the date window.
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
            to="/email-notifications?status=held"
            className="btn-brutal-outline text-sm inline-flex items-center gap-2 min-h-[44px]"
          >
            <Mail size={16} /> Email queue (scheduled)
          </Link>
          <button
            type="button"
            onClick={() => {
              if (composingNew && !scheduleId) {
                void load('soft');
                bumpRoster();
              } else {
                bumpListAndRoster();
              }
            }}
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
          className={`mb-2 font-mono text-2xs ${noticeIsError ? 'text-accent' : 'text-teal'}`}
          role="status"
        >
          {notice}
        </p>
      )}
      {skipDetails.length > 0 && (
        <div
          className="mb-4 border-2 border-amber-400 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
        >
          <p className="font-mono text-2xs uppercase tracking-wider mb-2">
            Why these were skipped
          </p>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {skipDetails.map((s) => (
              <li key={`${s.organization_id}-${s.reason}`} className="text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="font-mono text-2xs mx-1.5 uppercase tracking-wide opacity-80">
                  {SKIP_REASON_LABEL[s.reason] ?? s.reason}
                </span>
                <span className="text-ink-700 dark:text-amber-50/90">— {s.detail}</span>
              </li>
            ))}
          </ul>
          {skipsTruncated && (
            <p className="mt-2 font-mono text-2xs opacity-80">
              Showing first {skipDetails.length} skipped organisations; more were skipped (see counts above).
            </p>
          )}
        </div>
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
                setComposingNew(false);
                applyScheduleToForm(s);
                bumpListAndRoster();
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
        <MetricCard compact label="Held" value={summary ? summary.queued : '—'} sub="Waiting for NZ send" />
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
          sub={schedule ? `${formatNzDate(schedule.starts_on)} → ${formatNzDate(schedule.ends_on)}` : 'Set dates below'}
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
            onChange={(e) => applyTemplateDraft(e.target.value as OutreachEmailTemplate)}
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
          {(!schedule ||
            schedule.status === 'draft' ||
            schedule.status === 'paused' ||
            schedule.status === 'completed') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleArm()}
              className="btn-brutal-teal text-sm min-h-[44px] px-4 inline-flex items-center gap-2"
            >
              <Play size={16} /> {schedule?.status === 'completed' ? 'Re-arm (auto-send)' : 'Arm (auto-send)'}
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
          {schedule && schedule.status !== 'cancelled' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCancel()}
              className="btn-brutal-outline text-sm min-h-[44px] px-4 inline-flex items-center gap-2 text-accent"
            >
              <XCircle size={16} /> Cancel
            </button>
          )}
          {scheduleId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDelete()}
              className="btn-brutal-outline text-sm min-h-[44px] px-4 inline-flex items-center gap-2 text-accent"
            >
              <Trash2 size={16} /> Delete schedule
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
          Adding contacts stages a <strong>Scheduled (held)</strong> email in the Email queue. At the NZ send
          time those become <strong>Pending</strong>, then <strong>Sent</strong> when delivered. Skips no email,
          suppressed, already on this roster, or (for segment add) recently emailed this template. Add more
          contacts anytime for later days — the campaign stays open until the end date.
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
              <div className="border-b-2 border-ink-200 dark:border-border p-3 flex flex-wrap items-center gap-2 bg-ink-50 dark:bg-muted">
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
                    void (async () => {
                      setBusy(true);
                      clearNotices();
                      try {
                        const id = await ensureScheduleSaved();
                        const result = await addScheduleRecipientsByIds(
                          id,
                          searchHits.map((h) => h.id),
                        );
                        applyAddOutcome(result, { emptyHint: 'Nothing added from results.' });
                        if (result.added > 0) setSearchSelected(new Set());
                        bumpRoster();
                        await refreshSummary(id);
                        void load('soft', id);
                      } catch (e) {
                        setNoticeIsError(true);
                        setSkipDetails([]);
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
                <span className="font-mono text-2xs text-ink-500">
                  Or use Add on a row. Tick boxes then Add selected.
                </span>
              </div>
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
            <Trash2 size={14} /> Remove selected held ({selectedOrgIds.size})
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
                    <td className="p-3">
                      <div className="font-mono text-2xs">{RECIPIENT_STATUS_LABEL[row.status]}</div>
                      {row.status === 'skipped' && row.skip_reason && (
                        <p className="mt-1 text-2xs text-ink-600 dark:text-muted-foreground max-w-xs">
                          {row.skip_reason}
                        </p>
                      )}
                    </td>
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
