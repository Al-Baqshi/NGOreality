import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { SectionHeader } from '../../components/ui';
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
  recentMonthKeys,
  upsertTarget,
} from '../../lib/businessPlan';

const MONTHS_WINDOW = 6;

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
  if (metric === 'expense_cents') return actual <= expected; // lower is better
  return actual >= expected;
}

export default function BusinessPlan() {
  const periods = useMemo(() => recentMonthKeys(MONTHS_WINDOW), []);
  const currentPeriod = useMemo(() => currentMonthKey(), []);

  const [targets, setTargets] = useState<TargetMap>({});
  const [actuals, setActuals] = useState<ActualMap>({});
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [loading, setLoading] = useState(true);
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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, a, e] = await Promise.all([
        fetchTargets(periods),
        fetchActuals(periods),
        fetchRecentExpenses(50),
      ]);
      setTargets(indexTargets(t));
      setActuals(indexActuals(a));
      setExpenses(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load business plan');
    } finally {
      setLoading(false);
    }
  }, [periods]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
    if (err) {
      setError(err);
      return;
    }
    setEditing(null);
    setEditValue('');
    refresh();
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
    if (err) {
      setError(err);
      return;
    }
    setNewExpense({
      incurred_on: new Date().toISOString().slice(0, 10),
      category: '',
      amount: '',
      vendor: '',
      notes: '',
    });
    refresh();
  };

  const handleDeleteExpense = async (id: string) => {
    const { error: err } = await deleteExpense(id);
    if (err) {
      setError(err);
      return;
    }
    refresh();
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
      const actual = actualForMetric(metric, periodActual);
      if (isTargetMet(metric, t.expected_value, actual)) met++;
    }
    return { met, total };
  }, [targets, actuals, currentPeriod]);

  return (
    <div className="max-w-6xl mx-auto">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 mb-6"
      >
        <ArrowLeft size={14} /> Dashboard
      </Link>

      <SectionHeader>Business plan</SectionHeader>
      <p className="font-mono text-2xs text-ink-500 -mt-4 mb-6">
        Monthly cash flow: expected vs actual. Revenue is read from the payments ledger; record expenses below.
      </p>

      {error && (
        <div className="border-2 border-accent bg-accent-light text-accent px-4 py-3 mb-6 font-mono text-2xs">
          {error}
        </div>
      )}

      {/* Header: current-month scorecard */}
      <div className="card-brutal p-6 mb-8">
        <div className="font-mono text-2xs uppercase tracking-wider text-ink-500 mb-1">
          {formatMonthLabel(currentPeriod)}
        </div>
        <div className="text-3xl font-semibold">
          {currentScore.total === 0 ? (
            <span className="text-ink-400">No targets set for this month</span>
          ) : (
            <>
              {currentScore.met}/{currentScore.total}{' '}
              <span className="text-ink-500 text-base font-normal">targets met</span>
            </>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="card-brutal overflow-hidden mb-12">
        {loading ? (
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
                    <td className="p-3 font-medium align-top">
                      {BUSINESS_PLAN_METRIC_LABELS[metric]}
                    </td>
                    {periods.map((period) => {
                      const target = targets[period]?.[metric];
                      const actual = actualForMetric(metric, actuals[period]);
                      const expected = target?.expected_value ?? 0;
                      const delta = actual - expected;
                      const met = expected > 0 && isTargetMet(metric, expected, actual);
                      const isEditing = editing?.metric === metric && editing.period === period;

                      const displayedExpected = MONEY_METRICS.has(metric)
                        ? (expected / 100).toString()
                        : expected.toString();

                      return (
                        <td key={period} className="p-3 align-top whitespace-nowrap text-right">
                          {isEditing ? (
                            <div className="flex items-center gap-1 justify-end">
                              <input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveTarget();
                                  if (e.key === 'Escape') setEditing(null);
                                }}
                                autoFocus
                                className="w-24 border-2 border-ink-950 px-2 py-1 text-right font-mono text-xs"
                                placeholder={MONEY_METRICS.has(metric) ? '$' : '#'}
                              />
                              <button
                                onClick={handleSaveTarget}
                                className="border-2 border-ink-950 bg-ink-950 text-white font-mono text-2xs uppercase px-2 py-1"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditing({ metric, period });
                                setEditValue(displayedExpected);
                              }}
                              className="text-left w-full hover:bg-ink-50 -m-1 p-1"
                              title="Click to set target"
                            >
                              <div className="font-mono text-2xs text-ink-500 text-right">
                                target {expected > 0 ? formatMetricValue(metric, expected) : '—'}
                              </div>
                              <div className="text-right font-semibold">{formatMetricValue(metric, actual)}</div>
                              {expected > 0 && (
                                <div
                                  className={`font-mono text-2xs text-right ${
                                    met ? 'text-teal' : 'text-accent'
                                  }`}
                                >
                                  {formatMetricDelta(metric, delta)}
                                </div>
                              )}
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

      {/* Expenses */}
      <SectionHeader>Expenses</SectionHeader>

      <form onSubmit={handleAddExpense} className="card-brutal p-4 mb-6 grid gap-3 md:grid-cols-6">
        <input
          type="date"
          value={newExpense.incurred_on}
          onChange={(e) => setNewExpense({ ...newExpense, incurred_on: e.target.value })}
          className="border-2 border-ink-950 px-3 py-2 text-sm"
          required
        />
        <input
          type="text"
          value={newExpense.category}
          onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
          placeholder="Category (e.g. hosting)"
          className="border-2 border-ink-950 px-3 py-2 text-sm md:col-span-2"
          required
        />
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={newExpense.amount}
          onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
          placeholder="NZD"
          className="border-2 border-ink-950 px-3 py-2 text-sm"
          required
        />
        <input
          type="text"
          value={newExpense.vendor}
          onChange={(e) => setNewExpense({ ...newExpense, vendor: e.target.value })}
          placeholder="Vendor (optional)"
          className="border-2 border-ink-950 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={savingExpense}
          className="border-2 border-ink-950 bg-ink-950 text-white font-mono text-2xs uppercase tracking-wider px-3 py-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Plus size={14} /> Add
        </button>
      </form>

      <div className="card-brutal overflow-hidden">
        {expenses.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-400">No expenses recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-3 border-ink-950 font-mono text-2xs uppercase tracking-wider text-left">
                  <th className="p-3">Date</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Vendor</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3">Notes</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {expenses.map((x) => (
                  <tr key={x.id}>
                    <td className="p-3 font-mono text-2xs whitespace-nowrap">{x.incurred_on}</td>
                    <td className="p-3">{x.category}</td>
                    <td className="p-3 text-ink-500">{x.vendor || '—'}</td>
                    <td className="p-3 text-right font-mono">
                      {new Intl.NumberFormat('en-NZ', {
                        style: 'currency',
                        currency: x.currency || 'NZD',
                      }).format(x.amount_cents / 100)}
                    </td>
                    <td className="p-3 text-ink-500 text-xs">{x.notes || '—'}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDeleteExpense(x.id)}
                        className="text-ink-400 hover:text-accent"
                        title="Delete expense"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
