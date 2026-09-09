import { supabase } from './supabase';
import { captureEmptyMutation, captureError } from './errorReporting';
import type {
  BusinessExpense,
  BusinessPlanActual,
  BusinessPlanMetric,
  BusinessPlanTarget,
} from '../types';
import { MONEY_METRICS } from '../types';

/** First day of a month as YYYY-MM-01 (database period key). */
export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
}

export function currentMonthKey(): string {
  const now = new Date();
  return monthKey(now.getUTCFullYear(), now.getUTCMonth());
}

/** Returns the most recent N months (inclusive of current), oldest first. */
export function recentMonthKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(monthKey(d.getUTCFullYear(), d.getUTCMonth()));
  }
  return keys;
}

/** Next N months from the current month (forward forecast), oldest first. */
export function forecastMonthKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    keys.push(monthKey(d.getUTCFullYear(), d.getUTCMonth()));
  }
  return keys;
}

export function formatMonthLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map((n) => parseInt(n, 10));
  if (!y || !m) return periodKey;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-NZ', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatMetricValue(metric: BusinessPlanMetric, value: number): string {
  if (MONEY_METRICS.has(metric)) {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: 'NZD',
      maximumFractionDigits: 0,
    }).format(value / 100);
  }
  return new Intl.NumberFormat('en-NZ').format(value);
}

export function formatMetricDelta(metric: BusinessPlanMetric, delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return `${sign}${formatMetricValue(metric, Math.abs(delta))}`;
}

/** Pull a target row's actual counterpart from a row of business_plan_actuals. */
export function actualForMetric(metric: BusinessPlanMetric, actual: BusinessPlanActual | undefined): number {
  if (!actual) return 0;
  return actual[metric] ?? 0;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function fetchTargets(periods: string[]): Promise<BusinessPlanTarget[]> {
  if (periods.length === 0) return [];
  const { data, error } = await supabase
    .from('business_plan_targets')
    .select('*')
    .in('period', periods);
  if (error) throw new Error(captureError(error, { where: 'fetchTargets' }));
  return (data ?? []) as BusinessPlanTarget[];
}

export async function fetchActuals(periods: string[]): Promise<BusinessPlanActual[]> {
  if (periods.length === 0) return [];
  const { data, error } = await supabase
    .from('business_plan_actuals')
    .select('*')
    .in('period', periods);
  if (error) throw new Error(captureError(error, { where: 'fetchActuals' }));
  return (data ?? []) as BusinessPlanActual[];
}

export async function fetchRecentExpenses(limit = 50): Promise<BusinessExpense[]> {
  const { data, error } = await supabase
    .from('business_expenses')
    .select('*')
    .order('incurred_on', { ascending: false })
    .limit(limit);
  if (error) throw new Error(captureError(error, { where: 'fetchRecentExpenses' }));
  return (data ?? []) as BusinessExpense[];
}

export async function upsertTarget(input: {
  period: string;
  metric: BusinessPlanMetric;
  expected_value: number;
  notes?: string;
}): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('business_plan_targets').upsert(
    {
      period: input.period,
      metric: input.metric,
      expected_value: Math.round(input.expected_value),
      notes: input.notes ?? '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'period,metric' },
  ).select('period');
  if (error) {
    return { error: captureError(error, { where: 'upsertTarget' }) };
  }
  if (!data?.length) {
    return { error: captureEmptyMutation('upsertTarget.empty') };
  }
  return { error: null };
}

export async function insertExpense(input: {
  incurred_on: string;
  category: string;
  amount_cents: number;
  vendor?: string;
  notes?: string;
}): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('business_expenses').insert({
    incurred_on: input.incurred_on,
    category: input.category.trim(),
    amount_cents: Math.round(input.amount_cents),
    vendor: input.vendor?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
  }).select('id');
  if (error) {
    return { error: captureError(error, { where: 'insertExpense' }) };
  }
  if (!data?.length) {
    return { error: captureEmptyMutation('insertExpense.empty') };
  }
  return { error: null };
}

export async function deleteExpense(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('business_expenses').delete().eq('id', id).select('id');
  if (error) {
    return { error: captureError(error, { where: 'deleteExpense' }) };
  }
  if (!data?.length) {
    return { error: captureEmptyMutation('deleteExpense.empty', 'The expense was not deleted. Refresh and try again.') };
  }
  return { error: null };
}
