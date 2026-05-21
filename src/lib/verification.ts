import { supabase } from './supabase';
import { DEFAULT_CRITERIA, type Organization, type VerificationCriterion } from '../types';

export type CriterionStatus = VerificationCriterion['status'];

export function isBaseCriterion(c: VerificationCriterion): boolean {
  return DEFAULT_CRITERIA.some((d) => d.criterion_key === c.criterion_key);
}

export function allBaseCriteriaPass(criteria: VerificationCriterion[]): boolean {
  const base = criteria.filter(isBaseCriterion);
  if (base.length < DEFAULT_CRITERIA.length) return false;
  return base.every((c) => c.status === 'pass');
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

/** When every base criterion is pass, mark org verified and issue badge if needed. */
export async function tryAutoVerifyOrganization(
  organizationId: string,
  criteria: VerificationCriterion[],
  organization: Pick<Organization, 'status' | 'verification_level' | 'name'>,
): Promise<AutoVerifyResult> {
  if (!allBaseCriteriaPass(criteria)) {
    return { verified: false, badgeIssued: false, message: 'Not all base criteria are pass' };
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
      action: 'auto_verified',
      description: 'All verification criteria passed — status set to Verified',
      performed_by: 'system',
    });
  }

  const { data: activeBadges } = await supabase
    .from('verification_badges')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  let badgeIssued = false;
  if (!activeBadges?.length) {
    const { count } = await supabase
      .from('verification_badges')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
    const verificationId = `REAL-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(3, '0')}`;
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const { error: badgeError } = await supabase.from('verification_badges').insert({
      organization_id: organizationId,
      verification_id: verificationId,
      level: 'verified',
      issued_at: now,
      expires_at: expiresAt.toISOString(),
      is_active: true,
    });

    if (!badgeError) {
      badgeIssued = true;
      await supabase.from('activity_log').insert({
        organization_id: organizationId,
        action: 'badge_issued',
        description: `Auto-issued badge: ${verificationId}`,
        performed_by: 'system',
      });
    }
  }

  return {
    verified: true,
    badgeIssued,
    message: badgeIssued ? 'Organization verified and badge issued' : 'Organization verified',
  };
}
