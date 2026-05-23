/**
 * Cash flow worksheet defaults — units → revenue lines (batch 5–100 NGOs/day).
 */

import {
  computeAllMonthFunnels,
  membershipSalesNote,
  monthlyInfraCostsCents,
  packageSalesNote,
  workspaceSalesNote,
  type MonthFunnelSnapshot,
} from './salesFunnelModel';
import {
  FLEXI_WAGE_DEFAULT_MONTHS,
  FLEXI_WAGE_MONTHLY_CENTS,
} from './businessPlanRef';
import { staffWagesCentsForMonth, staffWagesNoteForMonth } from './businessPlanStaffing';

export const CAPITALISATION_GRANT_CENTS = 1_000_000;
export const MAC_STUDIO_M4_MAX_CENTS = 849_900;
export const SETUP_LOGO_BRAND_CENTS = 120_000;
export const SETUP_PRINT_CARDS_CENTS = 30_100;
export const OPENING_OWNER_CAPITAL_CENTS = 300_000;
export const MONTHLY_INTERNET_CENTS = 10_000;

export const SETUP_MONTH_INDEX = 0;
/** Auckland office — add rent into overheads from this month (edit $ on Overheads row). */
export const OFFICE_RENT_START_MONTH_INDEX = 9;
export const MONTHLY_OFFICE_RENT_CENTS = 2_200_00; // $2,200/mo placeholder — adjust when lease signed

export interface CashflowMonthAssumptions {
  funnel: MonthFunnelSnapshot;
  lines: Partial<Record<string, number>>;
  notes?: Partial<Record<string, string>>;
}

function nz(dollars: number): number {
  return Math.round(dollars * 100);
}

export function stripeMerchantFeesCents(receiptsCents: number): number {
  if (receiptsCents <= 0) return nz(15);
  const estCharges = Math.max(2, Math.ceil(receiptsCents / 40_000));
  return Math.round(receiptsCents * 0.029 + estCharges * 30);
}

function buildMonthFromFunnel(funnel: MonthFunnelSnapshot, monthIndex: number): CashflowMonthAssumptions {
  const totalReceipts = funnel.totalReceiptsCents;
  const infra = monthlyInfraCostsCents(monthIndex, funnel.badgesThisMonth, funnel.workspaceActiveSubs);

  const lines: Partial<Record<string, number>> = {
    sales: funnel.membershipRevenueCents,
    sales_other: funnel.packageRevenueCents,
    workspace_saas: funnel.workspaceMrrCents,
    it_internet: MONTHLY_INTERNET_CENTS,
    subscriptions: infra.total,
    insurance: nz(145),
    accountancy: nz(275),
    marketing: nz(monthIndex < 6 ? 200 : 380),
    overheads: nz(95),
    bank_fees: stripeMerchantFeesCents(totalReceipts),
    training: nz(60),
  };

  const notes: Partial<Record<string, string>> = {
    sales: membershipSalesNote(funnel),
    sales_other: packageSalesNote(funnel),
    workspace_saas: workspaceSalesNote(funnel),
    it_internet: 'Fibre + mobile — $100/mo',
    bank_fees: 'Stripe on badge + package + workspace MRR',
    subscriptions: infra.note,
  };

  if (monthIndex < FLEXI_WAGE_DEFAULT_MONTHS) {
    lines.flexi_wage = FLEXI_WAGE_MONTHLY_CENTS;
  }

  if (monthIndex === SETUP_MONTH_INDEX) {
    lines.govt_grant = CAPITALISATION_GRANT_CENTS;
    lines.other_receipts = OPENING_OWNER_CAPITAL_CENTS;
    lines.cogs_setup = MAC_STUDIO_M4_MAX_CENTS;
    lines.marketing = (lines.marketing ?? 0) + SETUP_LOGO_BRAND_CENTS + SETUP_PRINT_CARDS_CENTS;
  }

  lines.drawings = monthIndex < 6 ? nz(2_200) : nz(3_800);
  lines.acc_reserve = nz(90);
  lines.income_tax_reserve = monthIndex < 4 ? 0 : monthIndex < 8 ? nz(350) : nz(750);

  const staffCents = staffWagesCentsForMonth(monthIndex);
  if (staffCents > 0) {
    lines.staff_wages = staffCents;
    notes.staff_wages = staffWagesNoteForMonth(monthIndex);
  }

  if (monthIndex >= OFFICE_RENT_START_MONTH_INDEX) {
    lines.overheads = nz(2_850) + MONTHLY_OFFICE_RENT_CENTS;
    notes.overheads = `Premises (month ${OFFICE_RENT_START_MONTH_INDEX + 1}+): rent ~$${MONTHLY_OFFICE_RENT_CENTS / 100}/mo + power · team scales toward 5 @ ~$1.5–2k/wk`;
  } else {
    notes.overheads = notes.overheads ?? 'Home-based until premises — staff wages on separate line from month 1';
  }

  return { funnel, lines, notes };
}

export function buildAucklandForecastMonths(monthCount: number): CashflowMonthAssumptions[] {
  return computeAllMonthFunnels(monthCount).map((funnel, i) => buildMonthFromFunnel(funnel, i));
}

export function forecastExpectedForLine(
  month: CashflowMonthAssumptions | undefined,
  lineKey: string,
): { expected_cents: number; notes: string } {
  if (!month) return { expected_cents: 0, notes: '' };
  return {
    expected_cents: month.lines[lineKey] ?? 0,
    notes: month.notes?.[lineKey] ?? '',
  };
}
