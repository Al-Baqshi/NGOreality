import { supabase } from './supabase';
import { captureEmptyMutation, captureError } from './errorReporting';
import { allPublicCriteriaPass } from './criteria';
import { queueAndTrySend } from './notifications';
import type { Organization, VerificationCriterion } from '../types';

export function isMembershipProduct(productType: string): boolean {
  return productType === 'membership_annual' || productType === 'verification_annual';
}

/** Extend membership 1 year from payment date (or stack from current expiry if still active). */
export async function extendOrganizationMembership(
  organizationId: string,
  paidAt: Date,
): Promise<{ error: string | null }> {
  const { data: latest, error: latestError } = await supabase
    .from('organization_memberships')
    .select('expires_at, status')
    .eq('organization_id', organizationId)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    return { error: captureError(latestError, { where: 'extendOrganizationMembership.latest' }) };
  }

  const start = new Date(paidAt);
  let base = start;
  if (latest?.expires_at && new Date(latest.expires_at) > start && latest.status === 'active') {
    base = new Date(latest.expires_at);
  }
  const expiresAt = new Date(base);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  if (latest?.expires_at && new Date(latest.expires_at) > start) {
    const { data, error } = await supabase
      .from('organization_memberships')
      .update({ expires_at: expiresAt.toISOString(), status: 'active' })
      .eq('organization_id', organizationId)
      .eq('expires_at', latest.expires_at)
      .select('id');
    if (error) return { error: captureError(error, { where: 'extendOrganizationMembership.update' }) };
    if (!data?.length) {
      return {
        error: captureEmptyMutation(
          'extendOrganizationMembership.updateEmpty',
          'Membership expiry could not be updated. Refresh and try again.',
        ),
      };
    }
  } else {
    const { data, error } = await supabase.from('organization_memberships').insert({
      organization_id: organizationId,
      started_at: start.toISOString(),
      expires_at: expiresAt.toISOString(),
      status: 'active',
    }).select('id');
    if (error) return { error: captureError(error, { where: 'extendOrganizationMembership.insert' }) };
    if (!data?.length) {
      return {
        error: captureEmptyMutation(
          'extendOrganizationMembership.insertEmpty',
          'Membership could not be created. Refresh and try again.',
        ),
      };
    }
  }

  return { error: null };
}

