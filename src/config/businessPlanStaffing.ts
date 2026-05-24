/**
 * Staffing assumptions for business plan narrative + cashflow forecast.
 * Wages: ~$1,500–$2,000/week per employee (midpoint used in forecast).
 */

export const STAFF_WEEKLY_WAGE_LOW_NZD = 1_500;
export const STAFF_WEEKLY_WAGE_HIGH_NZD = 2_000;
/** Planning midpoint (~$7,583/mo per full-time employee). */
export const STAFF_WEEKLY_WAGE_MID_NZD = 1_750;

export const STAFF_MONTHLY_WAGE_MID_NZD = Math.round((STAFF_WEEKLY_WAGE_MID_NZD * 52) / 12);

export const STAFF_MONTHLY_WAGE_MID_CENTS = STAFF_MONTHLY_WAGE_MID_NZD * 100;

/** No staff in year 1 — founder-operated. First hire is a year-2 consideration. */
export const FIRST_STAFF_HIRE_MONTH_INDEX = 12;
/** Month 11 (index 10): review point for conditional second hire. */
export const SECOND_STAFF_HIRE_MONTH_INDEX = 10;
export const STAFFING_REVIEW_MONTH_INDEX = 10;

/** Year 1 max — second hire is conditional on revenue tracking. */
export const MAX_TEAM_YEAR_ONE = 2;

export interface StaffingMonthPlan {
  monthNumber: number;
  headcount: number;
  wagesMonthlyNzd: number;
  summary: string;
}

export const STAFFING_TIMELINE: StaffingMonthPlan[] = [
  {
    monthNumber: 7,
    headcount: 1,
    wagesMonthlyNzd: STAFF_MONTHLY_WAGE_MID_NZD,
    summary:
      'First employee (outreach / delivery support) after 6 months of founder-led pipeline building. Flexi-Wage has funded the founder through month 6.',
  },
  {
    monthNumber: 11,
    headcount: 1,
    wagesMonthlyNzd: STAFF_MONTHLY_WAGE_MID_NZD,
    summary:
      'Review point: assess whether workspace MRR and badge volume justify a second hire. Year-1 forecast holds at one employee; second is conditional on revenue.',
  },
];

export function staffHeadcountForMonth(monthIndex: number): number {
  if (monthIndex < FIRST_STAFF_HIRE_MONTH_INDEX) return 0;
  return 1;
}

export function staffWagesCentsForMonth(monthIndex: number): number {
  return staffHeadcountForMonth(monthIndex) * STAFF_MONTHLY_WAGE_MID_CENTS;
}

export function staffWagesNoteForMonth(monthIndex: number): string {
  const n = staffHeadcountForMonth(monthIndex);
  if (n === 0) return 'Founder only (Flexi-Wage)';
  const band = `$${STAFF_WEEKLY_WAGE_LOW_NZD.toLocaleString()}–$${STAFF_WEEKLY_WAGE_HIGH_NZD.toLocaleString()}/wk`;
  const total = `$${((n * STAFF_MONTHLY_WAGE_MID_NZD) / 1000).toFixed(1)}k/mo`;
  if (monthIndex === STAFFING_REVIEW_MONTH_INDEX) {
    return `${n} staff · ${band} · ${total} — review 2nd hire`;
  }
  return `${n} staff · ${band} · ${total} (payroll)`;
}

export const STAFFING_PLAN_SUMMARY =
  `Founder-operated year 1 — no staff on payroll. Founder draws $1,000/week plus Flexi-Wage ($2,400/mo for 6 months). First hire is a year-2 consideration when premises and AU expansion justify it. All outreach, delivery, and support handled by founder with AI-powered automation.`;
