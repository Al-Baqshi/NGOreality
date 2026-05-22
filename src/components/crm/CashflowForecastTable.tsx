import { Fragment, useMemo, useState, type ReactNode } from 'react';
import {
  ALL_CASHFLOW_LINES,
  CASHFLOW_SECTION_LABELS,
  FLEXI_WAGE_DEFAULT_MONTHS,
  FLEXI_WAGE_MONTHLY_CENTS,
  UNIT_DERIVED_LINE_KEYS,
  type CashflowLineDef,
  type CashflowSection,
} from '../../config/businessPlanRef';
import { CASHFLOW_UNIT_ROWS, computeAllMonthFunnels } from '../../config/salesFunnelModel';
import type { BusinessCashflowLine, CashflowPeriodTotals } from '../../lib/businessCashflow';
import { sumLineAcrossPeriods } from '../../lib/businessCashflow';
import type { CashflowUnitGrid } from '../../lib/businessCashflowUnits';
import { sumUnitAcrossPeriods } from '../../lib/businessCashflowUnits';
import { formatMonthLabel } from '../../lib/businessPlan';

type CashflowGrid = Record<string, Record<string, BusinessCashflowLine>>;

function formatCount(n: number) {
  return n > 0 ? n.toLocaleString('en-NZ') : '—';
}

function unitExpectedClass(): string {
  return 'text-sky-900 font-semibold';
}

function unitActualClass(expected: number, actual: number): string {
  if (!actual) return 'text-ink-300';
  if (actual >= expected) return 'text-emerald-700 font-semibold';
  return 'text-amber-800 font-semibold';
}