/** Hourly checks + alerts for paying members. */
export async function syncMonitorTierForOrg(organizationId: string): Promise<{ error: string | null }> {
  const { data: hasMembership, error: membershipError } = await supabase.rpc('has_active_membership', {
    p_org_id: organizationId,
  });
  if (membershipError) {
    return { error: captureError(membershipError, { where: 'syncMonitorTierForOrg.membership' }) };
  }

  const tier = hasMembership ? 'paid_live' : null;
  if (!tier) {
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('status')
      .eq('id', organizationId)
      .maybeSingle();
    if (orgError) {
      return { error: captureError(orgError, { where: 'syncMonitorTierForOrg.org' }) };
    }
    const fallback =
      org?.status === 'verified' || org?.status === 'active' ? 'active' : 'passive';
    const { data: updated, error: updateError } = await supabase
      .from('website_monitors')
      .update({
        tier: fallback,
        check_interval_minutes: fallback === 'active' ? 1440 : 10080,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
      .select('id');
    if (updateError) {
      return { error: captureError(updateError, { where: 'syncMonitorTierForOrg.fallbackTier' }) };
    }
    if (!updated?.length) {
      return { error: 'No website monitor exists yet — it starts after the first sync.' };
    }
    return { error: null };
  }

  const { data: updated, error: paidError } = await supabase
    .from('website_monitors')
    .update({
      tier: 'paid_live',
      check_interval_minutes: 60,
      enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)
    .select('id');
  if (paidError) {
    return { error: captureError(paidError, { where: 'syncMonitorTierForOrg.paidTier' }) };
  }
  if (!updated?.length) {
    return { error: 'No website monitor exists yet — it starts after the first sync.' };
  }
  return { error: null };
}

/**
 * Globally unique badge ID. Format: REAL-{year}-{org8}-{seq}
 * Org segment avoids cross-org collisions; seq is per-org; random suffix on retry.
 */
async function nextVerificationId(organizationId: string, attempt: number): Promise<string> {
  const year = new Date().getFullYear();
  const orgKey = organizationId.replace(/-/g, '').slice(0, 8).toUpperCase();
  const prefix = `REAL-${year}-${orgKey}-`;

  const { count, error: countError } = await supabase
    .from('verification_badges')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);
  if (countError) captureError(countError, { where: 'nextVerificationId.count' });

  const seq = String((count ?? 0) + 1 + attempt).padStart(2, '0');
  if (attempt === 0) {
    return `${prefix}${seq}`;
  }

  const entropy = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${prefix}${seq}-${entropy}`;
}

function isUniqueViolation(message: string): boolean {
  return (
    message.includes('verification_badges_verification_id_key') ||
    message.includes('duplicate key')
  );
}

export async function issueBadgeIfEligible(
  organizationId: string,
  organization: Pick<Organization, 'verification_level' | 'name'>,
  criteria: VerificationCriterion[],
): Promise<{ issued: boolean; verificationId: string | null; error: string | null }> {
  if (!allPublicCriteriaPass(criteria)) {
    return {
      issued: false,
      verificationId: null,
      error: 'Public trust standards must all pass before issuing the badge.',
    };
  }

  const { data: activeBadges, error: activeError } = await supabase
    .from('verification_badges')
    .select('id, verification_id')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  if (activeError) {
    return {
      issued: false,
      verificationId: null,
      error: captureError(activeError, { where: 'issueBadgeIfEligible.active' }),
    };
  }

  if (activeBadges?.length) {
    return { issued: false, verificationId: activeBadges[0].verification_id, error: null };
  }

  const now = new Date().toISOString();
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const level =
    organization.verification_level === 'none' ? 'verified' : organization.verification_level;

  let verificationId: string | null = null;
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    verificationId = await nextVerificationId(organizationId, attempt);
    const { data, error } = await supabase.from('verification_badges').insert({
      organization_id: organizationId,
      verification_id: verificationId,
      level,
      issued_at: now,
      expires_at: expiresAt.toISOString(),
      is_active: true,
    }).select('id');

    if (!error && data?.length) {
      lastError = null;
      break;
    }
    if (!error && !data?.length) {
      return {
        issued: false,
        verificationId: null,
        error: captureEmptyMutation('issueBadgeIfEligible.insertEmpty', 'The badge was not issued. Refresh and try again.'),
      };
    }
    if (!error) continue;
    if (!isUniqueViolation(error.message)) {
      return {
        issued: false,
        verificationId: null,
        error: captureError(error, { where: 'issueBadgeIfEligible.insert' }),
      };
    }
    lastError = error.message;
  }

  if (lastError || !verificationId) {
    return {
      issued: false,
      verificationId: null,
      error: lastError ?? 'Could not allocate a unique badge ID.',
    };
  }

  const { error: logError } = await supabase.from('activity_log').insert({
    organization_id: organizationId,
    action: 'badge_issued',
    description: `Reality Badge issued: ${verificationId}`,
    performed_by: 'system',
  });
  if (logError) captureError(logError, { where: 'issueBadgeIfEligible.activityLog' });

  const nowIso = new Date().toISOString();
  const { error: badgeReqError } = await supabase
    .from('badge_requests')
    .update({ status: 'approved', updated_at: nowIso })
    .eq('organization_id', organizationId)
    .in('status', ['pending', 'in_review']);
  if (badgeReqError) {
    return {
      issued: true,
      verificationId,
      error: `Badge issued, but the request could not be marked approved: ${captureError(badgeReqError, { where: 'issueBadgeIfEligible.approveRequest' })}`,
    };
  }

  return { issued: true, verificationId, error: null };
}

export async function activateMembershipBenefits(input: {
  organizationId: string;
  paidAt: Date;
  recordedBy?: string;
}): Promise<{ badgeIssued: boolean; message: string; error: string | null }> {
  const { error: memError } = await extendOrganizationMembership(input.organizationId, input.paidAt);
  if (memError) return { badgeIssued: false, message: '', error: memError };

  const monitor = await syncMonitorTierForOrg(input.organizationId);
  const monitorNote = monitor.error
    ? ` Monitoring could not be enabled: ${monitor.error}`
    : ' Monitoring is live.';

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, status, verification_level, email')
    .eq('id', input.organizationId)
    .maybeSingle();
  if (orgError) captureError(orgError, { where: 'activateMembershipBenefits.org' });

  const { data: criteria, error: criteriaError } = await supabase
    .from('verification_criteria')
    .select('*')
    .eq('organization_id', input.organizationId);
  if (criteriaError) captureError(criteriaError, { where: 'activateMembershipBenefits.criteria' });

  if (org && criteria?.length) {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };
    if (org.status !== 'verified' && org.status !== 'active') {
      updates.status = 'verified';
    }
    if (org.verification_level === 'none') {
      updates.verification_level = 'verified';
    }
    let statusNote = '';
    if (Object.keys(updates).length > 1) {
      const { data: orgRow, error: orgUpdateError } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', input.organizationId)
        .select('id');
      if (orgUpdateError) {
        statusNote = ` Directory status could not be updated: ${captureError(orgUpdateError, { where: 'activateMembershipBenefits.orgStatus' })}`;
      } else if (!orgRow?.length) {
        statusNote = ` Directory status could not be updated: ${captureEmptyMutation('activateMembershipBenefits.orgStatusEmpty')}`;
      }
    }

    const badge = await issueBadgeIfEligible(input.organizationId, org, criteria);
    if (badge.error && !badge.issued) {
      return {
        badgeIssued: false,
        message: `Membership active. ${badge.error}${monitorNote}${statusNote}`,
        error: null,
      };
    }

    if (badge.issued && org.email?.trim()) {
      const email = org.email.trim();
      const badgeSend = await queueAndTrySend({
        organizationId: input.organizationId,
        template: 'badge_issued',
        recipientEmail: email,
        organizationName: org.name,
        extra: { verificationId: badge.verificationId ?? '' },
      });
      const welcomeSend = await queueAndTrySend({
        organizationId: input.organizationId,
        template: 'membership_welcome',
        recipientEmail: email,
        organizationName: org.name,
      });
      const flushProblems = [badgeSend.flushError, welcomeSend.flushError].filter(Boolean);
      const queuedProblems = [badgeSend.error, welcomeSend.error].filter(Boolean);

      const { error: logError } = await supabase.from('activity_log').insert({
        organization_id: input.organizationId,
        action: 'membership_activated',
        description: badge.issued
          ? `Annual membership recorded — badge ${badge.verificationId} issued, monitoring enabled`
          : 'Annual membership recorded — monitoring enabled (badge pending standards)',
        performed_by: input.recordedBy ?? 'staff',
      });
      if (logError) captureError(logError, { where: 'activateMembershipBenefits.activityLog' });

      const emailNote =
        queuedProblems.length || flushProblems.length
          ? ` Email was queued but not sent: ${[...queuedProblems, ...flushProblems].join(' · ')}`
          : '';

      return {
        badgeIssued: badge.issued,
        message: badge.issued
          ? `Membership active. Badge ${badge.verificationId} issued.${monitorNote}${emailNote}${statusNote}`
          : `Membership active.${monitorNote} Badge issues automatically when all public standards pass.${emailNote}${statusNote}`,
        error: null,
      };
    }

    const { error: logError } = await supabase.from('activity_log').insert({
      organization_id: input.organizationId,
      action: 'membership_activated',
      description: badge.issued
        ? `Annual membership recorded — badge ${badge.verificationId} issued, monitoring enabled`
        : 'Annual membership recorded — monitoring enabled (badge pending standards)',
      performed_by: input.recordedBy ?? 'staff',
    });
    if (logError) captureError(logError, { where: 'activateMembershipBenefits.activityLog' });

    return {
      badgeIssued: badge.issued,
      message: badge.issued
        ? `Membership active. Badge ${badge.verificationId} issued.${monitorNote}${statusNote}`
        : `Membership active.${monitorNote} Badge issues automatically when all public standards pass.${statusNote}`,
      error: null,
    };
  }

  const { error: logError } = await supabase.from('activity_log').insert({
    organization_id: input.organizationId,
    action: 'membership_activated',
    description: 'Annual membership recorded — monitoring tier updated',
    performed_by: input.recordedBy ?? 'staff',
  });
  if (logError) captureError(logError, { where: 'activateMembershipBenefits.activityLog' });

  return {
    badgeIssued: false,
    message:
      (orgError || criteriaError
        ? 'Membership active. Could not load organisation or standards to issue a badge.'
        : 'Membership active. Initialize verification criteria to issue badge.') + monitorNote,
    error: null,
  };
}
