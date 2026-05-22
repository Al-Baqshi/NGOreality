/**
 * Volume-first forecast: daily NGO batch onboarding (5 → 100/day) drives units,
 * then membership, packages, and Organisation Workspace MRR ($25 admin + $15/seat).
 */

import {
  LANDING_STANDARDS_PACKAGE_CENTS,
  WORKSPACE_ADMIN_MONTHLY_CENTS,
  WORKSPACE_AVG_EXTRA_SEATS,
  WORKSPACE_SEAT_MONTHLY_CENTS,
} from './customerProducts';
import { MEMBERSHIP_ANNUAL_CENTS } from './pricing';

export const NZ_REGISTRY_LISTED = 29_000;
export const NZ_COVERAGE_TARGET_PCT = 0.5;
export const NZ_COVERAGE_TARGET_ORGS = Math.round(NZ_REGISTRY_LISTED * NZ_COVERAGE_TARGET_PCT);

/** Batch onboarding: NGOs added to the platform per working day. */
export const BATCH_ONBOARD_START_PER_DAY = 5;
export const BATCH_ONBOARD_END_PER_DAY = 100;
export const WORKING_DAYS_PER_MONTH = 22;

/** Share of each batch cohort (can overlap in real life; forecast uses split for units). */
export const FUNNEL_RATES = {
  /** Profile-ready → AI/hybrid pass → Reality Badge ($100/yr). */
  badgeShareOfBatch: 0.28,
  /** Need landing + standards build. */
  packageShareOfBatch: 0.12,
  /** Take Organisation Workspace SaaS (billed from month after onboard). */
  workspaceAttachShare: 0.75,
  workspaceBillingStartsMonthIndex: 1,
  workspaceMonthlyChurn: 0.03,
} as const;

export const WORKSPACE_MONTHLY_ARPU_CENTS =
  WORKSPACE_ADMIN_MONTHLY_CENTS + Math.round(WORKSPACE_AVG_EXTRA_SEATS * WORKSPACE_SEAT_MONTHLY_CENTS);

/** Display-only unit rows in the cash flow table (not stored as cents). */
export const CASHFLOW_UNIT_ROWS = [
  { key: 'ngos_batch', label: 'NGOs onboarded (batch/day × 22 days)' },
  { key: 'badges', label: 'Units — Reality Badge ($100/yr)' },
  { key: 'packages', label: 'Units — $650 landing + standards' },
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

export function batchPerDayForMonth(monthIndex: number, monthCount: number): number {
  if (monthCount <= 1) return BATCH_ONBOARD_END_PER_DAY;
  const t = monthIndex / (monthCount - 1);
  return BATCH_ONBOARD_START_PER_DAY + (BATCH_ONBOARD_END_PER_DAY - BATCH_ONBOARD_START_PER_DAY) * t;
}

/** Must run in order so workspace subscribers accumulate (recurring builds from month 2). */
export function computeAllMonthFunnels(monthCount: number): MonthFunnelSnapshot[] {
  const results: MonthFunnelSnapshot[] = [];
  let cumulativeWorkspaceSubs = 0;
  let prevOnboarded = 0;

  for (let monthIndex = 0; monthIndex < monthCount; monthIndex++) {
    const batchPerDay = batchPerDayForMonth(monthIndex, monthCount);
    const ngosOnboardedBatch = Math.round(batchPerDay * WORKING_DAYS_PER_MONTH);

    const badgesThisMonth = Math.round(ngosOnboardedBatch * FUNNEL_RATES.badgeShareOfBatch);
    const packagesThisMonth = Math.round(ngosOnboardedBatch * FUNNEL_RATES.packageShareOfBatch);

    const workspaceNewSubs =
      monthIndex >= FUNNEL_RATES.workspaceBillingStartsMonthIndex
        ? Math.round(prevOnboarded * FUNNEL_RATES.workspaceAttachShare)
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

    prevOnboarded = ngosOnboardedBatch;
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
  return `${f.workspaceActiveSubs} active orgs × $${(WORKSPACE_MONTHLY_ARPU_CENTS / 100).toFixed(2)}/mo MRR = $${(f.workspaceMrrCents / 100).toLocaleString()} ($25 admin + ~${WORKSPACE_AVG_EXTRA_SEATS} seats × $15)`;
}

export function monthlyInfraCostsCents(
  monthIndex: number,
  badgesThisMonth: number,
  workspaceActiveSubs: number,
): { total: number; note: string } {
  const vercel = 3_500;
  const database = monthIndex < 6 ? 6_500 : monthIndex < 9 ? 9_500 : 14_000;
  const resend =
    workspaceActiveSubs > 500
      ? 12_000
      : workspaceActiveSubs > 200
        ? 8_000
        : badgesThisMonth > 40
          ? 5_500
          : 2_500;
  const domains = 300;
  const aiApi = monthIndex < 4 ? 8_000 : monthIndex < 8 ? 10_000 : 5_000;
  const total = vercel + database + resend + domains + aiApi;
  return {
    total,
    note: `Vercel · DB · Resend (${workspaceActiveSubs} workspace orgs) · AI/API`,
  };
}

/** Year-2 style recurring hint from month-12 subscriber base. */
export function projectedWorkspaceArrCents(monthCount: number): number {
  const last = computeAllMonthFunnels(monthCount).at(-1);
  if (!last) return 0;
  return last.workspaceActiveSubs * WORKSPACE_MONTHLY_ARPU_CENTS * 12;
}
