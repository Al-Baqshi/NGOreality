import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { captureError } from '../lib/errorReporting';
import type { OutreachEmailTemplate, OutreachStatus } from '../types';
import type { OutreachSegment } from './useOutreachWorklist';

export type OutreachScheduleStatus = 'draft' | 'armed' | 'paused' | 'completed' | 'cancelled';

export type OutreachSchedule = {
  id: string;
  name: string;
  send_time: string;
  timezone: string;
  starts_on: string;
  ends_on: string;
  daily_cap: number;
  template: OutreachEmailTemplate;
  subject: string | null;
  body: string | null;
  site_url: string;
  segment: string;
  outreach_status: string | null;
  status: OutreachScheduleStatus;
  last_run_on: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleRecipientStatus = 'queued' | 'released' | 'sent' | 'skipped' | 'cancelled';

export type ScheduleRecipient = {
  id: string;
  schedule_id: string;
  organization_id: string;
  sort_order: number;
  status: ScheduleRecipientStatus;
  notification_event_id: string | null;
  created_at: string;
  released_at: string | null;
  organizations?: { name: string; email: string | null; slug: string | null } | null;
};

export type ScheduleSummary = {
  schedule_id: string;
  status: OutreachScheduleStatus;
  today_nz: string;
  day_index: number;
  total_days: number;
  queued: number;
  released: number;
  released_today: number;
  skipped: number;
  last_run_on: string | null;
  next_send_preview: string | null;
};

export type AddRecipientSkip = {
  organization_id: string;
  name: string;
  reason: 'no_email' | 'suppressed' | 'on_roster' | 'already_emailed' | string;
  detail: string;
};

export type AddRecipientsResult = {
  added: number;
  skipped_no_email: number;
  skipped_suppressed: number;
  skipped_dedupe: number;
  skipped_on_roster: number;
  cap: number;
  skips?: AddRecipientSkip[];
  skips_truncated?: boolean;
};

function siteBaseUrl(): string {
  return (
    (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ||
    'https://www.ngoreality.com'
  );
}

/** NZ calendar date YYYY-MM-DD for date inputs. */
export function nzTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export async function listOutreachSchedules(): Promise<OutreachSchedule[]> {
  const { data, error } = await supabase
    .from('outreach_schedules')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as OutreachSchedule[];
}

export async function upsertOutreachSchedule(input: {
  id?: string | null;
  name?: string;
  sendTime: string;
  startsOn: string;
  endsOn: string;
  dailyCap: number;
  template: OutreachEmailTemplate;
  subject?: string;
  body?: string;
  segment?: OutreachSegment;
  outreachStatus?: OutreachStatus | '';
}): Promise<OutreachSchedule> {
  const { data, error } = await supabase.rpc('outreach_schedule_upsert', {
    p_id: input.id ?? null,
    p_name: input.name ?? 'Outreach schedule',
    p_send_time: input.sendTime.length === 5 ? `${input.sendTime}:00` : input.sendTime,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
    p_daily_cap: input.dailyCap,
    p_template: input.template,
    p_subject: input.subject ?? null,
    p_body: input.body ?? null,
    p_site_url: siteBaseUrl(),
    p_segment: input.segment ?? 'all',
    p_outreach_status: input.outreachStatus || null,
  });
  if (error) throw new Error(error.message);
  return data as OutreachSchedule;
}

export async function setOutreachScheduleStatus(
  scheduleId: string,
  status: 'draft' | 'armed' | 'paused' | 'cancelled',
): Promise<OutreachSchedule> {
  const { data, error } = await supabase.rpc('outreach_schedule_set_status', {
    p_schedule_id: scheduleId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
  return data as OutreachSchedule;
}

export async function addScheduleRecipientsByFilter(
  scheduleId: string,
  options: {
    segment: OutreachSegment;
    outreach?: OutreachStatus | '';
    max: number;
  },
): Promise<AddRecipientsResult> {
  const { data, error } = await supabase.rpc('outreach_schedule_add_recipients', {
    p_schedule_id: scheduleId,
    p_ids: null,
    p_segment: options.segment,
    p_outreach: options.outreach || null,
    p_q: null,
    p_exclude: [],
    p_max: options.max,
    p_dedupe_days: 365,
  });
  if (error) throw new Error(error.message);
  return data as AddRecipientsResult;
}

export async function addScheduleRecipientsByIds(
  scheduleId: string,
  ids: string[],
  options?: { dedupeDays?: number },
): Promise<AddRecipientsResult> {
  if (!ids.length) {
    return {
      added: 0,
      skipped_no_email: 0,
      skipped_suppressed: 0,
      skipped_dedupe: 0,
      skipped_on_roster: 0,
      cap: 0,
      skips: [],
      skips_truncated: false,
    };
  }
  const { data, error } = await supabase.rpc('outreach_schedule_add_recipients', {
    p_schedule_id: scheduleId,
    p_ids: ids,
    p_segment: null,
    p_outreach: null,
    p_q: null,
    p_exclude: [],
    p_max: ids.length,
    // Explicit picks: staff chose these orgs — do not block on prior outreach
    // (segment bulk still uses the long dedupe window).
    p_dedupe_days: options?.dedupeDays ?? 0,
  });
  if (error) throw new Error(error.message);
  return data as AddRecipientsResult;
}

export async function removeScheduleRecipients(
  scheduleId: string,
  organizationIds: string[],
): Promise<{ removed: number }> {
  const { data, error } = await supabase.rpc('outreach_schedule_remove_recipients', {
    p_schedule_id: scheduleId,
    p_ids: organizationIds,
  });
  if (error) throw new Error(error.message);
  return data as { removed: number };
}

export async function fetchScheduleSummary(scheduleId: string): Promise<ScheduleSummary> {
  const { data, error } = await supabase.rpc('outreach_schedule_summary', {
    p_schedule_id: scheduleId,
  });
  if (error) throw new Error(error.message);
  return data as ScheduleSummary;
}

export async function runDueSchedulesNow(): Promise<{
  schedules_run: number;
  released: number;
  completed_expired: number;
}> {
  const { data, error } = await supabase.rpc('outreach_run_due_schedules_staff');
  if (error) throw new Error(error.message);
  return data as { schedules_run: number; released: number; completed_expired: number };
}

export const SCHEDULE_ROSTER_PAGE_SIZE = 50;

export function useScheduleRecipients(scheduleId: string | null, page: number, refreshKey = 0) {
  const [rows, setRows] = useState<ScheduleRecipient[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!scheduleId) {
      setRows([]);
      setTotal(0);
      setError(null);
      return;
    }
    setLoading(true);
    const from = (page - 1) * SCHEDULE_ROSTER_PAGE_SIZE;
    const to = from + SCHEDULE_ROSTER_PAGE_SIZE - 1;
    const { data, error: qError, count } = await supabase
      .from('outreach_schedule_recipients')
      .select('*, organizations(name, email, slug)', { count: 'exact' })
      .eq('schedule_id', scheduleId)
      .order('sort_order', { ascending: true })
      .range(from, to);

    if (qError) {
      setError(captureError(qError, { where: 'useScheduleRecipients' }));
      setRows([]);
      setTotal(0);
    } else {
      setRows((data ?? []) as ScheduleRecipient[]);
      setTotal(count ?? 0);
      setError(null);
    }
    setLoading(false);
  }, [scheduleId, page]);

  useEffect(() => {
    void refetch();
  }, [refetch, refreshKey]);

  return { rows, total, loading, error, refetch };
}
