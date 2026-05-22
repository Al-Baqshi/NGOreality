import { supabase } from './supabase';
import { allPublicCriteriaPass } from './criteria';
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
 * Badge is issued on membership payment (not automatically here).
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
      description: 'All public trust standards passed — ready for membership / badge on payment',
      performed_by: 'system',
    });
  }

  return {
    verified: true,
    badgeIssued: false,
    message: 'Public standards met — record $100 membership payment to issue badge and enable alerts',
  };
}
