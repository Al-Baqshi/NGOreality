import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { captureEmptyMutation, captureError } from '../lib/errorReporting';
import type { PortalNotification, PortalNotificationAudience } from '../types';

export function usePortalNotifications(audience: PortalNotificationAudience, limit = 80) {
  const [items, setItems] = useState<PortalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: qError } = await supabase
      .from('portal_notifications')
      .select('*, organizations(name)')
      .eq('audience', audience)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (qError) {
      setError(captureError(qError, { where: 'usePortalNotifications' }));
    } else {
      setItems((data ?? []) as PortalNotification[]);
    }
    setLoading(false);
  }, [audience, limit]);

  useEffect(() => {
    refetch();

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`portal_notifications_${audience}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'portal_notifications',
          filter: `audience=eq.${audience}`,
        },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch, audience]);

  const unreadCount = items.filter((n) => !n.read_at).length;

  const markRead = async (id: string): Promise<string | null> => {
    const { data, error: uError } = await supabase
      .from('portal_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .is('read_at', null)
      .select('id');

    if (uError) return captureError(uError, { where: 'usePortalNotifications.markRead' });
    if (!data?.length) {
      return captureEmptyMutation('usePortalNotifications.markRead.empty', 'That notification could not be marked read.');
    }
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    return null;
  };

  const markAllRead = async (): Promise<string | null> => {
    const unreadIds = items.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return null;

    const { data, error: uError } = await supabase
      .from('portal_notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds)
      .is('read_at', null)
      .select('id');

    if (uError) return captureError(uError, { where: 'usePortalNotifications.markAllRead' });
    if (!data?.length) {
      return captureEmptyMutation(
        'usePortalNotifications.markAllRead.empty',
        'Notifications could not be marked read. Refresh and try again.',
      );
    }
    await refetch();
    return null;
  };

  return {
    items,
    loading,
    error,
    unreadCount,
    refetch,
    markRead,
    markAllRead,
  };
}
