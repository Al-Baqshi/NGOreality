import { supabase } from './supabase';

export type NotificationSummaryCounts = {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
};

const SUMMARY_SINCE_DAYS = 30;

function sinceIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - SUMMARY_SINCE_DAYS);
  return d.toISOString();
}

async function countStatus(status: string): Promise<number> {
  const since = sinceIso();
  const { count, error } = await supabase
    .from('notification_events')
    .select('*', { count: 'exact', head: true })
    .eq('status', status)
    .gte('created_at', since);
  if (error) throw error;
  return count ?? 0;
}

/** Queue counts for the last 30 days (matches Go API summary). */
export async function fetchNotificationSummaryFromDb(): Promise<NotificationSummaryCounts> {
  const [pending, sent, failed, skipped] = await Promise.all([
    countStatus('pending'),
    countStatus('sent'),
    countStatus('failed'),
    countStatus('skipped'),
  ]);
  return { pending, sent, failed, skipped };
}
