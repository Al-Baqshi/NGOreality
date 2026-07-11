/** NGOreality list prices (NZD) — NZ launch; adjust for global later */

/** Annual membership: Reality Badge + 12 months monitoring + down alerts */
export const MEMBERSHIP_ANNUAL_CENTS = 7_000; // $70/year

export const PRICING_CURRENCY = 'NZD';

/** @deprecated Use MEMBERSHIP_ANNUAL_CENTS — kept for legacy payment rows */
export const VERIFICATION_ANNUAL_CENTS = MEMBERSHIP_ANNUAL_CENTS;

/** @deprecated Monitoring is included in membership — legacy rows only */
export const MONITORING_MONTHLY_CENTS = 1300;

export const MEMBERSHIP_LABEL =
  'NGOreality membership — Reality Badge, public trust review, ~daily website checks, reports, and email if your site looks down';

export const PRODUCT_LABELS = {
  membership_annual: MEMBERSHIP_LABEL,
  verification_annual: 'Reality Badge (legacy annual)',
  monitoring_monthly: 'Monitoring only (legacy monthly)',
} as const;
