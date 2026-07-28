/** NGO-facing bank transfer and payment method copy */

export const BANK_TRANSFER_PROCESSING_BUSINESS_DAYS = 3;

/** Approximate review window after application + payment (business days) */
export const VERIFICATION_REVIEW_BUSINESS_DAYS_LABEL = '5–10 business days';

/**
 * Where members pay their annual membership.
 *
 * These are the real defaults, not placeholders. Bank details for RECEIVING
 * money are printed on every invoice and shown to every customer — they are
 * not a secret, and gating them behind an environment variable meant a missing
 * variable silently rendered "Bank account details are being finalised" to a
 * charity that was trying to pay. That is a revenue outage caused by config.
 *
 * The env override is kept so a staging deploy can point elsewhere.
 */
export const NGO_BANK_ACCOUNT = {
  accountName:
    (import.meta.env.VITE_BANK_ACCOUNT_NAME as string | undefined)?.trim() || 'Baqshi Limited',
  accountNumber:
    (import.meta.env.VITE_BANK_ACCOUNT_NUMBER as string | undefined)?.trim() || '12-3044-0117466-00',
  bankName: (import.meta.env.VITE_BANK_NAME as string | undefined)?.trim() || 'ASB Bank',
};

/** True when we can actually tell someone where to send money. */
export const BANK_TRANSFER_AVAILABLE = Boolean(NGO_BANK_ACCOUNT.accountNumber);

export const STRIPE_CHECKOUT_AVAILABLE = Boolean(
  (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim(),
);

/** Airwallet — enable when API key is configured */
export const AIRWALLET_AVAILABLE = Boolean(
  (import.meta.env.VITE_AIRWALLET_ENABLED as string | undefined)?.toLowerCase() === 'true',
);
