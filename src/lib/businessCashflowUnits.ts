import { supabase } from './supabase';
import { computeAllMonthFunnels } from '../config/salesFunnelModel';
import { CASHFLOW_UNIT_ROWS } from '../config/salesFunnelModel';
import { explainSchemaError } from './businessCashflow';

function throwIfSchemaError(error: { message?: string }): void {
  const hint = explainSchemaError(error.message ?? '');
  if (hint) throw new Error(hint);
  throw error;
}

export interface BusinessCashflowUnit {
  id?: string;
  period: string;
  unit_key: string;
  label: string;
  expected_count: number;
  actual_count: number;
  notes: string;
}

export type CashflowUnitGrid = Record<string, Record<string, BusinessCashflowUnit>>;

export async function fetchCashflowUnits(periods: string[]): Promise<BusinessCashflowUnit[]> {
  if (periods.length === 0) return [];
  const { data, error } = await supabase.from('business_cashflow_units').select('*').in('period', periods);
  if (error) throwIfSchemaError(error);
  return (data ?? []) as BusinessCashflowUnit[];
}

function forecastExpectedUnits(monthIndex: number, unitKey: string, monthCount: number): number {
  const funnel = computeAllMonthFunnels(monthCount)[monthIndex];
  if (!funnel) return 0;
  return funnel.units[unitKey as keyof typeof funnel.units] ?? 0;
}

/** Merge DB units with funnel defaults when no row saved. */
export function buildUnitGrid(periods: string[], stored: BusinessCashflowUnit[]): CashflowUnitGrid {
  const monthCount = periods.length;
  const grid: CashflowUnitGrid = {};

  for (const period of periods) {
    const monthIndex = periods.indexOf(period);
    grid[period] = {};
    for (const def of CASHFLOW_UNIT_ROWS) {
      const row = stored.find((s) => s.period === period && s.unit_key === def.key);
      const expected_count =
        row !== undefined ? row.expected_count : forecastExpectedUnits(monthIndex, def.key, monthCount);
      grid[period][def.key] = {
        id: row?.id,
        period,
        unit_key: def.key,
        label: def.label,
        expected_count,
        actual_count: row?.actual_count ?? 0,
        notes: row?.notes ?? '',
      };
    }
  }
  return grid;
}

export async function upsertCashflowUnit(input: {
  period: string;
  unit_key: string;
  label: string;
  expected_count: number;
  actual_count: number;
  notes?: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('business_cashflow_units').upsert(
    {
      period: input.period,
      unit_key: input.unit_key,
      label: input.label,
      expected_count: Math.round(input.expected_count),
      actual_count: Math.round(input.actual_count),
      notes: input.notes ?? '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'period,unit_key' },
  );
  if (error) {
    const hint = explainSchemaError(error.message ?? '');
    return { error: hint ?? error.message ?? 'Save failed' };
  }
  return { error: null };
}

/** Persist funnel expected units; leaves actual_count at 0 unless already set. */
export async function applyUnitForecastDefaults(
  periods: string[],
  existing: BusinessCashflowUnit[],
): Promise<{ error: string | null }> {
  const monthCount = periods.length;
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const funnel = computeAllMonthFunnels(monthCount)[i];
    if (!funnel) continue;

    for (const def of CASHFLOW_UNIT_ROWS) {
      const prev = existing.find((r) => r.period === period && r.unit_key === def.key);
      const { error } = await upsertCashflowUnit({
        period,
        unit_key: def.key,
        label: def.label,
        expected_count: funnel.units[def.key as keyof typeof funnel.units] ?? 0,
        actual_count: prev?.actual_count ?? 0,
      });
      if (error) return { error };
    }
  }
  return { error: null };
}

export function sumUnitAcrossPeriods(
  periods: string[],
  grid: CashflowUnitGrid,
  unitKey: string,
  field: 'expected_count' | 'actual_count',
): number {
  return periods.reduce((sum, p) => sum + (grid[p]?.[unitKey]?.[field] ?? 0), 0);
}
