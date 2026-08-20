/** Shared copy for Reality Badge readiness (membership ≠ badge). */

export type BadgePipelineStage =
  | 'issued'
  | 'membership_active_badge_pending'
  | 'standards_ready_awaiting_payment'
  | 'both_met_badge_missing'
  | 'awaiting_standards_and_payment';

export function getBadgePipelineStage(input: {
  hasActiveBadge: boolean;
  hasActiveMembership: boolean;
  standardsPass: boolean;
}): BadgePipelineStage {
  if (input.hasActiveBadge) return 'issued';
  if (input.hasActiveMembership && input.standardsPass) return 'both_met_badge_missing';
  if (input.hasActiveMembership) return 'membership_active_badge_pending';
  if (input.standardsPass) return 'standards_ready_awaiting_payment';
  return 'awaiting_standards_and_payment';
}

export const BADGE_PIPELINE_STAFF: Record<Exclude<BadgePipelineStage, 'issued'>, string> = {
  membership_active_badge_pending:
    'Membership active — badge pending public standards (pass all standards to auto-issue)',
  standards_ready_awaiting_payment:
    'Standards met — badge pending membership payment (record paid to auto-issue)',
  both_met_badge_missing:
    'Standards and membership are both met — badge should have auto-issued; refresh or re-save a standard to retry',
  awaiting_standards_and_payment:
    'No badge yet — need all public standards pass and paid membership',
};

export const BADGE_PIPELINE_NGO: Record<Exclude<BadgePipelineStage, 'issued'>, string> = {
  membership_active_badge_pending:
    'Your membership is active. The Reality Badge issues automatically after our team marks all public trust standards as pass — that is normal.',
  standards_ready_awaiting_payment:
    'Public trust standards are ready. Pay annual membership and we issue the Reality Badge automatically once payment is confirmed.',
  both_met_badge_missing:
    'Membership and standards look complete. If your badge is not showing yet, it should appear shortly — contact us if it does not.',
  awaiting_standards_and_payment:
    'The Reality Badge needs both an active membership and completed public trust standards. Membership can be active before the badge is issued.',
};
