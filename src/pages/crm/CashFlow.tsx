import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, Plus, Trash2 } from 'lucide-react';
import CashflowForecastTable from '../../components/crm/CashflowForecastTable';
import CashflowFunnelSummary from '../../components/crm/CashflowFunnelSummary';
import CashflowNzGuide from '../../components/crm/CashflowNzGuide';
import CashflowYearOutlook from '../../components/crm/CashflowYearOutlook';
import { MetricCard, SectionHeader } from '../../components/ui';
import { formatNzCurrency } from '../../lib/formatMoney';
import { CASHFLOW_UNIT_ROWS, batchRampLabel } from '../../config/salesFunnelModel';
import { ALL_CASHFLOW_LINES, EXPENSE_CATEGORY_OPTIONS } from '../../config/businessPlanRef';
import {
  applyLinkedCashflowForecast,
  buildCashflowGrid,
  computeAllPeriodTotals,
  downloadCashflowCsv,
  exportCashflowCsv,
  fetchCashflowLines,
  syncDerivedLinesForPeriod,
  upsertCashflowLine,
  withManualCashflowActual,
  type BusinessCashflowLine,
} from '../../lib/businessCashflow';
import {
  buildUnitGrid,
  fetchCashflowUnits,
  upsertCashflowUnit,
  type BusinessCashflowUnit,
} from '../../lib/businessCashflowUnits';
import {
  BUSINESS_PLAN_METRIC_LABELS,
  BUSINESS_PLAN_METRIC_ORDER,
  MONEY_METRICS,
  type BusinessExpense,
  type BusinessPlanActual,
  type BusinessPlanMetric,
  type BusinessPlanTarget,
} from '../../types';
import {
  actualForMetric,
  currentMonthKey,
  deleteExpense,
  fetchActuals,
  fetchRecentExpenses,
  fetchTargets,
  formatMetricDelta,
  formatMetricValue,
  formatMonthLabel,
  insertExpense,
  forecastMonthKeys,
  upsertTarget,
} from '../../lib/businessPlan';
import { downloadCashflowExcel } from '../../lib/businessCashflowExcel';
import { patchDerivedLinesForPeriod, patchStoredLine, patchStoredUnit } from '../../lib/cashflowLocalPatch';

const MONTHS_WINDOW = 12;

type TargetMap = Record<string, Record<BusinessPlanMetric, BusinessPlanTarget | undefined>>;
type ActualMap = Record<string, BusinessPlanActual | undefined>;

function indexTargets(rows: BusinessPlanTarget[]): TargetMap {
  const out: TargetMap = {};
  for (const t of rows) {
    if (!out[t.period]) out[t.period] = {} as Record<BusinessPlanMetric, BusinessPlanTarget | undefined>;
    out[t.period][t.metric] = t;
  }
  return out;
}

function indexActuals(rows: BusinessPlanActual[]): ActualMap {
  const out: ActualMap = {};
  for (const a of rows) out[a.period] = a;
  return out;
}

function isTargetMet(metric: BusinessPlanMetric, expected: number, actual: number): boolean {
  if (expected <= 0) return false;
  if (metric === 'expense_cents') return actual <= expected;
  return actual >= expected;
}

