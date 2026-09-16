/**
 * Every user-facing date in the app is New Zealand style: day, then month, then
 * year. Never rely on the browser locale — a visitor on a US machine would
 * otherwise read 04/09 as April 9th instead of 4 September.
 */
const NZ_LOCALE = 'en-NZ';

export type DateInput = string | number | Date | null | undefined;

/** A plain calendar date (2026-09-17) with no time part. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function format(value: DateInput, options: Intl.DateTimeFormatOptions, fallback: string): string {
  const d = toDate(value);
  if (!d) return fallback;
  // A date-only string parses as UTC midnight; pin it to UTC so a browser west of
  // Greenwich doesn't render it as the day before.
  const dateOnly = typeof value === 'string' && DATE_ONLY.test(value);
  return d.toLocaleString(NZ_LOCALE, dateOnly ? { ...options, timeZone: 'UTC' } : options);
}

/** 17/09/2026 */
export function formatNzDate(value: DateInput, fallback = '—'): string {
  return format(value, { day: '2-digit', month: '2-digit', year: 'numeric' }, fallback);
}

/** 17 September 2026 */
export function formatNzDateLong(value: DateInput, fallback = '—'): string {
  return format(value, { day: 'numeric', month: 'long', year: 'numeric' }, fallback);
}

/** 17 Sept 2026 */
export function formatNzDateShort(value: DateInput, fallback = '—'): string {
  return format(value, { day: 'numeric', month: 'short', year: 'numeric' }, fallback);
}

/** Thursday, 17 September 2026 */
export function formatNzDateWithWeekday(value: DateInput, fallback = '—'): string {
  return format(
    value,
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    fallback,
  );
}

/** 17/09/2026, 2:30 pm */
export function formatNzDateTime(value: DateInput, fallback = '—'): string {
  return format(
    value,
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' },
    fallback,
  );
}

/** 17 Sept, 2:30 pm — for feeds where the year is implied by context. */
export function formatNzDayMonthTime(value: DateInput, fallback = '—'): string {
  return format(
    value,
    { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' },
    fallback,
  );
}
