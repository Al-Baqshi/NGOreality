/** NGOreality list prices (NZD) — adjust here for global pricing changes */

export const VERIFICATION_ANNUAL_CENTS = 5000; // $50/year — Reality Badge
export const MONITORING_MONTHLY_CENTS = 1300; // $13/month — uptime & alerts

export const PRICING_CURRENCY = 'NZD';

export const PRODUCT_LABELS = {
  verification_annual: 'Reality Badge (annual verification)',
  monitoring_monthly: 'Website monitoring (monthly)',
} as const;
