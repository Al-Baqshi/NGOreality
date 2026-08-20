import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ensurePaymentReference } from '../lib/payments';
import type {
  BadgeRequest,
  NgoSetupRequest,
  Organization,
  OrganizationMember,
  OrganizationMembership,
  VerificationBadge,
  VerificationCriterion,
} from '../types';

export function useNgoPortal() {
  const { user } = useAuth();
  const [member, setMember] = useState<OrganizationMember | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [badges, setBadges] = useState<VerificationBadge[]>([]);
  const [badgeRequests, setBadgeRequests] = useState<BadgeRequest[]>([]);
  const [setupRequests, setSetupRequests] = useState<NgoSetupRequest[]>([]);
  const [criteria, setCriteria] = useState<VerificationCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPortal = useCallback(async () => {
    if (!user) {
      setMember(null);
      setOrganization(null);
      setMemberships([]);
      setBadges([]);
      setBadgeRequests([]);
      setSetupRequests([]);
      setCriteria([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // A user can manage more than one organisation (co-management); the
    // portal shows the first one they joined.
    const { data: memberRows, error: memberError } = await supabase
      .from('organization_members')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1);
    const memberRow = memberRows?.[0] ?? null;

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
    const [orgRes, membershipsRes, badgesRes, requestsRes, setupRes, criteriaRes] = await Promise.all([
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
      supabase
        .from('ngo_setup_requests')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false }),
      supabase
        .from('verification_criteria')
        .select('*')
        .eq('organization_id', orgId),
    ]);

    if (orgRes.error) setError(orgRes.error.message);
    else setOrganization(orgRes.data);

    if (!membershipsRes.error && membershipsRes.data) setMemberships(membershipsRes.data);
    if (!badgesRes.error && badgesRes.data) setBadges(badgesRes.data);
    if (!requestsRes.error && requestsRes.data) setBadgeRequests(requestsRes.data);
    if (!setupRes.error && setupRes.data) setSetupRequests(setupRes.data as NgoSetupRequest[]);
    if (!criteriaRes.error && criteriaRes.data) setCriteria(criteriaRes.data);

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchPortal();
  }, [fetchPortal]);

  const submitBadgeRequest = async (
    requestType: BadgeRequest['request_type'],
    notes: string,
  ): Promise<{ error: string | null; paymentReference: string | null }> => {
    if (!user || !organization) {
      return { error: 'Not signed in', paymentReference: null };
    }

    if (!member?.verified_at) {
      return {
        error:
          'NGOreality still needs to confirm you manage this organisation before you can apply for a Reality Badge. Monitoring still works.',
        paymentReference: null,
      };
    }

    const paymentReference = await ensurePaymentReference(organization.id);

    const { error: insertError } = await supabase.from('badge_requests').insert({
      organization_id: organization.id,
      requested_by: user.id,
      request_type: requestType,
      notes,
    });

    if (insertError) {
      const rlsDenied =
        insertError.code === '42501' ||
        /row-level security/i.test(insertError.message);
      return {
        error: rlsDenied
          ? 'NGOreality still needs to confirm you manage this organisation before you can apply for a Reality Badge. Monitoring still works.'
          : insertError.message,
        paymentReference: null,
      };
    }

    if (requestType === 'renewal') {
      await supabase
        .from('organization_memberships')
        .update({ status: 'pending_renewal' })
        .eq('organization_id', organization.id)
        .eq('status', 'active');
    }

    await fetchPortal();
    return { error: null, paymentReference };
  };

  const isLinked = Boolean(member);
  const hasOrganization = Boolean(organization);
  const needsRegistration = Boolean(user) && !isLinked && !loading;
  const isSteward = Boolean(member?.verified_at);

  return {
    member,
    organization,
    memberships,
    badges,
    badgeRequests,
    setupRequests,
    criteria,
    loading,
    error,
    refetch: fetchPortal,
    submitBadgeRequest,
    isLinked,
    hasOrganization,
    needsRegistration,
    isSteward,
  };
}
