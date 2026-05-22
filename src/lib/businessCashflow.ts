import { supabase } from './supabase';
import {
  buildAucklandForecastMonths,
  forecastExpectedForLine,
} from '../config/cashflowAssumptions';
import {
  ALL_CASHFLOW_LINES,
  CASHFLOW_RECEIPT_LINES,
  FLEXI_WAGE_DEFAULT_MONTHS,
  FLEXI_WAGE_MONTHLY_CENTS,
  type CashflowLineDef,
  type CashflowSection,
} from '../config/businessPlanRef';
import { CASHFLOW_UNIT_ROWS } from '../config/salesFunnelModel';
import {
  deriveExpectedLinesFromUnits,
  isUnitDerivedLineKey,
  unitCountsFromGridRow,
} from './cashflowFromUnits';
import {
  applyUnitForecastDefaults,
  buildUnitGrid,
  fetchCashflowUnits,
  type BusinessCashflowUnit,
  type CashflowUnitGrid,
} from './businessCashflowUnits';
import type { BusinessPlanActual } from '../types';

export interface BusinessCashflowLine {
  id?: string;
  period: string;
  line_key: string;
  section: CashflowSection;
  label: string;
  expected_cents: number;
  actual_cents: number;
  notes: string;
}

/** Excel-style formula results per month (ref/Cashflow Forecasting Template.xlsx). */
export interface CashflowPeriodTotals {
  /** (A) Total receipts — sum of all receipt lines */
  totalReceipts: { expected: number; actual: number };
  /** (B) Sub-total expenses (GST lines only) */
  subtotalExpenseGst: { expected: number; actual: number };
  /** Sub-total non-GST expenses */
  subtotalExpenseNonGst: { expected: number; actual: number };
  /** (C) Total expenses = (B) + non-GST subtotal */
  totalExpenses: { expected: number; actual: number };
  /** Sum of other-payment lines (GST to IRD, drawings, tax/ACC reserves) */
  totalOtherPayments: { expected: number; actual: number };
  /** (E) Total payments = (C) + other payments */
  totalPayments: { expected: number; actual: number };
  /** Operating result before drawings/tax reserves: (A) − (C) */
  operatingProfit: { expected: number; actual: number };
  /** Net cashflow: (A) − (E) */
  netCashflow: { expected: number; actual: number };
  /** Opening bank balance (prior month closing) */
  openingBalance: { expected: number; actual: number };
  /** Closing bank balance: opening + net cashflow */
  closingBalance: { expected: number; actual: number };
}

export function salesActualCents(actual: BusinessPlanActual | undefined): number {
  return actual?.total_revenue_cents ?? 0;
}

