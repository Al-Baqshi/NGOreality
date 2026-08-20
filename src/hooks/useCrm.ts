import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { captureError } from '../lib/errorReporting';
import type {
  Organization,
  OrganizationPayment,
  OrgStatus,
  OutreachStatus,
  ServiceEngagement,
  StaffTask,
  VerificationBadge,
  BadgeRequest,
  NgoSetupRequest,
} from '../types';

export interface CrmDashboardStats {
  total: number;
  listed: number;
  verified: number;
  pending: number;
  outreach_due: number;
  listed_with_website: number;
  listed_without_website: number;
  nz_registry: number;
  badges_active: number;
  badges_expiring_30d: number;
  badges_expired: number;
  badge_requests_pending: number;
  ngo_setup_requests_pending: number;
  monitors_total: number;
  monitors_up: number;
  monitors_down: number;
  incidents_open: number;
  engagements_active: number;
  engagements_lead: number;
  follow_ups_due: number;
  tasks_due_today: number;
  pipeline: Record<string, number>;
  outreach_pipeline: Record<string, number>;
}

const EMPTY_STATS: CrmDashboardStats = {
  total: 0,
  listed: 0,
  verified: 0,
  pending: 0,
  outreach_due: 0,
  listed_with_website: 0,
  listed_without_website: 0,
  nz_registry: 0,
  badges_active: 0,
  badges_expiring_30d: 0,
  badges_expired: 0,
  badge_requests_pending: 0,
  ngo_setup_requests_pending: 0,
  monitors_total: 0,
  monitors_up: 0,
  monitors_down: 0,
  incidents_open: 0,
  engagements_active: 0,
  engagements_lead: 0,
  follow_ups_due: 0,
  tasks_due_today: 0,
  pipeline: {},
  outreach_pipeline: {},
};

