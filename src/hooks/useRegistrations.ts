import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { captureError } from '../lib/errorReporting';
import type { BadgeRequest, NgoSetupRequest, Organization } from '../types';

/**
 * Everything the Registrations screen needs in one fetch: who signed up
 * through the portal (registry claim vs new submission), and the requests
 * still waiting on a staff decision.
 */

export type SignupOrg = Pick<
  Organization,
  | 'id'
  | 'name'
  | 'status'
  | 'verification_level'
  | 'source_registry'
  | 'charity_registration_number'
  | 'claimed_at'
  | 'category'
  | 'location'
  | 'website_url'
  | 'is_customer'
>;

type RequestOrgSummary = {
  name: string;
  source_registry: string;
  charity_registration_number: string;
} | null;

export type BadgeRequestRow = BadgeRequest & { organizations: RequestOrgSummary };
export type SetupRequestRow = NgoSetupRequest & { organizations: RequestOrgSummary };

const SIGNUP_COLUMNS =
  'id, name, status, verification_level, source_registry, charity_registration_number, claimed_at, category, location, website_url, is_customer';

export function useRegistrations() {
  const [signups, setSignups] = useState<SignupOrg[]>([]);
  const [signupCounts, setSignupCounts] = useState({ total: 0, fromRegistry: 0, newSubmissions: 0 });
  const [badgeRequests, setBadgeRequests] = useState<BadgeRequestRow[]>([]);
  const [setupRequests, setSetupRequests] = useState<SetupRequestRow[]>([]);
  const [signupsError, setSignupsError] = useState<string | null>(null);
  const [badgeRequestsError, setBadgeRequestsError] = useState<string | null>(null);
  const [setupRequestsError, setSetupRequestsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [orgs, totalCount, registryCount, badge, setup] = await Promise.all([
      supabase
        .from('organizations')
        .select(SIGNUP_COLUMNS)
        .not('claimed_at', 'is', null)
        .order('claimed_at', { ascending: false })
        .limit(50),
      supabase
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .not('claimed_at', 'is', null),
      supabase
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .not('claimed_at', 'is', null)
        .neq('source_registry', ''),
      supabase
        .from('badge_requests')
        .select('*, organizations(name, source_registry, charity_registration_number)')
        .in('status', ['pending', 'in_review'])
        .order('created_at', { ascending: true })
        .limit(50),
      supabase
        .from('ngo_setup_requests')
        .select('*, organizations(name, source_registry, charity_registration_number)')
        .in('status', ['pending', 'in_review'])
        .order('created_at', { ascending: true })
        .limit(50),
    ]);

    const failures: string[] = [];
    if (orgs.error) {
      const msg = captureError(orgs.error, { where: 'useRegistrations.signups' });
      failures.push(msg);
      setSignupsError(msg);
    } else {
      setSignupsError(null);
      setSignups((orgs.data ?? []) as SignupOrg[]);
    }
    if (totalCount.error) {
      failures.push(captureError(totalCount.error, { where: 'useRegistrations.totalCount' }));
    }
    if (registryCount.error) {
      failures.push(captureError(registryCount.error, { where: 'useRegistrations.registryCount' }));
    }
    if (!totalCount.error && !registryCount.error) {
      const total = totalCount.count ?? 0;
      const fromRegistry = registryCount.count ?? 0;
      setSignupCounts({ total, fromRegistry, newSubmissions: Math.max(0, total - fromRegistry) });
    }
    // PostgREST types the embedded to-one relation as an array; cast via unknown.
    if (badge.error) {
      const msg = captureError(badge.error, { where: 'useRegistrations.badgeRequests' });
      failures.push(msg);
      setBadgeRequestsError(msg);
    } else {
      setBadgeRequestsError(null);
      setBadgeRequests((badge.data ?? []) as unknown as BadgeRequestRow[]);
    }
    if (setup.error) {
      const msg = captureError(setup.error, { where: 'useRegistrations.setupRequests' });
      failures.push(msg);
      setSetupRequestsError(msg);
    } else {
      setSetupRequestsError(null);
      setSetupRequests((setup.data ?? []) as unknown as SetupRequestRow[]);
    }
    setError(failures.length ? failures.join(' · ') : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    signups,
    signupCounts,
    badgeRequests,
    setupRequests,
    signupsError,
    badgeRequestsError,
    setupRequestsError,
    loading,
    error,
    refetch,
  };
}
