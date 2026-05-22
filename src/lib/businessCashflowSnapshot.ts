import { ALL_CASHFLOW_LINES } from '../config/businessPlanRef';
import {
  applyLinkedCashflowForecast,
  buildCashflowGrid,
  computeAllPeriodTotals,
  fetchCashflowLines,
  sumTotalsAcrossPeriods,
  type CashflowPeriodTotals,
} from './businessCashflow';
import { buildUnitGrid, fetchCashflowUnits } from './businessCashflowUnits';
import { fetchActuals } from './businessPlan';
import { forecastMonthKeys } from './businessPlan';

export interface CashflowYearSnapshot {
  periods: string[];
  totalsByPeriod: Record<string, CashflowPeriodTotals>;
  yearReceiptsExpected: number;
  yearOperatingExpected: number;
  yearNetExpected: number;
  month12ClosingExpected: number;
  loading: boolean;
  error: string | null;
}

export async function loadCashflowYearSnapshot(monthCount = 12): Promise<Omit<CashflowYearSnapshot, 'loading'>> {
  const periods = forecastMonthKeys(monthCount);
  const [lines, units, actuals] = await Promise.all([
    fetchCashflowLines(periods),
    fetchCashflowUnits(periods),
    fetchActuals(periods),
  ]);

  const actualMap: Record<string, import('../types').BusinessPlanActual | undefined> = {};
  for (const a of actuals) actualMap[a.period] = a;

  let unitGrid = buildUnitGrid(periods, units);
  const expectedLineCount = periods.length * ALL_CASHFLOW_LINES.length;
  const hasUnits = units.length >= periods.length * 5;

  if (lines.length < expectedLineCount * 0.4 || !hasUnits) {
    await applyLinkedCashflowForecast(periods, units);
    const [lines2, units2] = await Promise.all([fetchCashflowLines(periods), fetchCashflowUnits(periods)]);
    unitGrid = buildUnitGrid(periods, units2);
    const grid = buildCashflowGrid(periods, lines2, actualMap, unitGrid);
    const totals = computeAllPeriodTotals(periods, grid);
    return rollup(periods, totals);
  }

  const grid = buildCashflowGrid(periods, lines, actualMap, unitGrid);
  const totals = computeAllPeriodTotals(periods, grid);
  return rollup(periods, totals);
}

function rollup(
  periods: string[],
  totals: Record<string, CashflowPeriodTotals>,
): Omit<CashflowYearSnapshot, 'loading'> {
  const receipts = sumTotalsAcrossPeriods(periods, totals, (t) => t.totalReceipts);
  const operating = sumTotalsAcrossPeriods(periods, totals, (t) => t.operatingProfit);
  const net = sumTotalsAcrossPeriods(periods, totals, (t) => t.netCashflow);
  const last = periods[periods.length - 1];
  const closing = last ? totals[last]?.closingBalance.expected ?? 0 : 0;

  return {
    periods,
    totalsByPeriod: totals,
    yearReceiptsExpected: receipts.expected,
    yearOperatingExpected: operating.expected,
    yearNetExpected: net.expected,
    month12ClosingExpected: closing,
    error: null,
  };
}
