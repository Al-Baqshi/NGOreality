/**
 * SaaS platform operating costs (NZD/month, cents).
 * Edit here when invoices change — Cash flow “Expected” is seeded from these on worksheet reset.
 */

/**
 * Monthly targets — edit these arrays to shape the 12-month forecast.
 * Pipeline: ~100 leads/day imported from registry (1,000/mo constant).
 * Badges: actual conversions from pipeline, ramping as process matures.
 */
export const MONTHLY_ONBOARD_TARGETS = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000] as const;
export const NGOs_ONBOARDED_MONTH_ONE = MONTHLY_ONBOARD_TARGETS[0];

export const MONTHLY_BADGE_TARGETS = [15, 25, 35, 45, 55, 65, 80, 95, 110, 130, 150, 200] as const;

/** $650 landing + standards builds — ramps 2→7 as pipeline grows. */
const PACKAGES_RAMP = [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7] as const;
export function packagesForMonth(monthIndex: number): number {
  return PACKAGES_RAMP[Math.min(monthIndex, PACKAGES_RAMP.length - 1)];
}

/** Display-only: approximate daily rate for UI labels. */
export const BATCH_ONBOARD_START_PER_DAY = 0.1;
export const BATCH_ONBOARD_END_PER_DAY = 5;

export interface MonthlyHostingCosts {
  vercelCents: number;
  databaseCents: number;
  resendCents: number;
  domainsCents: number;
  totalCents: number;
  summary: string;
}

export interface MonthlyAiDevCosts {
  claudeMaxCents: number;
  cursorAndApiCents: number;
  totalCents: number;
  summary: string;
}

/** Vercel + Postgres (Supabase/Neon) + Resend + domain — scales slightly with members. */
export function monthlyHostingCostsCents(
  monthIndex: number,
  badgesThisMonth: number,
  workspaceActiveSubs: number,
): MonthlyHostingCosts {
  const vercelCents = 3_500; // ~$35/mo Pro / hobby+ — monitor + web app
  const databaseCents = monthIndex < 6 ? 6_500 : monthIndex < 9 ? 9_500 : 14_000; // Supabase/Neon tier steps
  const resendCents =
    workspaceActiveSubs > 200
      ? 8_000
      : badgesThisMonth > 25
        ? 5_500
        : 2_500; // outreach + member alerts
  const domainsCents = 300;
  const totalCents = vercelCents + databaseCents + resendCents + domainsCents;
  return {
    vercelCents,
    databaseCents,
    resendCents,
    domainsCents,
    totalCents,
    summary: `Vercel ~$${vercelCents / 100} · DB ~$${databaseCents / 100} · Resend ~$${resendCents / 100} · domain`,
  };
}

/** Claude Max + Cursor/API budget to build and run the platform (not charity-facing COGS). */
export function monthlyAiDevCostsCents(monthIndex: number): MonthlyAiDevCosts {
  const claudeMaxCents = 32_000; // Claude Max ~$200/mo NZD
  const cursorAndApiCents = monthIndex < 6 ? 4_000 : 2_500;
  const totalCents = claudeMaxCents + cursorAndApiCents;
  return {
    claudeMaxCents,
    cursorAndApiCents,
    totalCents,
    summary: `Claude Max ~$${claudeMaxCents / 100}/mo · Cursor/API ~$${cursorAndApiCents / 100}`,
  };
}

/** @deprecated Use monthlyHostingCostsCents — kept for funnel notes. */
export function monthlyInfraCostsCents(
  monthIndex: number,
  badgesThisMonth: number,
  workspaceActiveSubs: number,
): { total: number; note: string } {
  const hosting = monthlyHostingCostsCents(monthIndex, badgesThisMonth, workspaceActiveSubs);
  const ai = monthlyAiDevCostsCents(monthIndex);
  return {
    total: hosting.totalCents + ai.totalCents,
    note: `${hosting.summary} · ${ai.summary}`,
  };
}
