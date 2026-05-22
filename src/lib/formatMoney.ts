export function formatNzCurrency(
  cents: number,
  opts?: { maximumFractionDigits?: number; compact?: boolean },
): string {
  const dollars = cents / 100;
  if (opts?.compact && Math.abs(dollars) >= 1_000_000) {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(dollars);
  }
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    maximumFractionDigits: opts?.maximumFractionDigits ?? 0,
  }).format(dollars);
}
