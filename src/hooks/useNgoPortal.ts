import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { captureError } from '../lib/errorReporting';
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
      setError(captureError(memberError, { where: 'useNgoPortal.membership' }));
      setLoading(false);
      return;
    }

    if (!memberRow) {
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

    const failures: string[] = [];
    if (orgRes.error) {
      failures.push(captureError(orgRes.error, { where: 'useNgoPortal.organization' }));
    } else if (!orgRes.data) {
      failures.push(
        captureError(new Error('Linked organization record is missing'), {
          where: 'useNgoPortal.organizationMissing',
        }),
      );
      setOrganization(null);
    } else {
      setOrganization(orgRes.data);
    }

    if (membershipsRes.error) {
      failures.push(captureError(membershipsRes.error, { where: 'useNgoPortal.memberships' }));
    } else {
      setMemberships(membershipsRes.data ?? []);
    }
    if (badgesRes.error) {
      failures.push(captureError(badgesRes.error, { where: 'useNgoPortal.badges' }));
    } else {
      setBadges(badgesRes.data ?? []);
    }
    if (requestsRes.error) {
      failures.push(captureError(requestsRes.error, { where: 'useNgoPortal.badgeRequests' }));
    } else {
      setBadgeRequests(requestsRes.data ?? []);
    }
    if (setupRes.error) {
      failures.push(captureError(setupRes.error, { where: 'useNgoPortal.setupRequests' }));
    } else {
      setSetupRequests((setupRes.data ?? []) as NgoSetupRequest[]);
    }
    if (criteriaRes.error) {
      failures.push(captureError(criteriaRes.error, { where: 'useNgoPortal.criteria' }));
    } else {
      setCriteria(criteriaRes.data ?? []);
    }

    setError(failures.length ? failures.join(' · ') : null);
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

    let paymentReference: string;
    try {
      paymentReference = await ensurePaymentReference(organization.id);
    } catch (err) {
      return {
        error: captureError(err, { where: 'useNgoPortal.paymentReference' }),
        paymentReference: null,
      };
    }

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
          : captureError(insertError, { where: 'useNgoPortal.requestBadge' }),
        paymentReference: null,
      };
    }

    if (requestType === 'renewal') {
      const { error: renewError } = await supabase
        .from('organization_memberships')
        .update({ status: 'pending_renewal' })
        .eq('organization_id', organization.id)
        .eq('status', 'active');
      if (renewError) {
        await fetchPortal();
        return {
          error: `Request submitted, but membership could not be marked pending renewal: ${captureError(renewError, { where: 'useNgoPortal.requestBadge.renewal' })}`,
          paymentReference,
        };
      }
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
