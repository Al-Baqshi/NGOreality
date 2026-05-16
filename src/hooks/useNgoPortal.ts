import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type {
  BadgeRequest,
  Organization,
  OrganizationMember,
  OrganizationMembership,
  VerificationBadge,
} from '../types';

export function useNgoPortal() {
  const { user } = useAuth();
  const [member, setMember] = useState<OrganizationMember | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [badges, setBadges] = useState<VerificationBadge[]>([]);
  const [badgeRequests, setBadgeRequests] = useState<BadgeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPortal = useCallback(async () => {
    if (!user) {
      setMember(null);
      setOrganization(null);
      setMemberships([]);
      setBadges([]);
      setBadgeRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data: memberRow, error: memberError } = await supabase
      .from('organization_members')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    if (!memberRow) {
      setMember(null);
      setOrganization(null);
      setLoading(false);
      return;
    }

    setMember(memberRow);

    const orgId = memberRow.organization_id;
    const [orgRes, membershipsRes, badgesRes, requestsRes] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
      supabase
        .from('organization_memberships')
        .select('*')
        .eq('organization_id', orgId)
        .order('expires_at', { ascending: false }),
      supabase
        .from('verification_badges')
        .select('*')
        .eq('organization_id', orgId)
        .order('issued_at', { ascending: false }),
      supabase
        .from('badge_requests')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false }),
    ]);

    if (orgRes.error) setError(orgRes.error.message);
    else setOrganization(orgRes.data);

    if (!membershipsRes.error && membershipsRes.data) setMemberships(membershipsRes.data);
    if (!badgesRes.error && badgesRes.data) setBadges(badgesRes.data);
    if (!requestsRes.error && requestsRes.data) setBadgeRequests(requestsRes.data);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchPortal();
  }, [fetchPortal]);

  const submitBadgeRequest = async (
    requestType: BadgeRequest['request_type'],
    notes: string,
  ): Promise<string | null> => {
    if (!user || !organization) return 'Not signed in';

    const { error: insertError } = await supabase.from('badge_requests').insert({
      organization_id: organization.id,
      requested_by: user.id,
      request_type: requestType,
      notes,
    });

    if (insertError) return insertError.message;

    if (requestType === 'renewal') {
      await supabase
        .from('organization_memberships')
        .update({ status: 'pending_renewal' })
        .eq('organization_id', organization.id)
        .eq('status', 'active');
    }

    await fetchPortal();
    return null;
  };

  return {
    member,
    organization,
    memberships,
    badges,
    badgeRequests,
    loading,
    error,
    refetch: fetchPortal,
    submitBadgeRequest,
    hasOrganization: Boolean(organization),
  };
}
