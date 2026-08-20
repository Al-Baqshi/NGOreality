import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchNotificationSummaryFromDb } from '../lib/notificationSummary';
import { fetchNotificationSummary, flushPendingNotifications, isMonitorApiConfigured } from '../lib/monitorApi';
import type { NotificationEvent, NotificationStatus } from '../types';

export const NOTIFICATION_PAGE_SIZE = 50;

export function useNotifications(options?: {
  pageSize?: number;
  page?: number;
  status?: NotificationStatus | 'all';
}) {
  const pageSize = options?.pageSize ?? NOTIFICATION_PAGE_SIZE;
  const page = options?.page ?? 1;
  const status = options?.status ?? 'all';

  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({ pending: 0, sent: 0, failed: 0, skipped: 0, suppressed: 0 });
  const [flushing, setFlushing] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('notification_events')
      .select('*, organizations(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error: qError, count } = await query;

    if (qError) {
      setError(qError.message);
      setEvents([]);
      setTotal(0);
    } else {
      setEvents((data ?? []) as NotificationEvent[]);
      setTotal(count ?? 0);
    }

    try {
      if (isMonitorApiConfigured()) {
        const apiSum = await fetchNotificationSummary();
        const dbSum = await fetchNotificationSummaryFromDb();
        if (apiSum) setSummary({ ...apiSum, skipped: dbSum.skipped, suppressed: dbSum.suppressed });
        else setSummary(dbSum);
      } else {
        setSummary(await fetchNotificationSummaryFromDb());
      }
    } catch {
      /* keep previous summary */
    }

    setLoading(false);
  }, [page, pageSize, status]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const flushNow = async (): Promise<string | null> => {
    if (!isMonitorApiConfigured()) {
      return 'Set VITE_MONITOR_API_URL and VITE_MONITOR_API_KEY to send from CRM (or wait for the worker / cron).';
    }
    setFlushing(true);
    try {
      await flushPendingNotifications();
      await refetch();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Flush failed';
    } finally {
      setFlushing(false);
    }
  };

  const requeue = async (id: string): Promise<string | null> => {
    const { error: uError } = await supabase
      .from('notification_events')
      .update({ status: 'pending', error_message: '', sent_at: null })
      .eq('id', id)
      .eq('status', 'failed');

    if (uError) return uError.message;
    await refetch();
    return null;
  };

  const removeFromQueue = async (id: string): Promise<string | null> => {
    const { error: uError } = await supabase
      .from('notification_events')
      .update({
        status: 'skipped',
        error_message: 'Removed from queue by staff',
        sent_at: null,
      })
      .eq('id', id)
      .eq('status', 'pending');

    if (uError) return uError.message;
    await refetch();
    return null;
  };

  const restoreToQueue = async (id: string): Promise<string | null> => {
    const { error: uError } = await supabase
      .from('notification_events')
      .update({
        status: 'pending',
        error_message: '',
        sent_at: null,
        claimed_at: null,
      })
      .eq('id', id)
      .eq('status', 'skipped');

    if (uError) return uError.message;
    await refetch();
    return null;
  };

  type SuppressionInfo = { reason: string; detail: string; suppressed_at: string };

  const getSuppressionInfo = async (email: string): Promise<SuppressionInfo | null> => {
    const { data, error: rpcError } = await supabase.rpc('email_suppression_info', { p_email: email });
    if (rpcError) return null;
    const row = (Array.isArray(data) ? data[0] : data) as SuppressionInfo | undefined;
    return row?.reason ? row : null;
  };

  const allowEmailAgain = async (
    email: string,
    eventId?: string,
    requeue = false,
  ): Promise<string | null> => {
    const { error: rpcError } = await supabase.rpc('unsuppress_email', { p_email: email });
    if (rpcError) return rpcError.message;

    if (eventId) {
      const { error: uError } = await supabase
        .from('notification_events')
        .update(
          requeue
            ? { status: 'pending', error_message: '', sent_at: null, claimed_at: null }
            : {
                status: 'skipped',
                error_message: 'Address allowed again — send was not requeued',
                sent_at: null,
                claimed_at: null,
              },
        )
        .eq('id', eventId)
        .eq('status', 'suppressed');
      if (uError) return uError.message;
    }

    await refetch();
    return null;
  };

  return {
    events,
    total,
    page,
    pageSize,
    loading,
    error,
    summary,
    flushing,
    refetch,
    flushNow,
    requeue,
    removeFromQueue,
    restoreToQueue,
    getSuppressionInfo,
    allowEmailAgain,
    apiConfigured: isMonitorApiConfigured(),
  };
}
