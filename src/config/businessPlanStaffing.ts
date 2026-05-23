/**
 * Staffing assumptions for business plan narrative + Auckland cashflow forecast.
 * Wages: ~$1,500–$2,000/week per employee (midpoint used in forecast).
 */

export const STAFF_WEEKLY_WAGE_LOW_NZD = 1_500;
export const STAFF_WEEKLY_WAGE_HIGH_NZD = 2_000;
/** Planning midpoint (~$7,583/mo per full-time employee). */
export const STAFF_WEEKLY_WAGE_MID_NZD = 1_750;

export const STAFF_MONTHLY_WAGE_MID_NZD = Math.round((STAFF_WEEKLY_WAGE_MID_NZD * 52) / 12);

export const STAFF_MONTHLY_WAGE_MID_CENTS = STAFF_MONTHLY_WAGE_MID_NZD * 100;

/** Month 1 (index 0): first hire. Month 2 (index 1): second hire. Month 3+ documented in plan. */
export const FIRST_STAFF_HIRE_MONTH_INDEX = 0;
export const SECOND_STAFF_HIRE_MONTH_INDEX = 1;
export const STAFFING_REVIEW_MONTH_INDEX = 2;

/** Shared office / premises — larger team (up to 5) modelled from this month. */
export const PREMISES_TEAM_MONTH_INDEX = 9;

export const MAX_TEAM_WITH_PREMISES = 5;

export interface StaffingMonthPlan {
  monthNumber: number;
  headcount: number;
  wagesMonthlyNzd: number;
  summary: string;
}

export const STAFFING_TIMELINE: StaffingMonthPlan[] = [
  {
    monthNumber: 1,
    headcount: 1,
    wagesMonthlyNzd: STAFF_MONTHLY_WAGE_MID_NZD,
    summary:
      'First employee (outreach / delivery support) on wages ~$1,500–$2,000/week. Founder + Flexi-Wage + grant fund ramp.',
  },
  {
    monthNumber: 2,
    headcount: 2,
    wagesMonthlyNzd: STAFF_MONTHLY_WAGE_MID_NZD * 2,
    summary: 'Second employee — same wage band. Team handles registry outreach volume and $650 setups.',
  },
  {
    monthNumber: 3,
    headcount: 2,
    wagesMonthlyNzd: STAFF_MONTHLY_WAGE_MID_NZD * 2,
    summary:
      'Month 3: hold two staff; review pipeline and whether a third hire is justified. Payroll continues from trading income if the plan tracks.',
  },
  {
    monthNumber: 4,
    headcount: 3,
    wagesMonthlyNzd: STAFF_MONTHLY_WAGE_MID_NZD * 3,
    summary: 'Third employee if membership + package revenue supports payroll.',
  },
  {
    monthNumber: 10,
    headcount: 4,
    wagesMonthlyNzd: STAFF_MONTHLY_WAGE_MID_NZD * 4,
    summary: 'Auckland office / premises — room for a larger delivery team (four on payroll in forecast).',
  },
  {
    monthNumber: 12,
    headcount: 5,
    wagesMonthlyNzd: STAFF_MONTHLY_WAGE_MID_NZD * 5,
    summary:
      'Up to five staff when premises and revenue allow — still ~$1,500–$2,000/week each; forecast closing balance shows we can cover this if volume targets land.',
  },
];

export function staffHeadcountForMonth(monthIndex: number): number {
  if (monthIndex < FIRST_STAFF_HIRE_MONTH_INDEX) return 0;
  if (monthIndex === FIRST_STAFF_HIRE_MONTH_INDEX) return 1;
  if (monthIndex === SECOND_STAFF_HIRE_MONTH_INDEX) return 2;
  if (monthIndex === STAFFING_REVIEW_MONTH_INDEX) return 2;
  if (monthIndex < PREMISES_TEAM_MONTH_INDEX) return 3;
  if (monthIndex < PREMISES_TEAM_MONTH_INDEX + 2) return 4;
  return MAX_TEAM_WITH_PREMISES;
}

export function staffWagesCentsForMonth(monthIndex: number): number {
  return staffHeadcountForMonth(monthIndex) * STAFF_MONTHLY_WAGE_MID_CENTS;
}

export function staffWagesNoteForMonth(monthIndex: number): string {
  const n = staffHeadcountForMonth(monthIndex);
  if (n === 0) return 'Founder only';
  const band = `$${STAFF_WEEKLY_WAGE_LOW_NZD.toLocaleString()}–$${STAFF_WEEKLY_WAGE_HIGH_NZD.toLocaleString()}/wk`;
  const total = `$${((n * STAFF_MONTHLY_WAGE_MID_NZD) / 1000).toFixed(1)}k/mo`;
  if (monthIndex === STAFFING_REVIEW_MONTH_INDEX) {
    return `Month 3: ${n} staff · ${band} · ${total} — review 3rd hire`;
  }
  if (n >= MAX_TEAM_WITH_PREMISES) {
    return `${n} staff (premises) · ${band} · ${total} — plan target if revenue holds`;
  }
  if (n >= 4) {
    return `${n} staff · ${band} · ${total} — premises / shared office`;
  }
  return `${n} staff · ${band} · ${total} (payroll)`;
}

export const STAFFING_PLAN_SUMMARY =
  `Hire in months 1 and 2 (${STAFF_WEEKLY_WAGE_LOW_NZD.toLocaleString()}–$${STAFF_WEEKLY_WAGE_HIGH_NZD.toLocaleString()}/week per employee). Month 3 is the review point before adding a third role. With premises, scale toward up to ${MAX_TEAM_WITH_PREMISES} people — the 12-month cashflow shows payroll is fundable if membership and package volume meet the forecast.`;
