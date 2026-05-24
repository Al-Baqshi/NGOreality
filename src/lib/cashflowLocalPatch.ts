import { ALL_CASHFLOW_LINES } from '../config/businessPlanRef';
import type { BusinessCashflowLine } from './businessCashflow';
import type { BusinessCashflowUnit, CashflowUnitGrid } from './businessCashflowUnits';
import { deriveExpectedLinesFromUnits, isUnitDerivedLineKey, unitCountsFromGridRow } from './cashflowFromUnits';

function upsertByPeriodKey<T extends { period: string }>(
  rows: T[],
  key: (row: T) => string,
  next: T,
): T[] {
  const k = key(next);
  const i = rows.findIndex((r) => key(r) === k);
  if (i >= 0) {
    const copy = [...rows];
    copy[i] = { ...copy[i], ...next };
    return copy;
  }
  return [...rows, next];
}

export function patchStoredUnit(
  stored: BusinessCashflowUnit[],
  input: Omit<BusinessCashflowUnit, 'id'> & { id?: string },
): BusinessCashflowUnit[] {
  return upsertByPeriodKey(stored, (r) => `${r.period}:${r.unit_key}`, input);
}

export function patchStoredLine(stored: BusinessCashflowLine[], line: BusinessCashflowLine): BusinessCashflowLine[] {
  return upsertByPeriodKey(stored, (r) => `${r.period}:${r.line_key}`, line);
}

/** Recompute unit-derived expected $ in memory (same rules as the live grid). */
export function patchDerivedLinesForPeriod(
  lines: BusinessCashflowLine[],
  period: string,
  monthIndex: number,
  unitGrid: CashflowUnitGrid,
): BusinessCashflowLine[] {
  const derived = deriveExpectedLinesFromUnits(
    unitCountsFromGridRow(unitGrid[period], 'expected_count'),
    monthIndex,
  );
  let next = lines;
  for (const def of ALL_CASHFLOW_LINES) {
    if (!isUnitDerivedLineKey(def.key)) continue;
    const existing = next.find((l) => l.period === period && l.line_key === def.key);
    next = patchStoredLine(next, {
      id: existing?.id,
      period,
      line_key: def.key,
      section: def.section,
      label: def.label,
      expected_cents: derived.lines[def.key] ?? 0,
      actual_cents: existing?.actual_cents ?? 0,
      notes: derived.notes[def.key] ?? existing?.notes ?? '',
    });
  }
  return next;
}
