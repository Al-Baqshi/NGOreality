/**
 * Volume-first forecast: NGO onboarding → badges (primary) + fixed $650 packages/mo + workspace MRR.
 */

import {
  LANDING_STANDARDS_PACKAGE_CENTS,
  WORKSPACE_ADMIN_MONTHLY_CENTS,
  WORKSPACE_AVG_EXTRA_SEATS,
  WORKSPACE_SEAT_MONTHLY_CENTS,
} from './customerProducts';
import { MEMBERSHIP_ANNUAL_CENTS } from './pricing';
import {
  BATCH_ONBOARD_END_PER_DAY,
  BATCH_ONBOARD_START_PER_DAY,
  MONTHLY_BADGE_TARGETS,
  MONTHLY_ONBOARD_TARGETS,
  NGOs_ONBOARDED_MONTH_ONE,
  packagesForMonth,
} from './saasOperatingCosts';

export const NZ_REGISTRY_LISTED = 29_000;
export const NZ_COVERAGE_TARGET_PCT = 0.5;
export const NZ_COVERAGE_TARGET_ORGS = Math.round(NZ_REGISTRY_LISTED * NZ_COVERAGE_TARGET_PCT);

export { BATCH_ONBOARD_END_PER_DAY, BATCH_ONBOARD_START_PER_DAY, NGOs_ONBOARDED_MONTH_ONE };
export const WORKING_DAYS_PER_MONTH = 22;

/** Human-readable ramp for UI copy. */
export function batchRampLabel(): string {
  const first = MONTHLY_BADGE_TARGETS[0];
  const last = MONTHLY_BADGE_TARGETS[MONTHLY_BADGE_TARGETS.length - 1];
  return `${first} → ${last} badges/month`;
}

/** Share of each batch cohort that converts to paid products. */
export const FUNNEL_RATES = {
  /** Primary revenue: Reality Badge ($100/yr) after standards pass. */
  badgeShareOfBatch: 0.40,
  /** Used only when not using fixed package count (fallback). */
  packageShareOfBatch: 0.10,
  /** Take Organisation Workspace SaaS (billed from month after onboard). */
  workspaceAttachShare: 0.25,
  workspaceBillingStartsMonthIndex: 1,
  workspaceMonthlyChurn: 0.05,
} as const;

export const WORKSPACE_MONTHLY_ARPU_CENTS =
  WORKSPACE_ADMIN_MONTHLY_CENTS + Math.round(WORKSPACE_AVG_EXTRA_SEATS * WORKSPACE_SEAT_MONTHLY_CENTS);

/** Display-only unit rows in the cash flow table (not stored as cents). */
export const CASHFLOW_UNIT_ROWS = [
  { key: 'ngos_batch', label: 'NGOs onboarded (leads in pipeline / mo)' },
  { key: 'badges', label: 'Units — Reality Badge sold ($70/yr)' },
  { key: 'packages', label: 'Units — $650 landing + standards (ramps 1→6/mo)' },
  { key: 'workspace_new', label: 'Units — Workspace new paying orgs (mo)' },
  { key: 'workspace_active', label: 'Units — Workspace active subscribers' },
] as const;

export interface MonthFunnelSnapshot {
  monthIndex: number;
  batchPerDay: number;
  ngosOnboardedBatch: number;
  badgesThisMonth: number;
  packagesThisMonth: number;
  workspaceNewSubs: number;
  workspaceActiveSubs: number;
  membershipRevenueCents: number;
  packageRevenueCents: number;
  workspaceMrrCents: number;
  totalReceiptsCents: number;
  units: Record<(typeof CASHFLOW_UNIT_ROWS)[number]['key'], number>;
}

export function batchPerDayForMonth(monthIndex: number, _monthCount: number): number {
  const target = MONTHLY_ONBOARD_TARGETS[Math.min(monthIndex, MONTHLY_ONBOARD_TARGETS.length - 1)];
  return target / WORKING_DAYS_PER_MONTH;
}