export default function CashFlow() {
  const periods = useMemo(() => forecastMonthKeys(MONTHS_WINDOW), []);
  const currentPeriod = useMemo(() => currentMonthKey(), []);

  const [targets, setTargets] = useState<TargetMap>({});
  const [actuals, setActuals] = useState<ActualMap>({});
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<{ metric: BusinessPlanMetric; period: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const [newExpense, setNewExpense] = useState({
    incurred_on: new Date().toISOString().slice(0, 10),
    category: '',
    amount: '',
    vendor: '',
    notes: '',
  });
  const [savingExpense, setSavingExpense] = useState(false);

  const [cashflowStored, setCashflowStored] = useState<BusinessCashflowLine[]>([]);
  const [unitsStored, setUnitsStored] = useState<BusinessCashflowUnit[]>([]);
  const [savingWorksheet, setSavingWorksheet] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const worksheetFilled = useRef(false);

  const refresh = useCallback(async (opts?: { showSpinner?: boolean }) => {
    if (opts?.showSpinner !== false) setPageLoading(true);
    setError(null);
    try {
      const [t, a, e, cf, units] = await Promise.all([
        fetchTargets(periods),
        fetchActuals(periods),
        fetchRecentExpenses(50),
        fetchCashflowLines(periods),
        fetchCashflowUnits(periods),
      ]);
      setTargets(indexTargets(t));
      setActuals(indexActuals(a));
      setExpenses(e);
      setCashflowStored(cf);
      setUnitsStored(units);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cash flow');
    } finally {
      setPageLoading(false);
    }
  }, [periods]);

  useEffect(() => {
    void refresh({ showSpinner: true });
  }, [refresh]);

  /** Persist pre-filled expected column to DB on first visit (so exports and reloads match the grid). */
  useEffect(() => {
    if (pageLoading || worksheetFilled.current || periods.length === 0) return;
    const expectedLineCount = periods.length * ALL_CASHFLOW_LINES.length;
    const expectedUnitCount = periods.length * CASHFLOW_UNIT_ROWS.length;
    const hasWorkspaceLine = cashflowStored.some(
      (r) => r.line_key === 'workspace_saas' && r.expected_cents > 0,
    );
    const hasUnits = unitsStored.length >= expectedUnitCount;
    if (cashflowStored.length >= expectedLineCount && hasWorkspaceLine && hasUnits) return;

    worksheetFilled.current = true;
    setSavingWorksheet(true);
    (async () => {
      const res = await applyLinkedCashflowForecast(periods, unitsStored);
      if (res.error) setError(res.error);
      else await refresh({ showSpinner: false });
    })().finally(() => setSavingWorksheet(false));
  }, [pageLoading, cashflowStored.length, unitsStored.length, periods, refresh]);

  const handleSaveTarget = async () => {
    if (!editing) return;
    const numeric = parseFloat(editValue);
    if (Number.isNaN(numeric)) return;
    const value = MONEY_METRICS.has(editing.metric) ? Math.round(numeric * 100) : Math.round(numeric);
    const { error: err } = await upsertTarget({
      period: editing.period,
      metric: editing.metric,
      expected_value: value,
    });
    if (err) setError(err);
    else {
      setEditing(null);
      setEditValue('');
      setTargets((prev) => {
        const next = { ...prev };
        if (!next[editing.period]) next[editing.period] = {} as TargetMap[string];
        next[editing.period] = {
          ...next[editing.period],
          [editing.metric]: {
            ...(next[editing.period]?.[editing.metric] ?? {
              id: '',
              period: editing.period,
              metric: editing.metric,
              notes: '',
              created_at: '',
              updated_at: '',
            }),
            expected_value: value,
          },
        };
        return next;
      });
    }
  };

  const handleAddExpense = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const amount = parseFloat(newExpense.amount);
    if (!newExpense.category.trim() || Number.isNaN(amount) || amount <= 0) return;
    setSavingExpense(true);
    const { error: err } = await insertExpense({
      incurred_on: newExpense.incurred_on,
      category: newExpense.category,
      amount_cents: Math.round(amount * 100),
      vendor: newExpense.vendor,
      notes: newExpense.notes,
    });
    setSavingExpense(false);
    if (err) setError(err);
    else {
      setNewExpense({
        incurred_on: new Date().toISOString().slice(0, 10),
        category: '',
        amount: '',
        vendor: '',
        notes: '',
      });
      void refresh({ showSpinner: false });
    }
  };

  const handleDeleteExpense = async (id: string) => {
    const { error: err } = await deleteExpense(id);
    if (err) setError(err);
    else {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const unitGrid = useMemo(
    () => buildUnitGrid(periods, unitsStored),
    [periods, unitsStored],
  );

  const cashflowGrid = useMemo(
    () => buildCashflowGrid(periods, cashflowStored, actuals, unitGrid),
    [periods, cashflowStored, actuals, unitGrid],
  );

  const cashflowTotals = useMemo(
    () => computeAllPeriodTotals(periods, cashflowGrid),
    [periods, cashflowGrid],
  );

  const handleSaveCashflowLine = async (
    period: string,
    def: (typeof ALL_CASHFLOW_LINES)[number],
    field: 'expected' | 'actual',
    dollars: number,
  ) => {
    const cents = Math.round(dollars * 100);
    const row = cashflowGrid[period]?.[def.key];
    const notes =
      field === 'actual' && def.paymentActualKey === 'sales'
        ? withManualCashflowActual(row?.notes)
        : row?.notes;
    const expected_cents = field === 'expected' ? cents : (row?.expected_cents ?? 0);
    const actual_cents = field === 'actual' ? cents : (row?.actual_cents ?? 0);

    setCashflowStored((prev) =>
      patchStoredLine(prev, {
        id: row?.id,
        period,
        line_key: def.key,
        section: def.section,
        label: def.label,
        expected_cents,
        actual_cents,
        notes: notes ?? '',
      }),
    );

    const { error: err } = await upsertCashflowLine({
      period,
      def,
      expected_cents,
      actual_cents,
      notes,
    });
    if (err) {
      setError(err);
      void refresh({ showSpinner: false });
    }
  };

  const handleSaveUnit = async (
    period: string,
    unitKey: string,
    field: 'expected' | 'actual',
    count: number,
  ) => {
    const def = CASHFLOW_UNIT_ROWS.find((d) => d.key === unitKey);
    if (!def) return;
    const row = unitGrid[period]?.[unitKey];
    const expected_count = field === 'expected' ? count : (row?.expected_count ?? 0);
    const actual_count = field === 'actual' ? count : (row?.actual_count ?? 0);
    const monthIndex = periods.indexOf(period);

    const nextUnits = patchStoredUnit(unitsStored, {
      id: row?.id,
      period,
      unit_key: unitKey,
      label: def.label,
      expected_count,
      actual_count,
      notes: row?.notes ?? '',
    });
    setUnitsStored(nextUnits);

    if (field === 'expected') {
      const nextUnitGrid = buildUnitGrid(periods, nextUnits);
      setCashflowStored((prev) => patchDerivedLinesForPeriod(prev, period, monthIndex, nextUnitGrid));
    }

    const nextUnitGrid = buildUnitGrid(periods, nextUnits);
    const unitErr = await upsertCashflowUnit({
      period,
      unit_key: unitKey,
      label: def.label,
      expected_count,
      actual_count,
      notes: row?.notes,
    });
    if (unitErr.error) {
      setError(unitErr.error);
      void refresh({ showSpinner: false });
      return;
    }
    if (field === 'expected') {
      const syncErr = await syncDerivedLinesForPeriod(period, monthIndex, nextUnitGrid);
      if (syncErr.error) {
        setError(syncErr.error);
        void refresh({ showSpinner: false });
      }
    }
  };

  const handleResetWorksheet = async () => {
    setSavingWorksheet(true);
    const res = await applyLinkedCashflowForecast(periods, unitsStored);
    setSavingWorksheet(false);
    if (res.error) setError(res.error);
    else await refresh({ showSpinner: false });
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    setError(null);
    try {
      const y = periods[0]?.slice(0, 4) ?? 'forecast';
      await downloadCashflowExcel(
        periods,
        cashflowGrid,
        cashflowTotals,
        unitGrid,
        `ngoreality-cashflow-${y}.xlsx`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Excel export failed');
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportCsv = () => {
    const csv = exportCashflowCsv(periods, cashflowGrid, cashflowTotals, unitGrid);
    const y = periods[0]?.slice(0, 4) ?? 'forecast';
    downloadCashflowCsv(csv, `ngoreality-cashflow-${y}.csv`);
  };

  const currentScore = useMemo(() => {
    const periodTargets = targets[currentPeriod];
    const periodActual = actuals[currentPeriod];
    if (!periodTargets) return { met: 0, total: 0 };
    let met = 0;
    let total = 0;
    for (const metric of BUSINESS_PLAN_METRIC_ORDER) {
      const t = periodTargets[metric];
      if (!t || t.expected_value <= 0) continue;
      total++;
      if (isTargetMet(metric, t.expected_value, actualForMetric(metric, periodActual))) met++;
    }
    return { met, total };
  }, [targets, actuals, currentPeriod]);

  const yearRollup = useMemo(() => {
    let netExp = 0;
    let netAct = 0;
    let receiptsExp = 0;
    let opExp = 0;
    let closingExp = 0;
    for (const p of periods) {
      const t = cashflowTotals[p];
      if (!t) continue;
      netExp += t.netCashflow.expected;
      netAct += t.netCashflow.actual;
      receiptsExp += t.totalReceipts.expected;
      opExp += t.operatingProfit.expected;
      closingExp = t.closingBalance.expected;
    }
    return { netExp, netAct, receiptsExp, opExp, closingExp };
  }, [periods, cashflowTotals]);

  return (
    <div className="max-w-[90rem] mx-auto min-w-0 w-full">
      <Link
        to="/plan"
        className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 mb-2"
      >
        <ArrowLeft size={14} /> Business plan
      </Link>

      <SectionHeader>Cash flow</SectionHeader>
      <p className="font-mono text-2xs text-ink-500 -mt-4 mb-4 max-w-3xl leading-relaxed">
        Units first ({batchRampLabel()}), then <span className="text-emerald-700">green</span> receipt lines and{' '}
        <span className="text-red-700">red</span> costs. Workspace SaaS from month 2 ($25 admin + $15/user/mo).{' '}
        <Link to="/plan" className="underline hover:text-ink-950">Business plan</Link>.
        {savingWorksheet && <span className="block mt-2 text-teal">Saving worksheet…</span>}
      </p>

      <CashflowNzGuide />

      <CashflowFunnelSummary periods={periods} totalsByPeriod={cashflowTotals} />

      {error && (
        <div className="border-2 border-accent bg-accent-light text-accent px-4 py-3 mb-6 font-mono text-2xs">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4 mb-8">
        <MetricCard
          label="12-mo receipts (expected)"
          value={formatNzCurrency(yearRollup.receiptsExp)}
          sub="From volume units → green lines"
          currency
          accent
        />
        <MetricCard
          label="Operating profit (expected)"
          value={formatNzCurrency(yearRollup.opExp)}
          sub="(A) − (C) trading result"
          currency
        />
        <MetricCard
          label="12-mo net cashflow (expected)"
          value={formatNzCurrency(yearRollup.netExp)}
          sub={yearRollup.netExp >= 0 ? 'Profit after reserves' : 'Loss — review costs'}
          currency
        />
        <MetricCard
          label="Closing bank (month 12 exp)"
          value={formatNzCurrency(yearRollup.closingExp)}
          sub="End balance in bank"
          currency
        />
        <MetricCard
          label={`${formatMonthLabel(currentPeriod)} KPIs`}
          value={currentScore.total === 0 ? '—' : `${currentScore.met}/${currentScore.total} met`}
          sub="Membership targets"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={handleResetWorksheet}
          disabled={savingWorksheet || pageLoading}
          className="btn-brutal-outline text-2xs py-2 px-3 disabled:opacity-50"
        >
          {savingWorksheet ? 'Saving…' : 'Reset expected column to defaults'}
        </button>
        <button
          type="button"
          onClick={() => void handleExportExcel()}
          disabled={pageLoading || exportingExcel}
          className="btn-brutal-teal text-2xs py-2 px-3 inline-flex items-center gap-1.5 disabled:opacity-50 min-h-[44px]"
        >
          <Download size={14} /> {exportingExcel ? 'Building…' : 'Download Excel'}
        </button>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={pageLoading}
          className="btn-brutal-outline text-2xs py-2 px-3 inline-flex items-center gap-1.5 disabled:opacity-50 min-h-[44px]"
        >
          Export CSV
        </button>
      </div>

      <div className="card-brutal overflow-hidden mb-12">
        <CashflowForecastTable
          periods={periods}
          grid={cashflowGrid}
          unitGrid={unitGrid}
          totalsByPeriod={cashflowTotals}
          loading={pageLoading}
          onSaveLine={handleSaveCashflowLine}
          onSaveUnit={handleSaveUnit}
        />
      </div>

      <CashflowYearOutlook periods={periods} totalsByPeriod={cashflowTotals} />

      <SectionHeader>Membership KPIs</SectionHeader>
      <div className="card-brutal overflow-hidden mb-12">
        {pageLoading ? (
          <p className="p-8 text-center text-sm text-ink-400">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-3 border-ink-950 font-mono text-2xs uppercase tracking-wider text-left">
                  <th className="p-3">Metric</th>
                  {periods.map((p) => (
                    <th key={p} className="p-3 text-right whitespace-nowrap">
                      {formatMonthLabel(p)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {BUSINESS_PLAN_METRIC_ORDER.map((metric) => (
                  <tr key={metric}>
                    <td className="p-3 font-medium">{BUSINESS_PLAN_METRIC_LABELS[metric]}</td>
                    {periods.map((period) => {
                      const target = targets[period]?.[metric];
                      const actual = actualForMetric(metric, actuals[period]);
                      const expected = target?.expected_value ?? 0;
                      const isEditing = editing?.metric === metric && editing.period === period;
                      const displayedExpected = MONEY_METRICS.has(metric)
                        ? (expected / 100).toString()
                        : expected.toString();
                      return (
                        <td key={period} className="p-3 text-right whitespace-nowrap">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveTarget();
                                if (e.key === 'Escape') setEditing(null);
                              }}
                              onBlur={handleSaveTarget}
                              autoFocus
                              className="w-24 border-2 border-ink-950 px-2 py-1 text-right font-mono text-xs"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditing({ metric, period });
                                setEditValue(displayedExpected);
                              }}
                              className="hover:bg-ink-50 -m-1 p-1 w-full"
                            >
                              <div className="font-mono text-2xs text-ink-500">
                                {expected > 0 ? formatMetricValue(metric, expected) : '—'}
                              </div>
                              <div className="font-semibold">{formatMetricValue(metric, actual)}</div>
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SectionHeader>Expenses</SectionHeader>
      <form onSubmit={handleAddExpense} className="card-brutal p-4 mb-6 grid gap-3 md:grid-cols-6">
        <input
          type="date"
          value={newExpense.incurred_on}
          onChange={(e) => setNewExpense({ ...newExpense, incurred_on: e.target.value })}
          className="border-2 border-ink-950 px-3 py-2 text-sm min-h-[44px]"
          required
        />
        <select
          value={newExpense.category}
          onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
          className="border-2 border-ink-950 px-3 py-2 text-sm md:col-span-2 min-h-[44px]"
          required
        >
          <option value="">Category</option>
          {EXPENSE_CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={newExpense.amount}
          onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
          placeholder="NZD"
          className="border-2 border-ink-950 px-3 py-2 text-base min-h-[44px]"
          required
        />
        <input
          type="text"
          value={newExpense.vendor}
          onChange={(e) => setNewExpense({ ...newExpense, vendor: e.target.value })}
          placeholder="Vendor"
          className="border-2 border-ink-950 px-3 py-2 text-sm min-h-[44px]"
        />
        <button
          type="submit"
          disabled={savingExpense}
          className="border-2 border-ink-950 bg-ink-950 text-white font-mono text-2xs uppercase px-3 py-2 min-h-[44px] inline-flex items-center justify-center gap-1.5"
        >
          <Plus size={14} /> Add
        </button>
      </form>

      <div className="card-brutal overflow-hidden">
        {expenses.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-400">No expenses recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-3 border-ink-950 font-mono text-2xs uppercase text-left">
                <th className="p-3">Date</th>
                <th className="p-3">Category</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {expenses.map((x) => (
                <tr key={x.id}>
                  <td className="p-3 font-mono text-2xs">{x.incurred_on}</td>
                  <td className="p-3">{x.category}</td>
                  <td className="p-3 text-right font-mono">
                    {new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(x.amount_cents / 100)}
                  </td>
                  <td className="p-3 text-right">
                    <button type="button" onClick={() => handleDeleteExpense(x.id)} className="text-ink-400 hover:text-accent p-2">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
