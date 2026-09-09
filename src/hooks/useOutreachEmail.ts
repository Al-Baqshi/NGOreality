import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { captureError } from '../lib/errorReporting';
import { OUTREACH_EMAIL_TEMPLATES } from '../types';

export type OrgEmailStatus = {
  organizationId: string;
  template: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'suppressed' | 'held';
  sentAt: string | null;
  createdAt: string;
  errorMessage: string | null;
};

/** Latest outreach email per org (for kanban badges). */
export function useOutreachEmailStatus(organizationIds: string[]) {
  const [byOrgId, setByOrgId] = useState<Record<string, OrgEmailStatus>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = organizationIds.slice().sort().join(',');

  const refetch = useCallback(async () => {
    if (!organizationIds.length) {
      setByOrgId({});
      setError(null);
      return;
    }
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('notification_events')
      .select('organization_id, template, status, sent_at, created_at, error_message')
      .in('organization_id', organizationIds)
      .in('template', OUTREACH_EMAIL_TEMPLATES)
      .order('created_at', { ascending: false })
      .limit(500);

    if (queryError) {
      setError(captureError(queryError, { where: 'useOutreachEmailStatus' }));
    } else {
      const map: Record<string, OrgEmailStatus> = {};
      for (const row of data ?? []) {
        if (map[row.organization_id]) continue;
        map[row.organization_id] = {
          organizationId: row.organization_id,
          template: row.template,
          status: row.status as OrgEmailStatus['status'],
          sentAt: row.sent_at,
          createdAt: row.created_at,
          errorMessage: row.error_message?.trim() || null,
        };
      }
      setByOrgId(map);
      setError(null);
    }
    setLoading(false);
  }, [key]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { byOrgId, loading, error, refetch };
}

/** Outreach rows that failed at send time (Resend / worker error). */
export function useOutreachFailedCount() {
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const { count: n, error: queryError } = await supabase
      .from('notification_events')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .in('template', OUTREACH_EMAIL_TEMPLATES);
    if (queryError) {
      setError(captureError(queryError, { where: 'useOutreachFailedCount' }));
    } else {
      setCount(n ?? 0);
      setError(null);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { count, error, refetch };
}
