import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { OutreachEmailTemplate } from '../types';

export type OrgEmailStatus = {
  organizationId: string;
  template: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  sentAt: string | null;
  createdAt: string;
};

const OUTREACH_TEMPLATES: OutreachEmailTemplate[] = [
  'outreach_cold_invite',
  'outreach_no_website',
  'outreach_website_help',
];

/** Latest outreach email per org (for kanban badges). */
export function useOutreachEmailStatus(organizationIds: string[]) {
  const [byOrgId, setByOrgId] = useState<Record<string, OrgEmailStatus>>({});
  const [loading, setLoading] = useState(false);

  const key = organizationIds.slice().sort().join(',');

  const refetch = useCallback(async () => {
    if (!organizationIds.length) {
      setByOrgId({});
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('notification_events')
      .select('organization_id, template, status, sent_at, created_at')
      .in('organization_id', organizationIds)
      .in('template', OUTREACH_TEMPLATES)
      .order('created_at', { ascending: false })
      .limit(500);

    if (!error && data) {
      const map: Record<string, OrgEmailStatus> = {};
      for (const row of data) {
        if (map[row.organization_id]) continue;
        map[row.organization_id] = {
          organizationId: row.organization_id,
          template: row.template,
          status: row.status as OrgEmailStatus['status'],
          sentAt: row.sent_at,
          createdAt: row.created_at,
        };
      }
      setByOrgId(map);
    }
    setLoading(false);
  }, [key]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { byOrgId, loading, refetch };
}
