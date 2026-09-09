import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { captureError } from '../lib/errorReporting';
import { fetchNotificationSummaryFromDb, type NotificationSummaryCounts } from '../lib/notificationSummary';
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
  const [summary, setSummary] = useState<NotificationSummaryCounts | null>(null);
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
      setError(captureError(qError, { where: 'useNotifications.list' }));
    } else {
      setEvents((data ?? []) as NotificationEvent[]);
      setTotal(count ?? 0);
    }

    try {
      const dbSum = await fetchNotificationSummaryFromDb();
      if (isMonitorApiConfigured()) {
        try {
          const apiSum = await fetchNotificationSummary();
          if (apiSum) setSummary({ ...apiSum, skipped: dbSum.skipped, suppressed: dbSum.suppressed, held: dbSum.held });
          else setSummary(dbSum);
        } catch (e) {
          captureError(e, { where: 'useNotifications.summaryApi' });
          setSummary(dbSum);
        }
      } else {
        setSummary(dbSum);
      }
    } catch (e) {
      captureError(e, { where: 'useNotifications.summary' });
      /* keep last-good counts; stay null on first failure so the UI does not show 0 */
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
      const counts = await flushPendingNotifications();
      await refetch();
      if (counts && counts.failed > 0) {
        return captureError(
          new Error(`${counts.failed} email${counts.failed === 1 ? '' : 's'} failed to send`),
          { where: 'useNotifications.flush.failed' },
        );
      }
      if (!counts) {
        return captureError(new Error('Flush returned no result'), { where: 'useNotifications.flush.empty' });
      }
      return null;
    } catch (e) {
      return captureError(e, { where: 'useNotifications.flush' });
    } finally {
      setFlushing(false);
    }
  };

  const requeue = async (id: string): Promise<string | null> => {
    const { data, error: uError } = await supabase
      .from('notification_events')
      .update({ status: 'pending', error_message: '', sent_at: null })
      .eq('id', id)
      .eq('status', 'failed')
      .select('id');

    if (uError) return captureError(uError, { where: 'useNotifications.requeue' });
    if (!data?.length) {
      return captureError(new Error('That email is no longer failed and was not requeued'), {
        where: 'useNotifications.requeue.empty',
      });
    }
    await refetch();
    return null;
  };

  const removeFromQueue = async (id: string): Promise<string | null> => {
    const { data, error: uError } = await supabase
      .from('notification_events')
      .update({
        status: 'skipped',
        error_message: 'Removed from queue by staff',
        sent_at: null,
      })
      .eq('id', id)
      .in('status', ['pending', 'held'])
      .select('id');

    if (uError) return captureError(uError, { where: 'useNotifications.removeFromQueue' });
    if (!data?.length) {
      return captureError(new Error('That email is no longer pending and was not removed'), {
        where: 'useNotifications.removeFromQueue.empty',
      });
    }
    await refetch();
    return null;
  };

  const restoreToQueue = async (id: string): Promise<string | null> => {
    const { data, error: uError } = await supabase
      .from('notification_events')
      .update({
        status: 'pending',
        error_message: '',
        sent_at: null,
        claimed_at: null,
      })
      .eq('id', id)
      .eq('status', 'skipped')
      .select('id');

    if (uError) return captureError(uError, { where: 'useNotifications.restoreToQueue' });
    if (!data?.length) {
      return captureError(new Error('That email is no longer cancelled and was not restored'), {
        where: 'useNotifications.restoreToQueue.empty',
      });
    }
    await refetch();
    return null;
  };

  type SuppressionInfo = { reason: string; detail: string; suppressed_at: string };

  const getSuppressionInfo = async (
    email: string,
  ): Promise<{ info: SuppressionInfo | null; error: string | null }> => {
    const { data, error: rpcError } = await supabase.rpc('email_suppression_info', { p_email: email });
    if (rpcError) {
      return { info: null, error: captureError(rpcError, { where: 'useNotifications.suppressionInfo' }) };
    }
    const row = (Array.isArray(data) ? data[0] : data) as SuppressionInfo | undefined;
    return { info: row?.reason ? row : null, error: null };
  };

  const allowEmailAgain = async (
    email: string,
    eventId?: string,
    requeue = false,
  ): Promise<string | null> => {
    const { error: rpcError } = await supabase.rpc('unsuppress_email', { p_email: email });
    if (rpcError) return captureError(rpcError, { where: 'useNotifications.allowEmailAgain' });

    if (eventId) {
      const { data, error: uError } = await supabase
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
        .eq('status', 'suppressed')
        .select('id');
      if (uError) return captureError(uError, { where: 'useNotifications.allowEmailAgain.event' });
      if (!data?.length) {
        await refetch();
        return captureError(
          new Error('Address allowed again, but this send was no longer suppressed and was not updated'),
          { where: 'useNotifications.allowEmailAgain.eventEmpty' },
        );
      }
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
