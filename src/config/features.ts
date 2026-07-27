import { VERIFICATION_LEVEL_LABELS, type VerificationLevel } from '../types';

/**
 * Product launch flags — flip when ready to ship financial transparency tier.
 */
export const FINANCIAL_VERIFICATION_ENABLED = false;

/**
 * Organisation Workspace — beneficiary & case management for NGO tenants.
 * Ships dark; enable per design partner via VITE_WORKSPACE_ENABLED=true.
 *
 * Note this is a UI flag only. Access is enforced by Postgres RLS
 * (migration 027) — a member with no workspace role sees nothing regardless.
 */
export const WORKSPACE_ENABLED =
  import.meta.env.VITE_WORKSPACE_ENABLED === 'true';

export function getVerificationLevelOptions(): { value: VerificationLevel; label: string }[] {
  return (Object.entries(VERIFICATION_LEVEL_LABELS) as [VerificationLevel, string][])
    .filter(([key]) => FINANCIAL_VERIFICATION_ENABLED || key !== 'transparent_financial')
    .map(([value, label]) => ({ value, label }));
}
