/**
 * Unit counts (volume block) → expected receipt $ and linked costs.
 * Single source of truth so editing badges/packages/subs updates sales lines and (A)/(E) totals.
 */

import { LANDING_STANDARDS_PACKAGE_CENTS } from '../config/customerProducts';
import {
  WORKSPACE_MONTHLY_ARPU_CENTS,
  membershipSalesNote,
  packageSalesNote,
  workspaceSalesNote,
  type MonthFunnelSnapshot,
} from '../config/salesFunnelModel';
import { MEMBERSHIP_ANNUAL_CENTS } from '../config/pricing';
import { stripeMerchantFeesCents } from '../config/cashflowAssumptions';
import type { BusinessCashflowUnit } from './businessCashflowUnits';
import { UNIT_DERIVED_LINE_KEYS, type UnitDerivedLineKey } from '../config/businessPlanRef';

export interface UnitCountsForPeriod {
  badges: number;
  packages: number;
  workspace_active: number;
}

export function unitCountsFromGridRow(
  periodUnits: Record<string, BusinessCashflowUnit | undefined> | undefined,
  field: 'expected_count' | 'actual_count' = 'expected_count',
): UnitCountsForPeriod {
  return {
    badges: periodUnits?.badges?.[field] ?? 0,
    packages: periodUnits?.packages?.[field] ?? 0,
    workspace_active: periodUnits?.workspace_active?.[field] ?? 0,
  };
}

export function deriveReceiptCentsFromUnits(units: UnitCountsForPeriod): {
  sales: number;
  sales_other: number;
  workspace_saas: number;
  totalReceiptsCents: number;
} {
  const sales = units.badges * MEMBERSHIP_ANNUAL_CENTS;
  const sales_other = units.packages * LANDING_STANDARDS_PACKAGE_CENTS;
  const workspace_saas = units.workspace_active * WORKSPACE_MONTHLY_ARPU_CENTS;
  return {
    sales,
    sales_other,
    workspace_saas,
    totalReceiptsCents: sales + sales_other + workspace_saas,
  };
}

/** Minimal funnel shape for note helpers. */
function funnelShapeFromUnits(units: UnitCountsForPeriod, monthIndex: number): MonthFunnelSnapshot {
  const receipts = deriveReceiptCentsFromUnits(units);
  return {
    monthIndex,
    batchPerDay: 0,
    ngosOnboardedBatch: 0,
    badgesThisMonth: units.badges,
    packagesThisMonth: units.packages,
    workspaceNewSubs: 0,
    workspaceActiveSubs: units.workspace_active,
    membershipRevenueCents: receipts.sales,
    packageRevenueCents: receipts.sales_other,
    workspaceMrrCents: receipts.workspace_saas,
    totalReceiptsCents: receipts.totalReceiptsCents,
    units: {
      ngos_batch: 0,
      badges: units.badges,
      packages: units.packages,
      workspace_new: 0,
      workspace_active: units.workspace_active,
    },
  };
}

export interface DerivedUnitLines {
  lines: Partial<Record<UnitDerivedLineKey, number>>;
  notes: Partial<Record<UnitDerivedLineKey, string>>;
}

/** Expected $ for lines tied to the volume block (receipts + Stripe + infra). */
export function deriveExpectedLinesFromUnits(
  units: UnitCountsForPeriod,
  monthIndex: number,
): DerivedUnitLines {
  const receipts = deriveReceiptCentsFromUnits(units);
  const f = funnelShapeFromUnits(units, monthIndex);

  return {
    lines: {
      sales: receipts.sales,
      sales_other: receipts.sales_other,
      workspace_saas: receipts.workspace_saas,
      bank_fees: stripeMerchantFeesCents(receipts.totalReceiptsCents),
    },
    notes: {
      sales: `${membershipSalesNote(f)} · from units`,
      sales_other: `${packageSalesNote(f)} · from units`,
      workspace_saas: `${workspaceSalesNote(f)} · from units`,
      bank_fees: 'Stripe on badge + package + workspace MRR (from units)',
    },
  };
}

export function isUnitDerivedLineKey(key: string): key is UnitDerivedLineKey {
  return (UNIT_DERIVED_LINE_KEYS as readonly string[]).includes(key);
}
