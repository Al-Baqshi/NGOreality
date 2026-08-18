import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useCrmDashboardStats } from './useCrm';
import type { CrmNavCountKey } from '../components/crm/crm-nav';

export type CrmNavCounts = Record<CrmNavCountKey, number>;

const ZERO: CrmNavCounts = {
  workQueue: 0,
  registrations: 0,
  inquiries: 0,
  outreachDue: 0,
  incidents: 0,
  unreconciled: 0,
};

/**
 * Counts for the sidebar pills.
 *
 * Most of this already comes back from crm_dashboard_stats, which the dashboard
 * calls anyway — so on the dashboard this is free, and elsewhere it is one RPC.
 * Only the two things that RPC does not count (new inquiries, unreconciled
 * payments) need their own queries, and both are HEAD counts that transfer no
 * rows.
 */
export function useCrmNavCounts(): CrmNavCounts {
  const { stats } = useCrmDashboardStats();
  const [extra, setExtra] = useState({ inquiries: 0, unreconciled: 0 });

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      supabase
        .from('inquiry_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new'),
      supabase
        .from('organization_payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ]).then(([inquiries, payments]) => {
      if (cancelled) return;
      setExtra({
        inquiries: inquiries.count ?? 0,
        unreconciled: payments.count ?? 0,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!stats) return { ...ZERO, ...extra };

  const registrations =
    (stats.badge_requests_pending ?? 0) + (stats.ngo_setup_requests_pending ?? 0);

  return {
    // Everything the work queue actually lists, so the pill matches the page.
    workQueue:
      (stats.follow_ups_due ?? 0) +
      (stats.tasks_due_today ?? 0) +
      registrations +
      (stats.incidents_open ?? 0),
    registrations,
    outreachDue: stats.outreach_due ?? 0,
    incidents: stats.incidents_open ?? 0,
    inquiries: extra.inquiries,
    unreconciled: extra.unreconciled,
  };
}
