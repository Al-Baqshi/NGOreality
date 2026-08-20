import { supabase } from './supabase';
import { allPublicCriteriaPass } from './criteria';
import { issueBadgeIfEligible } from './membershipBenefits';
import { queueAndTrySend } from './notifications';
import type { Organization, VerificationCriterion } from '../types';

export type CriterionStatus = VerificationCriterion['status'];

export { allPublicCriteriaPass, isPublicCriterion, isMemberCriterion } from './criteria';

/** @deprecated Use allPublicCriteriaPass */
export function allBaseCriteriaPass(criteria: VerificationCriterion[]): boolean {
  return allPublicCriteriaPass(criteria);
}

export async function updateCriterionStatuses(
  updates: { id: string; status: CriterionStatus }[],
): Promise<{ error: string | null }> {
  if (updates.length === 0) return { error: null };
  const evaluatedAt = new Date().toISOString();
  const results = await Promise.all(
    updates.map(({ id, status }) =>
      supabase
        .from('verification_criteria')
        .update({ status, evaluated_at: evaluatedAt })
        .eq('id', id),
    ),
  );
  const failed = results.find((r) => r.error);
  return { error: failed?.error?.message ?? null };
}

export type AutoVerifyResult = {
  verified: boolean;
  badgeIssued: boolean;
  message: string;
};

/**
 * When all public trust standards pass, mark org verified.
 * If membership is already active, issue the Reality Badge and notify.
 */
export async function tryAutoVerifyOrganization(
  organizationId: string,
  criteria: VerificationCriterion[],
  organization: Pick<Organization, 'status' | 'verification_level' | 'name'>,
): Promise<AutoVerifyResult> {
  if (!allPublicCriteriaPass(criteria)) {
    return {
      verified: false,
      badgeIssued: false,
      message: 'Not all public trust standards are pass',
    };
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  if (organization.status !== 'verified' && organization.status !== 'active') {
    updates.status = 'verified';
  }
  if (organization.verification_level === 'none') {
    updates.verification_level = 'verified';
  }

  if (Object.keys(updates).length > 1) {
    const { error } = await supabase.from('organizations').update(updates).eq('id', organizationId);
    if (error) {
      return { verified: false, badgeIssued: false, message: error.message };
    }
    await supabase.from('activity_log').insert({
      organization_id: organizationId,
      action: 'standards_met',
      description: 'All public trust standards passed — ready for membership / badge',
      performed_by: 'system',
    });
  }

  const { data: hasMembership } = await supabase.rpc('has_active_membership', {
    p_org_id: organizationId,
  });

  if (!hasMembership) {
    return {
      verified: true,
      badgeIssued: false,
      message: 'Public standards met — record $100 membership payment to issue badge and enable alerts',
    };
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, verification_level, email')
    .eq('id', organizationId)
    .maybeSingle();

  if (!org) {
    return {
      verified: true,
      badgeIssued: false,
      message: 'Standards met and membership active, but organization could not be reloaded for badge issue.',
    };
  }

  const badge = await issueBadgeIfEligible(organizationId, org, criteria);
  if (badge.error) {
    return { verified: true, badgeIssued: false, message: `Standards met. ${badge.error}` };
  }

  if (!badge.issued) {
    return {
      verified: true,
      badgeIssued: false,
      message: badge.verificationId
        ? `Standards met. Active badge ${badge.verificationId} already on file.`
        : 'Standards met. Membership active; badge already present.',
    };
  }

  if (org.email?.trim()) {
    await queueAndTrySend({
      organizationId,
      template: 'badge_issued',
      recipientEmail: org.email.trim(),
      organizationName: org.name,
      extra: { verificationId: badge.verificationId ?? '' },
    });
  }

  return {
    verified: true,
    badgeIssued: true,
    message: `Standards met. Badge ${badge.verificationId} issued (membership already active).`,
  };
}
