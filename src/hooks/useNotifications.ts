import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
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

    const { data, error: qError } = await supabase
      .from('notification_events')
      .select('*, organizations(name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (qError) {
      setError(qError.message);
    } else {
      setEvents((data ?? []) as NotificationEvent[]);
    }

    if (isMonitorApiConfigured()) {
      const apiSum = await fetchNotificationSummary();
      if (apiSum) setSummary(apiSum);
    } else {
      const pending = (data ?? []).filter((e) => e.status === 'pending').length;
      const sent = (data ?? []).filter((e) => e.status === 'sent').length;
      const failed = (data ?? []).filter((e) => e.status === 'failed').length;
      setSummary({ pending, sent, failed });
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