/** Must run in order so workspace subscribers accumulate (recurring builds from month 2). */
export function computeAllMonthFunnels(monthCount: number): MonthFunnelSnapshot[] {
  const results: MonthFunnelSnapshot[] = [];
  let cumulativeWorkspaceSubs = 0;
  let prevBadges = 0;

  for (let monthIndex = 0; monthIndex < monthCount; monthIndex++) {
    const ngosOnboardedBatch =
      MONTHLY_ONBOARD_TARGETS[Math.min(monthIndex, MONTHLY_ONBOARD_TARGETS.length - 1)];
    const batchPerDay = ngosOnboardedBatch / WORKING_DAYS_PER_MONTH;

    const packagesThisMonth = packagesForMonth(monthIndex);
    const badgesThisMonth =
      MONTHLY_BADGE_TARGETS[Math.min(monthIndex, MONTHLY_BADGE_TARGETS.length - 1)];

    const workspaceNewSubs =
      monthIndex >= FUNNEL_RATES.workspaceBillingStartsMonthIndex
        ? Math.round(prevBadges * FUNNEL_RATES.workspaceAttachShare)
        : 0;

    cumulativeWorkspaceSubs = Math.round(
      cumulativeWorkspaceSubs * (1 - FUNNEL_RATES.workspaceMonthlyChurn) + workspaceNewSubs,
    );

    const membershipRevenueCents = badgesThisMonth * MEMBERSHIP_ANNUAL_CENTS;
    const packageRevenueCents = packagesThisMonth * LANDING_STANDARDS_PACKAGE_CENTS;
    const workspaceMrrCents = cumulativeWorkspaceSubs * WORKSPACE_MONTHLY_ARPU_CENTS;
    const totalReceiptsCents = membershipRevenueCents + packageRevenueCents + workspaceMrrCents;

    results.push({
      monthIndex,
      batchPerDay,
      ngosOnboardedBatch,
      badgesThisMonth,
      packagesThisMonth,
      workspaceNewSubs,
      workspaceActiveSubs: cumulativeWorkspaceSubs,
      membershipRevenueCents,
      packageRevenueCents,
      workspaceMrrCents,
      totalReceiptsCents,
      units: {
        ngos_batch: ngosOnboardedBatch,
        badges: badgesThisMonth,
        packages: packagesThisMonth,
        workspace_new: workspaceNewSubs,
        workspace_active: cumulativeWorkspaceSubs,
      },
    });

    prevBadges = badgesThisMonth;
  }

  return results;
}

export function computeMonthFunnel(monthIndex: number, monthCount = 12): MonthFunnelSnapshot {
  const all = computeAllMonthFunnels(monthCount);
  return (
    all[monthIndex] ?? {
      monthIndex,
      batchPerDay: BATCH_ONBOARD_START_PER_DAY,
      ngosOnboardedBatch: 0,
      badgesThisMonth: 0,
      packagesThisMonth: 0,
      workspaceNewSubs: 0,
      workspaceActiveSubs: 0,
      membershipRevenueCents: 0,
      packageRevenueCents: 0,
      workspaceMrrCents: 0,
      totalReceiptsCents: 0,
      units: { ngos_batch: 0, badges: 0, packages: 0, workspace_new: 0, workspace_active: 0 },
    }
  );
}

export function membershipSalesNote(f: MonthFunnelSnapshot): string {
  return `${f.badgesThisMonth} badges × $${MEMBERSHIP_ANNUAL_CENTS / 100} = $${(f.membershipRevenueCents / 100).toLocaleString()}`;
}

export function packageSalesNote(f: MonthFunnelSnapshot): string {
  return `${f.packagesThisMonth} packages × $${LANDING_STANDARDS_PACKAGE_CENTS / 100} = $${(f.packageRevenueCents / 100).toLocaleString()}`;
}

export function workspaceSalesNote(f: MonthFunnelSnapshot): string {
  return `${f.workspaceActiveSubs} active orgs × $${(WORKSPACE_MONTHLY_ARPU_CENTS / 100).toFixed(2)}/mo MRR = $${(f.workspaceMrrCents / 100).toLocaleString()} ($25 admin seat only — extra seats are upside)`;
}

export { monthlyInfraCostsCents, monthlyHostingCostsCents, monthlyAiDevCostsCents } from './saasOperatingCosts';

/** Year-2 style recurring hint from month-12 subscriber base. */
export function projectedWorkspaceArrCents(monthCount: number): number {
  const last = computeAllMonthFunnels(monthCount).at(-1);
  if (!last) return 0;
  return last.workspaceActiveSubs * WORKSPACE_MONTHLY_ARPU_CENTS * 12;
}
