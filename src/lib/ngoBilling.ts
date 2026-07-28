import {
  GST_PRICE_NOTE,
  GST_PRICE_SUFFIX,
  MEMBERSHIP_ANNUAL_CENTS,
  PRICING_CURRENCY,
  payableCents,
} from '../config/pricing';
import { NGO_BANK_ACCOUNT } from '../config/billing';

export function formatNzd(cents: number): string {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: PRICING_CURRENCY }).format(cents / 100);
}

/** Bare amount, e.g. "$70.00". Prefer the qualified label below on screen. */
export const MEMBERSHIP_TOP_UP_AMOUNT_LABEL = formatNzd(MEMBERSHIP_ANNUAL_CENTS);

/**
 * The amount to show a customer, always carrying its GST status —
 * e.g. "$70.00 + GST". A bare price is how a customer ends up believing a
 * number was tax-inclusive when it was not.
 */
export const MEMBERSHIP_PRICE_LABEL = `${MEMBERSHIP_TOP_UP_AMOUNT_LABEL} ${GST_PRICE_SUFFIX}`;

/** What they actually transfer today (identical until GST registration). */
export const MEMBERSHIP_PAYABLE_LABEL = formatNzd(payableCents(MEMBERSHIP_ANNUAL_CENTS));

export const MEMBERSHIP_GST_NOTE = GST_PRICE_NOTE;

export function bankTransferDetailsConfigured(): boolean {
  return Boolean(NGO_BANK_ACCOUNT.accountNumber);
}

export function bankTransferLines(): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = [
    { label: 'Account name', value: NGO_BANK_ACCOUNT.accountName },
  ];
  if (NGO_BANK_ACCOUNT.bankName) {
    lines.push({ label: 'Bank', value: NGO_BANK_ACCOUNT.bankName });
  }
  if (NGO_BANK_ACCOUNT.accountNumber) {
    lines.push({ label: 'Account number', value: NGO_BANK_ACCOUNT.accountNumber });
  }
  return lines;
}
