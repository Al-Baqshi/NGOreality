/** NGOreality list prices (NZD) — NZ launch; adjust for global later */

/**
 * GST
 * ---
 * All list prices below are **GST-EXCLUSIVE**, and this matters more than it
 * looks.
 *
 * Baqshi Limited is not yet GST registered, so no GST is charged today and a
 * customer pays exactly the list price. Registration becomes compulsory once
 * turnover passes NZ$60,000 in any 12 months (Goods and Services Tax Act 1985,
 * s 51). At that point every sale must include GST.
 *
 * If prices had been advertised as GST-INCLUSIVE, crossing that threshold would
 * mean either absorbing the 15% — turning a $70 membership into $60.87 of
 * revenue — or raising prices on every existing customer at once. Quoting
 * exclusive from day one avoids both: the number simply gains "+ GST" and the
 * customer, who is almost always a GST-registered charity claiming it straight
 * back, is indifferent.
 *
 * Flip GST_REGISTERED to true on the day registration takes effect. Nothing
 * else needs to change.
 */
export const GST_RATE = 0.15;

export const GST_REGISTERED = false;

/** Turnover at which GST registration becomes compulsory in NZ. */
export const GST_REGISTRATION_THRESHOLD_CENTS = 6_000_000; // $60,000

/** Annual membership: Reality Badge + 12 months monitoring + down alerts */
export const MEMBERSHIP_ANNUAL_CENTS = 7_000; // $70/year, excl GST

export const PRICING_CURRENCY = 'NZD';

/** GST component of a GST-exclusive amount. Zero until registered. */
export function gstOnCents(exclusiveCents: number): number {
  if (!GST_REGISTERED) return 0;
  return Math.round(exclusiveCents * GST_RATE);
}

/** What the customer actually pays today. */
export function payableCents(exclusiveCents: number): number {
  return exclusiveCents + gstOnCents(exclusiveCents);
}

/**
 * Suffix for a displayed price, so no screen ever shows a bare number that a
 * customer could reasonably read as tax-inclusive when it is not.
 */
export const GST_PRICE_SUFFIX = GST_REGISTERED ? 'incl. GST' : '+ GST';

/**
 * One-line explanation to sit under a price. Says plainly that no GST is being
 * charged right now, which is what a treasurer needs to know to reconcile the
 * payment against the invoice.
 */
export const GST_PRICE_NOTE = GST_REGISTERED
  ? 'Prices include GST. Baqshi Limited is GST registered.'
  : 'Prices exclude GST. Baqshi Limited is not currently GST registered, so no GST is charged — you pay exactly the amount shown. GST will be added once we are registered.';

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
