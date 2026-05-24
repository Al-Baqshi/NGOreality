import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchNotificationSummaryFromDb } from '../lib/notificationSummary';
import { fetchNotificationSummary, flushPendingNotifications, isMonitorApiConfigured } from '../lib/monitorApi';
import type { NotificationEvent } from '../types';

export function useNotifications(limit = 100) {
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({ pending: 0, sent: 0, failed: 0 });
  const [flushing, setFlushing] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [recentRes, failedRes] = await Promise.all([
      supabase
        .from('notification_events')
        .select('*, organizations(name)')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('notification_events')
        .select('*, organizations(name)')
        .eq('status', 'failed')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    const qError = recentRes.error ?? failedRes.error;
    const data = recentRes.data;

    if (qError) {
      setError(qError.message);
    } else {
      const merged = new Map<string, NotificationEvent>();
      for (const row of failedRes.data ?? []) merged.set(row.id, row as NotificationEvent);
      for (const row of data ?? []) merged.set(row.id, row as NotificationEvent);
      const list = [...merged.values()].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setEvents(list);
    }

    try {
      if (isMonitorApiConfigured()) {
        const apiSum = await fetchNotificationSummary();
        if (apiSum) setSummary(apiSum);
        else setSummary(await fetchNotificationSummaryFromDb());
      } else {
        setSummary(await fetchNotificationSummaryFromDb());
      }
    } catch {
      const rows = data ?? [];
      setSummary({
        pending: rows.filter((e) => e.status === 'pending').length,
        sent: rows.filter((e) => e.status === 'sent').length,
        failed: rows.filter((e) => e.status === 'failed').length,
      });
    }

    setLoading(false);
  }, [limit]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const flushNow = async (): Promise<string | null> => {
    if (!isMonitorApiConfigured()) {
      return 'Set VITE_MONITOR_API_URL and VITE_MONITOR_API_KEY to send from CRM (or wait for the worker).';
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

  return {
    events,
    loading,
    error,
    summary,
    flushing,
    refetch,
    flushNow,
    requeue,
    apiConfigured: isMonitorApiConfigured(),
  };
}
