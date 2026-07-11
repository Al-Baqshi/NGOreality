/**
 * Cash flow worksheet defaults — 10 NGOs month 1, packages ramp 1→6/mo, badges primary.
 */

import {
  computeAllMonthFunnels,
  membershipSalesNote,
  monthlyAiDevCostsCents,
  monthlyHostingCostsCents,
  packageSalesNote,
  workspaceSalesNote,
  type MonthFunnelSnapshot,
} from './salesFunnelModel';
import {
  FLEXI_WAGE_DEFAULT_MONTHS,
  FLEXI_WAGE_MONTHLY_CENTS,
} from './businessPlanRef';
import { staffWagesCentsForMonth, staffWagesNoteForMonth } from './businessPlanStaffing';

// Capitalisation grant line items — fills the $10,000 grant with quoted items + a working capital reserve.
export const GRANT_HARDWARE_CENTS = 829_800; // $8,298.00 Mac Studio M3 Ultra 96GB/1TB + keyboard (quote 2B983105260003: net $7,215.65 + GST $1,082.35; GST-inclusive as not GST-registered)
export const SETUP_LOGO_BRAND_CENTS = 10_000; // $100 logo / brand design
export const SETUP_PRINT_CARDS_CENTS = 20_000; // $200 business cards
export const GRANT_FIRST_YEAR_INSURANCE_CENTS = 54_672; // $546.72 first-year business insurance (quote 2B983105260003)
export const GRANT_WORKING_CAPITAL_RESERVE_CENTS = 85_528; // $855.28 working capital reserve — fills grant to $10,000
export const CAPITALISATION_GRANT_CENTS =
  GRANT_HARDWARE_CENTS +
  SETUP_LOGO_BRAND_CENTS +
  SETUP_PRINT_CARDS_CENTS +
  GRANT_FIRST_YEAR_INSURANCE_CENTS +
  GRANT_WORKING_CAPITAL_RESERVE_CENTS; // $10,000.00 total
export const OPENING_OWNER_CAPITAL_CENTS = 0; // No owner cash injection — nothing to evidence (was $5,000)
export const MONTHLY_INTERNET_CENTS = 10_000;

export const SETUP_MONTH_INDEX = 0;
/** Office rent — year 2 consideration; set beyond 12-month forecast. */
export const OFFICE_RENT_START_MONTH_INDEX = 18;
export const MONTHLY_OFFICE_RENT_CENTS = 2_200_00;

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
  const hosting = monthlyHostingCostsCents(
    monthIndex,
    funnel.badgesThisMonth,
    funnel.workspaceActiveSubs,
  );
  const aiDev = monthlyAiDevCostsCents(monthIndex);

  const lines: Partial<Record<string, number>> = {
    sales: funnel.membershipRevenueCents,
    sales_other: funnel.packageRevenueCents,
    workspace_saas: funnel.workspaceMrrCents,
    it_internet: MONTHLY_INTERNET_CENTS,
    hosting_saas: hosting.totalCents,
    saas_ai_dev: aiDev.totalCents,
    subscriptions: nz(45),
    insurance: nz(50.12), // monthly premium per quote 2B983105260003 ($546.72/yr if paid annually)
    accountancy: nz(200),
    marketing: nz(monthIndex < 6 ? 150 : 300),
    overheads: nz(95),
    bank_fees: stripeMerchantFeesCents(totalReceipts),
    training: nz(monthIndex < 6 ? 0 : 50),
  };

  const notes: Partial<Record<string, string>> = {
    sales: membershipSalesNote(funnel),
    sales_other: packageSalesNote(funnel),
    workspace_saas: workspaceSalesNote(funnel),
    it_internet: 'Fibre + mobile — $100/mo',
    bank_fees: 'Stripe on badge + package + workspace MRR',
    hosting_saas: hosting.summary,
    saas_ai_dev: aiDev.summary,
    subscriptions: 'GitHub, misc SaaS (~$45/mo placeholder)',
    cog_materials: 'Print / physical COG only — leave $0 unless you buy stock',
  };

  if (monthIndex < FLEXI_WAGE_DEFAULT_MONTHS) {
    lines.flexi_wage = FLEXI_WAGE_MONTHLY_CENTS;
  }

  if (monthIndex === SETUP_MONTH_INDEX) {
    lines.govt_grant = CAPITALISATION_GRANT_CENTS;
    lines.cogs_setup = GRANT_HARDWARE_CENTS;
    lines.marketing = (lines.marketing ?? 0) + SETUP_LOGO_BRAND_CENTS + SETUP_PRINT_CARDS_CENTS;
    notes.govt_grant = `Capitalisation grant $${(CAPITALISATION_GRANT_CENTS / 100).toLocaleString()}: Mac Studio $${GRANT_HARDWARE_CENTS / 100} + logo $${SETUP_LOGO_BRAND_CENTS / 100} + cards $${SETUP_PRINT_CARDS_CENTS / 100} + yr-1 insurance $${(GRANT_FIRST_YEAR_INSURANCE_CENTS / 100).toFixed(2)} + working capital reserve $${(GRANT_WORKING_CAPITAL_RESERVE_CENTS / 100).toFixed(2)}`;
    notes.cogs_setup = 'Mac Studio M3 Ultra 96GB/1TB + keyboard (quote 2B983105260003, GST-incl)';
    if (OPENING_OWNER_CAPITAL_CENTS > 0) {
      lines.other_receipts = OPENING_OWNER_CAPITAL_CENTS;
      notes.other_receipts = 'Owner capital injection (evidence: bank statement)';
    }
  }

  // Founder draws $1,000/week ($4,333/mo) every month — ~$52K/yr. Grant + working capital reserve
  // keep the bank positive through the ramp-up months without an owner cash injection.
  lines.drawings = nz(4_333);
  lines.acc_reserve = nz(90);
  lines.income_tax_reserve = monthIndex < 3 ? 0 : monthIndex < 8 ? nz(300) : nz(600);

  const staffCents = staffWagesCentsForMonth(monthIndex);
  if (staffCents > 0) {
    lines.staff_wages = staffCents;
    notes.staff_wages = staffWagesNoteForMonth(monthIndex);
  }

  if (monthIndex >= OFFICE_RENT_START_MONTH_INDEX) {
    lines.overheads = nz(2_850) + MONTHLY_OFFICE_RENT_CENTS;
    notes.overheads = `Premises: rent ~$${MONTHLY_OFFICE_RENT_CENTS / 100}/mo + power`;
  } else {
    notes.overheads = notes.overheads ?? 'Home-based year 1 — office is a year-2 consideration';
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