/** PostgREST error when a migration was added locally but not applied to the linked Supabase project. */
export function explainSchemaError(message: string): string | null {
  const missingTable = /Could not find the table ['"]?public\.(\w+)['"]?/i.exec(message);
  if (missingTable) {
    return (
      `Database table "${missingTable[1]}" is missing on your Supabase project. ` +
      `Apply pending migrations (see supabase/migrations/) then reload. ` +
      `From the repo: npx supabase db push — or ask the agent to apply via Supabase MCP.`
    );
  }
  if (message.includes('schema cache')) {
    return `Supabase schema is out of date: ${message}. Apply migrations to project cpbilbskfbzqlynjhdvm and hard-refresh.`;
  }
  return null;
}

export function throwIfSchemaError(error: { message?: string }): void {
  const msg = error.message ?? '';
  const hint = explainSchemaError(msg);
  if (hint) throw new Error(hint);
  throw error;
}

export async function fetchCashflowLines(periods: string[]): Promise<BusinessCashflowLine[]> {
  if (periods.length === 0) return [];
  const { data, error } = await supabase
    .from('business_cashflow_lines')
    .select('*')
    .in('period', periods);
  if (error) throwIfSchemaError(error);
  return (data ?? []) as BusinessCashflowLine[];
}

/** Merge DB rows with template + Auckland forecast; volume units override expected on linked receipt/cost lines. */
export function buildCashflowGrid(
  periods: string[],
  stored: BusinessCashflowLine[],
  actuals: Record<string, BusinessPlanActual | undefined>,
  unitGrid?: CashflowUnitGrid,
): Record<string, Record<string, BusinessCashflowLine>> {
  const forecastMonths = buildAucklandForecastMonths(periods.length);
  const byPeriod: Record<string, Record<string, BusinessCashflowLine>> = {};

  for (const period of periods) {
    const monthIndex = periods.indexOf(period);
    const month = forecastMonths[monthIndex];
    const periodUnits = unitGrid?.[period];
    const derivedFromUnits = periodUnits
      ? deriveExpectedLinesFromUnits(unitCountsFromGridRow(periodUnits, 'expected_count'), monthIndex)
      : null;

    byPeriod[period] = {};

    for (const def of ALL_CASHFLOW_LINES) {
      const row = stored.find((s) => s.period === period && s.line_key === def.key);
      let actual_cents = row?.actual_cents ?? 0;
      if (def.paymentActualKey === 'sales') {
        actual_cents = salesActualCents(actuals[period]);
      }

      let expected_cents = row?.expected_cents ?? 0;
      let notes = row?.notes ?? '';

      if (derivedFromUnits && isUnitDerivedLineKey(def.key)) {
        expected_cents = derivedFromUnits.lines[def.key] ?? 0;
        notes = derivedFromUnits.notes[def.key] ?? notes;
      } else if (row === undefined) {
        const forecast = forecastExpectedForLine(month, def.key);
        expected_cents = forecast.expected_cents;
        notes = forecast.notes;
      }

      byPeriod[period][def.key] = {
        id: row?.id,
        period,
        line_key: def.key,
        section: def.section,
        label: def.label,
        expected_cents,
        actual_cents,
        notes,
      };
    }
  }
  return byPeriod;
}

/** Persist unit-derived expected $ for one month (after editing volume). */
export async function syncDerivedLinesForPeriod(
  period: string,
  monthIndex: number,
  unitGrid: CashflowUnitGrid,
): Promise<{ error: string | null }> {
  const periodUnits = unitGrid[period];
  if (!periodUnits) return { error: null };
  const derived = deriveExpectedLinesFromUnits(
    unitCountsFromGridRow(periodUnits, 'expected_count'),
    monthIndex,
  );
  for (const def of ALL_CASHFLOW_LINES) {
    if (!isUnitDerivedLineKey(def.key)) continue;
    const { error } = await upsertCashflowLine({
      period,
      def,
      expected_cents: derived.lines[def.key] ?? 0,
      actual_cents: 0,
      notes: derived.notes[def.key],
    });
    if (error) return { error };
  }
  return { error: null };
}

/** Persist unit-derived expected $ so DB export matches the live worksheet. */
export async function syncDerivedLinesFromUnitGrid(
  periods: string[],
  unitGrid: CashflowUnitGrid,
): Promise<{ error: string | null }> {
  for (let i = 0; i < periods.length; i++) {
    const err = await syncDerivedLinesForPeriod(periods[i], i, unitGrid);
    if (err.error) return err;
  }
  return { error: null };
}

export function sumSection(
  period: string,
  section: CashflowSection,
  grid: Record<string, Record<string, BusinessCashflowLine>>,
  field: 'expected_cents' | 'actual_cents',
): number {
  const rows = grid[period];
  if (!rows) return 0;
  return ALL_CASHFLOW_LINES.filter((l) => l.section === section).reduce(
    (sum, l) => sum + (rows[l.key]?.[field] ?? 0),
    0,
  );
}

/** Excel formulas for one month. */
export function computePeriodTotals(
  period: string,
  grid: Record<string, Record<string, BusinessCashflowLine>>,
  opening: { expected: number; actual: number },
): CashflowPeriodTotals {
  const totalReceipts = {
    expected: sumSection(period, 'receipt', grid, 'expected_cents'),
    actual: sumSection(period, 'receipt', grid, 'actual_cents'),
  };
  const subtotalExpenseGst = {
    expected: sumSection(period, 'expense_gst', grid, 'expected_cents'),
    actual: sumSection(period, 'expense_gst', grid, 'actual_cents'),
  };
  const subtotalExpenseNonGst = {
    expected: sumSection(period, 'expense_non_gst', grid, 'expected_cents'),
    actual: sumSection(period, 'expense_non_gst', grid, 'actual_cents'),
  };
  const totalExpenses = {
    expected: subtotalExpenseGst.expected + subtotalExpenseNonGst.expected,
    actual: subtotalExpenseGst.actual + subtotalExpenseNonGst.actual,
  };
  const totalOtherPayments = {
    expected: sumSection(period, 'other_payment', grid, 'expected_cents'),
    actual: sumSection(period, 'other_payment', grid, 'actual_cents'),
  };
  const totalPayments = {
    expected: totalExpenses.expected + totalOtherPayments.expected,
    actual: totalExpenses.actual + totalOtherPayments.actual,
  };
  const operatingProfit = {
    expected: totalReceipts.expected - totalExpenses.expected,
    actual: totalReceipts.actual - totalExpenses.actual,
  };
  const netCashflow = {
    expected: totalReceipts.expected - totalPayments.expected,
    actual: totalReceipts.actual - totalPayments.actual,
  };
  const closingBalance = {
    expected: opening.expected + netCashflow.expected,
    actual: opening.actual + netCashflow.actual,
  };
  return {
    totalReceipts,
    subtotalExpenseGst,
    subtotalExpenseNonGst,
    totalExpenses,
    totalOtherPayments,
    totalPayments,
    operatingProfit,
    netCashflow,
    openingBalance: { ...opening },
    closingBalance,
  };
}

export function computeAllPeriodTotals(
  periods: string[],
  grid: Record<string, Record<string, BusinessCashflowLine>>,
): Record<string, CashflowPeriodTotals> {
  const out: Record<string, CashflowPeriodTotals> = {};
  let openingExp = 0;
  let openingAct = 0;
  for (const period of periods) {
    const totals = computePeriodTotals(period, grid, { expected: openingExp, actual: openingAct });
    out[period] = totals;
    openingExp = totals.closingBalance.expected;
    openingAct = totals.closingBalance.actual;
  }
  return out;
}

/** @deprecated Use computePeriodTotals().netCashflow */
export function netCashflowCents(
  period: string,
  grid: Record<string, Record<string, BusinessCashflowLine>>,
  field: 'expected_cents' | 'actual_cents',
): number {
  const f = field === 'expected_cents' ? 'expected' : 'actual';
  return computePeriodTotals(period, grid, { expected: 0, actual: 0 }).netCashflow[f];
}

export function sumLineAcrossPeriods(
  periods: string[],
  grid: Record<string, Record<string, BusinessCashflowLine>>,
  lineKey: string,
  field: 'expected_cents' | 'actual_cents',
): number {
  return periods.reduce((sum, p) => sum + (grid[p]?.[lineKey]?.[field] ?? 0), 0);
}

export function sumTotalsAcrossPeriods(
  periods: string[],
  totalsByPeriod: Record<string, CashflowPeriodTotals>,
  pick: (t: CashflowPeriodTotals) => { expected: number; actual: number },
): { expected: number; actual: number } {
  return periods.reduce(
    (acc, p) => {
      const v = pick(totalsByPeriod[p]);
      return { expected: acc.expected + v.expected, actual: acc.actual + v.actual };
    },
    { expected: 0, actual: 0 },
  );
}

export async function upsertCashflowLine(input: {
  period: string;
  def: CashflowLineDef;
  expected_cents: number;
  actual_cents: number;
  notes?: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('business_cashflow_lines').upsert(
    {
      period: input.period,
      line_key: input.def.key,
      section: input.def.section,
      label: input.def.label,
      expected_cents: Math.round(input.expected_cents),
      actual_cents: Math.round(input.actual_cents),
      notes: input.notes ?? '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'period,line_key' },
  );
  if (error) {
    const hint = explainSchemaError(error.message ?? '');
    return { error: hint ?? error.message ?? 'Save failed' };
  }
  return { error: null };
}

/** Persist Flexi-Wage $2,400/month for the first N months (saves to DB). */
export async function applyFlexiWageDefaults(
  periods: string[],
): Promise<{ error: string | null; months: number }> {
  const flexi = CASHFLOW_RECEIPT_LINES.find((l) => l.key === 'flexi_wage');
  if (!flexi) return { error: 'Flexi-Wage line not configured', months: 0 };
  const count = Math.min(FLEXI_WAGE_DEFAULT_MONTHS, periods.length);
  for (let i = 0; i < count; i++) {
    const { error } = await upsertCashflowLine({
      period: periods[i],
      def: flexi,
      expected_cents: FLEXI_WAGE_MONTHLY_CENTS,
      actual_cents: 0,
    });
    if (error) return { error, months: i };
  }
  return { error: null, months: count };
}

/** Persist Auckland home → office forecast (setup grant, Mac Studio, revenue ramp, hires). */
export async function applyAucklandForecastAssumptions(
  periods: string[],
): Promise<{ error: string | null; periods: number }> {
  const months = buildAucklandForecastMonths(periods.length);

  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];
    const month = months[i];
    if (!month) continue;

    for (const def of ALL_CASHFLOW_LINES) {
      const { expected_cents, notes } = forecastExpectedForLine(month, def.key);
      const { error } = await upsertCashflowLine({
        period,
        def,
        expected_cents,
        actual_cents: 0,
        notes,
      });
      if (error) return { error, periods: i };
    }
  }

  return { error: null, periods: periods.length };
}

/** Units first, then fixed costs, then receipt $ derived from volume (linked forecast). */
export async function applyLinkedCashflowForecast(
  periods: string[],
  existingUnits: BusinessCashflowUnit[],
): Promise<{ error: string | null }> {
  const unitRes = await applyUnitForecastDefaults(periods, existingUnits);
  if (unitRes.error) return unitRes;

  const lineRes = await applyAucklandForecastAssumptions(periods);
  if (lineRes.error) return lineRes;

  const units = await fetchCashflowUnits(periods);
  const unitGrid = buildUnitGrid(periods, units);
  return syncDerivedLinesFromUnitGrid(periods, unitGrid);
}

function csvEscape(cell: string | number): string {
  const s = String(cell);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Export 12-month cashflow + formula rows (Excel-compatible CSV). */
export function exportCashflowCsv(
  periods: string[],
  grid: Record<string, Record<string, BusinessCashflowLine>>,
  totalsByPeriod: Record<string, CashflowPeriodTotals>,
  unitGrid?: CashflowUnitGrid,
): string {
  const header = ['Line', ...periods.flatMap((p) => [`${p} Exp`, `${p} Act`]), 'TOTAL Exp', 'TOTAL Act'];
  const rows: string[][] = [header];

  const pushLine = (label: string, get: (p: string) => { e: number; a: number }, format: 'money' | 'count' = 'money') => {
    const cells: string[] = [label];
    let te = 0;
    let ta = 0;
    const fmt = (n: number) => (format === 'count' ? String(n) : centsToDollars(n));
    for (const p of periods) {
      const { e, a } = get(p);
      te += e;
      ta += a;
      cells.push(fmt(e), fmt(a));
    }
    cells.push(fmt(te), fmt(ta));
    rows.push(cells);
  };

  if (unitGrid) {
    rows.push(['VOLUME UNITS (expected vs actual)']);
    for (const def of CASHFLOW_UNIT_ROWS) {
      pushLine(
        def.label,
        (p) => ({
          e: unitGrid[p]?.[def.key]?.expected_count ?? 0,
          a: unitGrid[p]?.[def.key]?.actual_count ?? 0,
        }),
        'count',
      );
    }
    rows.push([]);
  }

  rows.push(['RECEIPTS']);
  for (const def of ALL_CASHFLOW_LINES.filter((l) => l.section === 'receipt')) {
    pushLine(def.label, (p) => ({
      e: grid[p]?.[def.key]?.expected_cents ?? 0,
      a: grid[p]?.[def.key]?.actual_cents ?? 0,
    }));
  }
  pushLine('(A) Total receipts', (p) => {
    const t = totalsByPeriod[p].totalReceipts;
    return { e: t.expected, a: t.actual };
  });

  rows.push(['LESS CASH PAYMENTS (GST)']);
  for (const def of ALL_CASHFLOW_LINES.filter((l) => l.section === 'expense_gst')) {
    pushLine(def.label, (p) => ({
      e: grid[p]?.[def.key]?.expected_cents ?? 0,
      a: grid[p]?.[def.key]?.actual_cents ?? 0,
    }));
  }
  pushLine('(B) Sub-total expenses (GST)', (p) => {
    const t = totalsByPeriod[p].subtotalExpenseGst;
    return { e: t.expected, a: t.actual };
  });

  rows.push(['NON-GST EXPENSES']);
  for (const def of ALL_CASHFLOW_LINES.filter((l) => l.section === 'expense_non_gst')) {
    pushLine(def.label, (p) => ({
      e: grid[p]?.[def.key]?.expected_cents ?? 0,
      a: grid[p]?.[def.key]?.actual_cents ?? 0,
    }));
  }
  pushLine('Sub-total non-GST expenses', (p) => {
    const t = totalsByPeriod[p].subtotalExpenseNonGst;
    return { e: t.expected, a: t.actual };
  });
  pushLine('(C) Total expenses', (p) => {
    const t = totalsByPeriod[p].totalExpenses;
    return { e: t.expected, a: t.actual };
  });

  rows.push(['OTHER PAYMENTS']);
  for (const def of ALL_CASHFLOW_LINES.filter((l) => l.section === 'other_payment')) {
    pushLine(def.label, (p) => ({
      e: grid[p]?.[def.key]?.expected_cents ?? 0,
      a: grid[p]?.[def.key]?.actual_cents ?? 0,
    }));
  }
  pushLine('Total other payments', (p) => {
    const t = totalsByPeriod[p].totalOtherPayments;
    return { e: t.expected, a: t.actual };
  });
  pushLine('(E) Total payments', (p) => {
    const t = totalsByPeriod[p].totalPayments;
    return { e: t.expected, a: t.actual };
  });

  rows.push(['SUMMARY']);
  pushLine('Operating profit (A − C)', (p) => {
    const t = totalsByPeriod[p].operatingProfit;
    return { e: t.expected, a: t.actual };
  });
  pushLine('Net cashflow (A − E)', (p) => {
    const t = totalsByPeriod[p].netCashflow;
    return { e: t.expected, a: t.actual };
  });
  pushLine('Opening bank balance', (p) => {
    const t = totalsByPeriod[p].openingBalance;
    return { e: t.expected, a: t.actual };
  });
  pushLine('Closing bank balance', (p) => {
    const t = totalsByPeriod[p].closingBalance;
    return { e: t.expected, a: t.actual };
  });

  return rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}

export function downloadCashflowCsv(csv: string, filename = 'ngoreality-cashflow.csv'): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