export function useCrmDashboardStats() {
  const [stats, setStats] = useState<CrmDashboardStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('crm_dashboard_stats');
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    if (data && typeof data === 'object') {
      setStats({ ...EMPTY_STATS, ...(data as CrmDashboardStats) });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const websitePct =
    stats.listed > 0
      ? Math.round((stats.listed_with_website / stats.listed) * 100)
      : 0;

  const monitorPct =
    stats.monitors_total > 0
      ? Math.round((stats.monitors_up / stats.monitors_total) * 100)
      : 0;

  return { stats, loading, error, refetch, websitePct, monitorPct };
}

export type OrganizationsPageFilters = {
  status?: OrgStatus | 'all';
  outreach?: OutreachStatus | 'all';
  outreachIn?: OutreachStatus[];
  hasWebsite?: 'all' | 'yes' | 'no';
  search?: string;
  country?: string;
  category?: string;
  sortBy?: string;
  leadsOnly?: boolean;
  isCustomer?: boolean;
  inboundOnly?: boolean;
};

const DEFAULT_PAGE_SIZE = 50;

export function useOrganizationsPage(
  filters: OrganizationsPageFilters,
  page: number,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('organizations')
      .select('*', { count: 'exact' });

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters.leadsOnly) {
      query = query
        .eq('status', 'listed')
        .eq('is_customer', false)
        .in('outreach_status', [
          'not_contacted',
          'cold_email',
          'no_website',
          'website_issues',
          'contacted',
          'follow_up',
          'declined',
        ]);
    }
    if (filters.isCustomer === true) {
      query = query.eq('is_customer', true);
    } else if (filters.isCustomer === false) {
      query = query.eq('is_customer', false);
    }
    if (filters.inboundOnly) {
      query = query.eq('status', 'listed').eq('is_customer', false).in('outreach_status', ['registered', 'responded']);
    }
    if (filters.outreachIn?.length) {
      query = query.in('outreach_status', filters.outreachIn);
    } else if (filters.outreach && filters.outreach !== 'all') {
      query = query.eq('outreach_status', filters.outreach);
    }
    if (filters.country) {
      query = query.eq('country', filters.country);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.hasWebsite === 'yes') {
      query = query.not('website_url', 'eq', '').not('website_url', 'is', null);
    } else if (filters.hasWebsite === 'no') {
      query = query.or('website_url.is.null,website_url.eq.""');
    }
    const term = filters.search?.trim();
    if (term) {
      const safe = term.replace(/[%_,]/g, ' ').trim();
      if (safe) query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%`);
    }

    if (filters.sortBy === '-name') {
      query = query.order('name', { ascending: false });
    } else if (filters.sortBy === 'last_outreach') {
      query = query.order('last_outreach_at', { ascending: true, nullsFirst: true });
    } else if (filters.sortBy === 'created') {
      query = query.order('created_at', { ascending: false });
    } else {
      query = query.order('name', { ascending: true });
    }

    const { data, error, count } = await query.range(from, to);
    if (error) captureError(error, { where: 'useOrganizationsPage' });
    else if (data) {
      setOrganizations(data);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [
    filters.status,
    filters.outreach,
    filters.outreachIn,
    filters.hasWebsite,
    filters.search,
    filters.country,
    filters.category,
    filters.sortBy,
    filters.leadsOnly,
    filters.isCustomer,
    filters.inboundOnly,
    page,
    pageSize,
  ]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    organizations,
    totalCount,
    totalPages,
    pageSize,
    loading,
    refetch: fetchPage,
  };
}

export function useServiceEngagements(organizationId: string | undefined) {
  const [engagements, setEngagements] = useState<ServiceEngagement[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('service_engagements')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) captureError(error, { where: 'useServiceEngagements' });
    else if (data) setEngagements(data);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { engagements, loading, refetch };
}

export function useStaffTasks(organizationId: string | undefined) {
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('staff_tasks')
      .select('*')
      .eq('organization_id', organizationId)
      .order('due_date', { ascending: true });
    if (error) captureError(error, { where: 'useStaffTasks' });
    else if (data) setTasks(data);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { tasks, loading, refetch };
}

export type WebsiteIncidentRow = {
  id: string;
  organization_id: string;
  opened_at: string;
  closed_at: string | null;
  error_message: string;
  organizations: { name: string; website_url: string } | null;
};

export function useWorkQueue() {
  const [followUps, setFollowUps] = useState<(ServiceEngagement & { organizations: { name: string } })[]>([]);
  const [tasks, setTasks] = useState<(StaffTask & { organizations: { name: string } })[]>([]);
  const [badgeRequests, setBadgeRequests] = useState<(BadgeRequest & { organizations: { name: string } })[]>([]);
  const [setupRequests, setSetupRequests] = useState<(NgoSetupRequest & { organizations: { name: string } })[]>([]);
  const [incidents, setIncidents] = useState<WebsiteIncidentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);

    const [fu, tk, br, setup, inc] = await Promise.all([
      supabase
        .from('service_engagements')
        .select('*, organizations(name)')
        .in('status', ['lead', 'active'])
        .not('next_follow_up_at', 'is', null)
        .lte('next_follow_up_at', `${today}T23:59:59.999Z`)
        .order('next_follow_up_at', { ascending: true })
        .limit(25),
      supabase
        .from('staff_tasks')
        .select('*, organizations(name)')
        .eq('status', 'open')
        .lte('due_date', today)
        .order('due_date', { ascending: true })
        .limit(25),
      supabase
        .from('badge_requests')
        .select('*, organizations(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(15),
      supabase
        .from('ngo_setup_requests')
        .select('*, organizations(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(15),
      supabase
        .from('website_incidents')
        .select('id, organization_id, opened_at, closed_at, error_message, organizations(name, website_url)')
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(20),
    ]);

    if (!fu.error && fu.data) setFollowUps(fu.data as typeof followUps);
    if (!tk.error && tk.data) setTasks(tk.data as typeof tasks);
    if (!br.error && br.data) setBadgeRequests(br.data as typeof badgeRequests);
    if (!setup.error && setup.data) setSetupRequests(setup.data as typeof setupRequests);
    // PostgREST types the embedded `organizations` relation as an array even
    // for a to-one join, so the cast has to go via `unknown`.
    if (!inc.error && inc.data) setIncidents(inc.data as unknown as WebsiteIncidentRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { followUps, tasks, badgeRequests, setupRequests, incidents, loading, refetch };
}

export function useExpiringBadges(mode: 'expiring' | 'expired') {
  const [rows, setRows] = useState<(VerificationBadge & { organizations: { name: string; id: string } })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const now = new Date().toISOString();
    const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('verification_badges')
      .select('*, organizations(name, id)')
      .eq('is_active', true)
      .not('expires_at', 'is', null)
      .order('expires_at', { ascending: true })
      .limit(100);

    if (mode === 'expired') {
      query = query.lt('expires_at', now);
    } else {
      query = query.gt('expires_at', now).lte('expires_at', in30);
    }

    query.then(({ data, error }) => {
      if (error) captureError(error, { where: 'useExpiringBadges' });
      else if (data) setRows(data as typeof rows);
      setLoading(false);
    });
  }, [mode]);

  return { rows, loading };
}

export function useOrganizationPayments(organizationId: string | undefined) {
  const [payments, setPayments] = useState<OrganizationPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('organization_payments')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) captureError(error, { where: 'useOrganizationPayments' });
    else if (data) setPayments(data);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { payments, loading, refetch };
}

export function usePaymentsLedger(limit = 100) {
  const [payments, setPayments] = useState<
    (OrganizationPayment & { organizations: { name: string; payment_reference: string | null } })[]
  >([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organization_payments')
      .select('*, organizations(name, payment_reference)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) captureError(error, { where: 'usePaymentsLedger' });
    else if (data) setPayments(data as typeof payments);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { payments, loading, refetch };
}

export async function findRegistryDuplicate(
  sourceRegistry: string,
  externalId: string,
): Promise<Organization | null> {
  if (!sourceRegistry.trim() || !externalId.trim()) return null;
  const { data } = await supabase
    .from('organizations')
    .select('*')
    .eq('source_registry', sourceRegistry.trim())
    .eq('external_id', externalId.trim())
    .maybeSingle();
  return data;
}
