import { FINANCIAL_VERIFICATION_ENABLED } from '../config/features';
import type { Organization, OrgStatus, VerificationLevel } from '../types';
import { isNgorealityVerified } from '../types';

/** Staff-facing trust + pipeline — maps to `status` + `verification_level` in the database. */
export type OrgTrustStage =
  | 'listed'
  | 'onboarding'
  | 'under_review'
  | 'standards_passed'
  | 'ngoreality_verified'
  | 'active_customer'
  | 'lapsed'
  | 'transparent_financial';

export type OrgTrustDisplay = {
  label: string;
  hint?: string;
  tone: 'pipeline' | 'trust' | 'muted' | 'warn';
};

type TrustStageDef = {
  value: OrgTrustStage;
  label: string;
  description: string;
  status: OrgStatus;
  verification_level: VerificationLevel;
};

const TRUST_STAGES: TrustStageDef[] = [
  {
    value: 'listed',
    label: 'Listed (registry)',
    description: 'Imported from a public register; no NGOreality review yet.',
    status: 'listed',
    verification_level: 'none',
  },
  {
    value: 'onboarding',
    label: 'Onboarding',
    description: 'Customer signup or setup in progress.',
    status: 'onboarding',
    verification_level: 'none',
  },
  {
    value: 'under_review',
    label: 'Under review',
    description: 'Staff reviewing standards; badge not issued yet.',
    status: 'under_review',
    verification_level: 'none',
  },
  {
    value: 'standards_passed',
    label: 'Standards passed',
    description: 'Public criteria met internally; public trust badge not issued.',
    status: 'verified',
    verification_level: 'none',
  },
  {
    value: 'ngoreality_verified',
    label: 'NGOreality verified',
    description: 'Public trust badge active (non-financial tier).',
    status: 'verified',
    verification_level: 'verified',
  },
  {
    value: 'active_customer',
    label: 'Active customer',
    description: 'Paying or active member with NGOreality verified badge.',
    status: 'active',
    verification_level: 'verified',
  },
  {
    value: 'lapsed',
    label: 'Lapsed',
    description: 'Membership or engagement lapsed; badge may be revoked separately.',
    status: 'lapsed',
    verification_level: 'none',
  },
  {
    value: 'transparent_financial',
    label: 'Transparent financial',
    description: 'Highest trust tier — financial transparency standards met.',
    status: 'active',
    verification_level: 'transparent_financial',
  },
];

export function getTrustStageOptions(): TrustStageDef[] {
  return TRUST_STAGES.filter(
    (s) => FINANCIAL_VERIFICATION_ENABLED || s.value !== 'transparent_financial',
  );
}

export function orgToTrustStage(
  org: Pick<Organization, 'status' | 'verification_level'>,
): OrgTrustStage {
  if (org.verification_level === 'transparent_financial') return 'transparent_financial';
  if (org.verification_level === 'verified') {
    return org.status === 'active' ? 'active_customer' : 'ngoreality_verified';
  }
  if (org.status === 'verified' || org.status === 'active') return 'standards_passed';
  if (org.status === 'lapsed') return 'lapsed';
  if (org.status === 'under_review') return 'under_review';
  if (org.status === 'onboarding') return 'onboarding';
  return 'listed';
}

export function trustStageToFields(stage: OrgTrustStage): {
  status: OrgStatus;
  verification_level: VerificationLevel;
} {
  const def = TRUST_STAGES.find((s) => s.value === stage);
  if (!def) {
    return { status: 'listed', verification_level: 'none' };
  }
  return { status: def.status, verification_level: def.verification_level };
}

export function getTrustStageLabel(stage: OrgTrustStage): string {
  return TRUST_STAGES.find((s) => s.value === stage)?.label ?? stage;
}

export function getTrustStageDescription(stage: OrgTrustStage): string {
  return TRUST_STAGES.find((s) => s.value === stage)?.description ?? '';
}

export function getOrgTrustDisplay(
  org: Pick<Organization, 'status' | 'verification_level'>,
): OrgTrustDisplay {
  const stage = orgToTrustStage(org);
  const def = TRUST_STAGES.find((s) => s.value === stage);

  if (stage === 'transparent_financial') {
    if (!FINANCIAL_VERIFICATION_ENABLED) {
      return { label: 'Transparent financial', hint: 'Coming soon', tone: 'muted' };
    }
    return { label: 'Transparent financial', tone: 'trust' };
  }

  if (isNgorealityVerified(org)) {
    return {
      label: 'NGOreality verified',
      hint: org.status === 'active' ? 'Active customer' : undefined,
      tone: 'trust',
    };
  }

  if (stage === 'standards_passed') {
    return {
      label: 'Standards passed',
      hint: 'Badge not issued — complete verification criteria',
      tone: 'warn',
    };
  }

  return {
    label: def?.label ?? org.status,
    tone: 'pipeline',
  };
}

export function getTrustStageQuickActions(
  org: Pick<Organization, 'status' | 'verification_level'>,
): TrustStageDef[] {
  const current = orgToTrustStage(org);
  return getTrustStageOptions().filter((s) => s.value !== current);
}