function formatCents(cents: number) {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function moneyCellClass(section: CashflowSection, cents: number): string {
  if (!cents) return 'text-ink-300';
  if (section === 'receipt') return 'text-emerald-700 font-semibold';
  return 'text-red-700 font-semibold';
}

function sectionHeaderClass(section: CashflowSection): string {
  if (section === 'receipt') return 'bg-emerald-50 text-emerald-900';
  return 'bg-red-50 text-red-900';
}

function FormulaCells({
  periods,
  values,
  className = '',
  valueClass,
}: {
  periods: string[];
  values: (period: string) => { expected: number; actual: number };
  className?: string;
  valueClass?: (expected: number, actual: number) => string;
}) {
  const total = periods.reduce(
    (acc, p) => {
      const v = values(p);
      return { expected: acc.expected + v.expected, actual: acc.actual + v.actual };
    },
    { expected: 0, actual: 0 },
  );
  return (
    <>
      {periods.flatMap((period) => {
        const v = values(period);
        const vc = valueClass?.(v.expected, v.actual) ?? '';
        return [
          <td
            key={`${period}-e`}
            className={`p-2 text-right font-mono text-2xs border-l ${className} ${vc}`}
          >
            {formatCents(v.expected)}
          </td>,
          <td key={`${period}-a`} className={`p-2 text-right font-mono text-2xs ${className} ${vc}`}>
            {formatCents(v.actual)}
          </td>,
        ];
      })}
      <td className={`p-2 text-right font-mono text-2xs border-l bg-ink-50/50 ${className}`}>
        {formatCents(total.expected)}
      </td>
      <td className={`p-2 text-right font-mono text-2xs bg-ink-50/50 ${className}`}>
        {formatCents(total.actual)}
      </td>
    </>
  );
}

export interface CashflowForecastTableProps {
  periods: string[];
  grid: CashflowGrid;
  unitGrid: CashflowUnitGrid;
  totalsByPeriod: Record<string, CashflowPeriodTotals>;
  loading: boolean;
  onSaveLine: (
    period: string,
    def: CashflowLineDef,
    field: 'expected' | 'actual',
    dollars: number,
  ) => void | Promise<void>;
  onSaveUnit: (
    period: string,
    unitKey: string,
    field: 'expected' | 'actual',
    count: number,
  ) => void | Promise<void>;
}

export default function CashflowForecastTable({
  periods,
  grid,
  unitGrid,
  totalsByPeriod,
  loading,
  onSaveLine,
  onSaveUnit,
}: CashflowForecastTableProps) {
  const [editing, setEditing] = useState<{
    kind: 'money' | 'unit';
    period: string;
    lineKey: string;
    field: 'expected' | 'actual';
  } | null>(null);
  const [editValue, setEditValue] = useState('');

  const funnels = useMemo(() => computeAllMonthFunnels(periods.length), [periods.length]);

  const renderUnitRow = (unitKey: string, sublabel?: string) => {
    const def = CASHFLOW_UNIT_ROWS.find((d) => d.key === unitKey);
    if (!def) return null;
    const totalExp = sumUnitAcrossPeriods(periods, unitGrid, unitKey, 'expected_count');
    const totalAct = sumUnitAcrossPeriods(periods, unitGrid, unitKey, 'actual_count');

    return (
      <tr key={unitKey} className="border-b border-ink-50 bg-sky-50/30">
        <td className="p-2 pl-4 text-xs sticky left-0 bg-sky-50/30 max-w-[260px]">
          {def.label}
          {sublabel && <span className="block font-mono text-2xs text-ink-500 mt-0.5">{sublabel}</span>}
        </td>
        {periods.map((period) => {
          const row = unitGrid[period]?.[unitKey];
          const cells: { field: 'expected' | 'actual'; count: number }[] = [
            { field: 'expected', count: row?.expected_count ?? 0 },
            { field: 'actual', count: row?.actual_count ?? 0 },
          ];
          return cells.map((cell) => {
            const isEd =
              editing?.kind === 'unit' &&
              editing.period === period &&
              editing.lineKey === unitKey &&
              editing.field === cell.field;
            const cls =
              cell.field === 'expected'
                ? unitExpectedClass()
                : unitActualClass(row?.expected_count ?? 0, cell.count);
            const splitBg =
              cell.field === 'expected' ? 'bg-sky-100/70 border-sky-200' : 'bg-white border-sky-100';
            return (
              <td
                key={`${period}-${unitKey}-${cell.field}`}
                className={`p-1 text-right font-mono text-2xs border-l ${splitBg} ${cls}`}
              >
                {isEd ? (
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const n = parseInt(editValue, 10);
                        if (!Number.isNaN(n)) onSaveUnit(period, unitKey, cell.field, n);
                        setEditing(null);
                      }
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    onBlur={() => {
                      const n = parseInt(editValue, 10);
                      if (!Number.isNaN(n)) onSaveUnit(period, unitKey, cell.field, n);
                      setEditing(null);
                    }}
                    autoFocus
                    className="w-16 border border-ink-950 px-1 text-right"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing({ kind: 'unit', period, lineKey: unitKey, field: cell.field });
                      setEditValue(String(cell.count));
                    }}
                    className="w-full py-1 hover:bg-sky-100/80 min-h-[32px]"
                    title={
                      cell.field === 'actual' && cell.count
                        ? `Δ ${cell.count - (row?.expected_count ?? 0)} vs expected`
                        : 'Click to edit'
                    }
                  >
                    {formatCount(cell.count)}
                  </button>
                )}
              </td>
            );
          });
        })}
        <td className={`p-2 text-right font-mono text-2xs border-l bg-sky-100/40 ${unitExpectedClass()}`}>
          {formatCount(totalExp)}
        </td>
        <td className={`p-2 text-right font-mono text-2xs bg-sky-100/40 ${unitActualClass(totalExp, totalAct)}`}>
          {formatCount(totalAct)}
        </td>
      </tr>
    );
  };

  const renderLineRow = (def: CashflowLineDef) => {
    const unitDerivedExpected = (UNIT_DERIVED_LINE_KEYS as readonly string[]).includes(def.key);
    const readOnlyActual = def.paymentActualKey === 'sales';
    const rowNote = periods.map((p) => grid[p]?.[def.key]?.notes).find((n) => n && n.length > 0);
    const totalExp = sumLineAcrossPeriods(periods, grid, def.key, 'expected_cents');
    const totalAct = sumLineAcrossPeriods(periods, grid, def.key, 'actual_cents');
    const isFlexiDefault =
      def.key === 'flexi_wage' &&
      periods.slice(0, FLEXI_WAGE_DEFAULT_MONTHS).some((p) => {
        const row = grid[p]?.[def.key];
        return (row?.expected_cents ?? 0) === FLEXI_WAGE_MONTHLY_CENTS;
      });

    return (
      <tr key={def.key} className="border-b border-ink-50">
        <td className="p-2 pl-4 text-xs sticky left-0 bg-white max-w-[260px]">
          {def.label}
          {isFlexiDefault && (
            <span className="block font-mono text-2xs text-teal">$2,400/mo (months 1–{FLEXI_WAGE_DEFAULT_MONTHS})</span>
          )}
          {unitDerivedExpected && (
            <span className="block font-mono text-2xs text-sky-700 mt-0.5">↳ from volume units above</span>
          )}
          {rowNote && (
            <span className="block font-mono text-2xs text-ink-500 mt-0.5 leading-snug">{rowNote}</span>
          )}
        </td>
        {periods.map((period) => {
          const row = grid[period]?.[def.key];
          const cells: { field: 'expected' | 'actual'; cents: number; ro?: boolean }[] = [
            { field: 'expected', cents: row?.expected_cents ?? 0, ro: unitDerivedExpected },
            { field: 'actual', cents: row?.actual_cents ?? 0, ro: readOnlyActual },
          ];
          return cells.map((cell) => {
            const isEd =
              editing?.kind === 'money' &&
              editing.period === period &&
              editing.lineKey === def.key &&
              editing.field === cell.field;
            return (
              <td
                key={`${period}-${def.key}-${cell.field}`}
                className={`p-1 text-right font-mono text-2xs border-l border-ink-50 ${
                  cell.ro ? 'text-teal bg-teal/5' : moneyCellClass(def.section, cell.cents)
                }`}
              >
                {isEd ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const n = parseFloat(editValue);
                        if (!Number.isNaN(n)) onSaveLine(period, def, cell.field, n);
                        setEditing(null);
                      }
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    onBlur={() => {
                      const n = parseFloat(editValue);
                      if (!Number.isNaN(n)) onSaveLine(period, def, cell.field, n);
                      setEditing(null);
                    }}
                    autoFocus
                    className="w-20 border border-ink-950 px-1 text-right"
                  />
                ) : (
                  <button
                    type="button"
                    disabled={cell.ro}
                    onClick={() => {
                      if (cell.ro) return;
                      setEditing({ kind: 'money', period, lineKey: def.key, field: cell.field });
                      setEditValue((cell.cents / 100).toString());
                    }}
                    className={`w-full py-1 ${cell.ro ? 'cursor-default' : 'hover:bg-ink-50'}`}
                    title={
                      cell.ro && unitDerivedExpected && cell.field === 'expected'
                        ? 'Edit badges / packages / workspace units above'
                        : cell.ro
                          ? 'From CRM payments (formula)'
                          : 'Click to edit'
                    }
                  >
                    {cell.cents ? formatCents(cell.cents) : '—'}
                  </button>
                )}
              </td>
            );
          });
        })}
        <td
          className={`p-2 text-right font-mono text-2xs border-l bg-ink-50/30 ${moneyCellClass(def.section, totalExp)}`}
        >
          {formatCents(totalExp)}
        </td>
        <td className={`p-2 text-right font-mono text-2xs bg-ink-50/30 ${moneyCellClass(def.section, totalAct)}`}>
          {formatCents(totalAct)}
        </td>
      </tr>
    );
  };

  const formulaRow = (
    label: string,
    pick: (t: CashflowPeriodTotals) => { expected: number; actual: number },
    opts?: { bold?: boolean; tone?: 'in' | 'out' | 'net' },
  ) => {
    const bold = opts?.bold ?? false;
    const tone = opts?.tone ?? 'net';
    const valueClass = (expected: number, actual: number) => {
      const v = expected || actual;
      if (tone === 'in') return v > 0 ? 'text-emerald-800 font-bold' : 'text-ink-300';
      if (tone === 'out') return v > 0 ? 'text-red-800 font-bold' : 'text-ink-300';
      if (expected >= 0) return expected > 0 ? 'text-emerald-800 font-bold' : 'text-red-800 font-bold';
      return 'text-red-800 font-bold';
    };
    return (
      <tr className={bold ? 'bg-ink-100 font-bold border-t-2 border-ink-950' : 'bg-ink-50/80 font-semibold'}>
        <td className={`p-2 pl-4 font-mono text-2xs uppercase sticky left-0 ${bold ? 'bg-ink-100' : 'bg-ink-50/80'}`}>
          {label}
        </td>
        <FormulaCells
          periods={periods}
          values={(p) => pick(totalsByPeriod[p])}
          className={bold ? 'bg-ink-100' : ''}
          valueClass={valueClass}
        />
      </tr>
    );
  };

  const sections: { section: CashflowSection; after?: ReactNode }[] = [
    { section: 'receipt', after: formulaRow('(A) Total receipts', (t) => t.totalReceipts, { bold: true, tone: 'in' }) },
    { section: 'expense_gst', after: formulaRow('(B) Sub-total expenses (GST)', (t) => t.subtotalExpenseGst, { tone: 'out' }) },
    {
      section: 'expense_non_gst',
      after: (
        <>
          {formulaRow('Sub-total non-GST expenses', (t) => t.subtotalExpenseNonGst)}
          {formulaRow('(C) Total expenses', (t) => t.totalExpenses, { bold: true, tone: 'out' })}
        </>
      ),
    },
    {
      section: 'other_payment',
      after: (
        <>
          {formulaRow('Total other payments', (t) => t.totalOtherPayments, { tone: 'out' })}
          {formulaRow('(E) Total payments', (t) => t.totalPayments, { bold: true, tone: 'out' })}
        </>
      ),
    },
  ];

  if (loading) {
    return <p className="p-8 text-center text-sm text-ink-400">Loading…</p>;
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1 sm:mx-0 sm:px-0">
      <table className="w-full text-sm min-w-[640px] sm:min-w-[800px]">
        <thead>
          <tr className="border-b-3 border-ink-950 font-mono text-2xs uppercase tracking-wider text-left">
            <th className="p-2 sm:p-3 sticky left-0 bg-white z-10 min-w-[140px] max-w-[200px]">Line</th>
            {periods.map((p) => (
              <th key={p} colSpan={2} className="p-3 text-center border-l border-ink-100">
                {formatMonthLabel(p)}
              </th>
            ))}
            <th colSpan={2} className="p-3 text-center border-l-3 border-ink-950 bg-ink-50">
              TOTAL
            </th>
          </tr>
          <tr className="border-b border-ink-100 font-mono text-2xs text-ink-400">
            <th className="p-2 sticky left-0 bg-white z-10" />
            {periods.map((p) => (
              <Fragment key={p}>
                <th className="p-2 text-right border-l border-ink-100">Exp</th>
                <th className="p-2 text-right">Act</th>
              </Fragment>
            ))}
            <th className="p-2 text-right border-l-3 border-ink-950 bg-ink-50">Exp</th>
            <th className="p-2 text-right bg-ink-50">Act</th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-sky-100 text-sky-950 border-b border-sky-300">
            <td className="p-2 font-mono text-2xs uppercase font-semibold sticky left-0 bg-sky-100 z-10">
              Volume (units)
            </td>
            {periods.map((p) => (
              <Fragment key={`vol-h-${p}`}>
                <td className="p-1 text-right font-mono text-2xs uppercase text-sky-800 bg-sky-200/60 border-l border-sky-300">
                  Exp
                </td>
                <td className="p-1 text-right font-mono text-2xs uppercase text-sky-900 bg-white border-l border-sky-200">
                  Act
                </td>
              </Fragment>
            ))}
            <td className="p-1 text-right font-mono text-2xs uppercase text-sky-800 bg-sky-200/60 border-l-3 border-sky-400">
              Exp
            </td>
            <td className="p-1 text-right font-mono text-2xs uppercase text-sky-900 bg-white">Act</td>
          </tr>
          <tr className="bg-sky-50 text-sky-900 border-b-2 border-sky-300">
            <td colSpan={1 + periods.length * 2 + 2} className="p-2 pl-4 font-mono text-2xs">
              Batch ramp 5 → 100 NGOs/day · sky = expected · white = actual (daily roll-up later)
            </td>
          </tr>
          {renderUnitRow(
            'ngos_batch',
            `Batch/day ${funnels[0]?.batchPerDay.toFixed(1)} → ${funnels[funnels.length - 1]?.batchPerDay.toFixed(0)}`,
          )}
          {renderUnitRow('badges', '$100/yr membership each')}
          {renderUnitRow('packages', '$650 package each')}
          {renderUnitRow('workspace_new', 'New paying orgs (prior month batch × 75%)')}
          {renderUnitRow('workspace_active', 'Cumulative subscribers (3% churn)')}
          <tr className="bg-sky-50/50 border-b border-ink-200">
            <td colSpan={1 + periods.length * 2 + 2} className="p-2 font-mono text-2xs text-ink-500">
              Actual column: enter totals as you go (daily log roll-up later). Green = at/above expected.
            </td>
          </tr>
          <tr className="bg-emerald-50/80 border-b-2 border-emerald-200">
            <td colSpan={1 + periods.length * 2 + 2} className="p-2 pl-4 font-mono text-2xs text-emerald-900">
              ↓ Receipts — expected $ recalculates from units (more badges / packages / subs → higher (A) total below)
            </td>
          </tr>
          {sections.map(({ section, after }) => (
            <Fragment key={section}>
              <tr className={sectionHeaderClass(section)}>
                <td colSpan={1 + periods.length * 2 + 2} className="p-2 font-mono text-2xs uppercase font-semibold">
                  {CASHFLOW_SECTION_LABELS[section]}
                </td>
              </tr>
              {ALL_CASHFLOW_LINES.filter((l) => l.section === section).map(renderLineRow)}
              {after}
            </Fragment>
          ))}
          <tr className="bg-ink-950 text-white">
            <td colSpan={1 + periods.length * 2 + 2} className="p-2 font-mono text-2xs uppercase font-semibold">
              Calculated (Excel formulas)
            </td>
          </tr>
          {formulaRow('Operating profit (A − C)', (t) => t.operatingProfit, { tone: 'net' })}
          {formulaRow('Net cashflow (A − E)', (t) => t.netCashflow, { bold: true, tone: 'net' })}
          {formulaRow('Opening bank balance', (t) => t.openingBalance)}
          {formulaRow('Closing bank balance', (t) => t.closingBalance, { bold: true, tone: 'net' })}
        </tbody>
      </table>
      <p className="p-3 font-mono text-2xs text-ink-500 border-t border-ink-100">
        Formulas: (A)=Σ receipts · (B)=Σ GST expenses · (C)=(B)+non-GST · (E)=(C)+other payments · Net=(A)−(E) ·
        Volume: sky = expected units · actual editable per month. Cash: green in · red out. Edit any cell to save.
      </p>
    </div>
  );
}
