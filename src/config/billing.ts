/** NGO-facing bank transfer and payment method copy */

export const BANK_TRANSFER_PROCESSING_BUSINESS_DAYS = 3;

/** Approximate review window after application + payment (business days) */
export const VERIFICATION_REVIEW_BUSINESS_DAYS_LABEL = '5–10 business days';

export const NGO_BANK_ACCOUNT = {
  accountName: (import.meta.env.VITE_BANK_ACCOUNT_NAME as string | undefined)?.trim() || 'NGOreality Ltd',
  accountNumber: (import.meta.env.VITE_BANK_ACCOUNT_NUMBER as string | undefined)?.trim() || '',
  bankName: (import.meta.env.VITE_BANK_NAME as string | undefined)?.trim() || '',
};

export const STRIPE_CHECKOUT_AVAILABLE = Boolean(
  (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim(),
);

/** Airwallet — enable when API key is configured */
export const AIRWALLET_AVAILABLE = Boolean(
  (import.meta.env.VITE_AIRWALLET_ENABLED as string | undefined)?.toLowerCase() === 'true',
);
