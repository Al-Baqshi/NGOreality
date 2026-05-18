import { VERIFICATION_LEVEL_LABELS, type VerificationLevel } from '../types';

/**
 * Product launch flags — flip when ready to ship financial transparency tier.
 */
export const FINANCIAL_VERIFICATION_ENABLED = false;

export function getVerificationLevelOptions(): { value: VerificationLevel; label: string }[] {
  return (Object.entries(VERIFICATION_LEVEL_LABELS) as [VerificationLevel, string][])
    .filter(([key]) => FINANCIAL_VERIFICATION_ENABLED || key !== 'transparent_financial')
    .map(([value, label]) => ({ value, label }));
}
