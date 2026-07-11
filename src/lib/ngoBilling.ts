import { MEMBERSHIP_ANNUAL_CENTS, PRICING_CURRENCY } from '../config/pricing';
import { NGO_BANK_ACCOUNT } from '../config/billing';

export function formatNzd(cents: number): string {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: PRICING_CURRENCY }).format(cents / 100);
}

export const MEMBERSHIP_TOP_UP_AMOUNT_LABEL = formatNzd(MEMBERSHIP_ANNUAL_CENTS);

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
