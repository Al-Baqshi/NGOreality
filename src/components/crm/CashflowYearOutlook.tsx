import { useMemo } from 'react';
import type { CashflowPeriodTotals } from '../../lib/businessCashflow';
import { formatMonthLabel } from '../../lib/businessPlan';
import { formatNzCurrency } from '../../lib/formatMoney';

export interface CashflowYearOutlookProps {
  periods: string[];
  totalsByPeriod: Record<string, CashflowPeriodTotals>;
  compact?: boolean;
}

export default function CashflowYearOutlook({ periods, totalsByPeriod, compact }: CashflowYearOutlookProps) {
  const months = useMemo(
    () =>
      periods.map((period) => {
        const t = totalsByPeriod[period];
        return {
          period,
          label: formatMonthLabel(period).replace(/\s+\d{4}$/, ''),
          receipts: t?.totalReceipts.expected ?? 0,
          expenses: t?.totalPayments.expected ?? 0,
          net: t?.netCashflow.expected ?? 0,
          closing: t?.closingBalance.expected ?? 0,
        };
      }),
    [periods, totalsByPeriod],
  );

  const year = useMemo(() => {
    let receipts = 0;
    let expenses = 0;
    let net = 0;
    for (const m of months) {
      receipts += m.receipts;
      expenses += m.expenses;
      net += m.net;
    }
    const lastClosing = months[months.length - 1]?.closing ?? 0;
    return { receipts, expenses, net, lastClosing };
  }, [months]);

  const maxBar = useMemo(
    () => Math.max(...months.map((m) => Math.max(m.receipts, m.expenses, 1)), 1),
    [months],
  );

  const profitable = year.net >= 0;

  return (
    <section className={`card-brutal overflow-hidden ${compact ? '' : 'mb-10'}`} aria-label="12-month cashflow outlook">
      <div className="bg-ink-950 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-2xs uppercase tracking-wider">Year outlook (expected)</p>
        <p className={`font-bold text-sm ${profitable ? 'text-emerald-400' : 'text-red-400'}`}>
          {profitable ? 'Forecast: profitable' : 'Forecast: cash short'} · {formatNzCurrency(year.net)}
        </p>
      </div>

      <div className={`grid gap-4 p-4 ${compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
        <OutcomeTile label="Total receipts (A)" cents={year.receipts} tone="in" />
        <OutcomeTile label="Total payments (E)" cents={year.expenses} tone="out" />
        <OutcomeTile label="12-mo net cashflow" cents={year.net} tone={profitable ? 'in' : 'out'} />
        <OutcomeTile label="Month-12 bank" cents={year.lastClosing} tone={year.lastClosing >= 0 ? 'in' : 'out'} />
      </div>

      <div className="px-4 pb-4">
        <p className="font-mono text-2xs uppercase text-ink-500 mb-3">Monthly cash in vs out (expected)</p>
        <div className="flex items-end gap-1 sm:gap-2 h-32 sm:h-40 border-b-2 border-ink-950 pb-1">
          {months.map((m) => {
            const inH = Math.max(4, Math.round((m.receipts / maxBar) * 100));
            const outH = Math.max(4, Math.round((m.expenses / maxBar) * 100));
            return (
              <div
                key={m.period}
                className="flex-1 min-w-0 flex flex-col items-center justify-end gap-0.5 group"
                title={`${formatMonthLabel(m.period)}: in ${formatNzCurrency(m.receipts)}, out ${formatNzCurrency(m.expenses)}, net ${formatNzCurrency(m.net)}`}
              >
                <div className="w-full flex items-end justify-center gap-px h-full max-h-[120px]">
                  <div
                    className="w-[42%] bg-emerald-500 border border-emerald-800"
                    style={{ height: `${inH}%` }}
                    aria-hidden
                  />
                  <div
                    className="w-[42%] bg-red-500 border border-red-900"
                    style={{ height: `${outH}%` }}
                    aria-hidden
                  />
                </div>
                <span className="font-mono text-[9px] sm:text-2xs text-ink-500 truncate w-full text-center mt-1">
                  {m.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-4 mt-3 font-mono text-2xs text-ink-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 bg-emerald-500 border border-emerald-800" /> Cash in (receipts)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 bg-red-500 border border-red-900" /> Cash out (all payments)
          </span>
        </div>
        {!compact && (
          <p className="mt-4 text-xs text-ink-600 leading-relaxed border-t border-ink-100 pt-3">
            <strong>Operating profit</strong> is receipts minus business expenses only. <strong>Net cashflow</strong> also
            removes drawings, GST to IRD, and tax/ACC reserves — that is what most founders watch for “can I pay myself
            and keep the lights on?”
          </p>
        )}
      </div>
    </section>
  );
}

function OutcomeTile({
  label,
  cents,
  tone,
}: {
  label: string;
  cents: number;
  tone: 'in' | 'out';
}) {
  const color = tone === 'in' ? 'text-emerald-700' : 'text-red-700';
  return (
    <div className="min-w-0 border border-ink-100 p-3 bg-ink-50/50">
      <p className="font-mono text-2xs uppercase text-ink-500 leading-snug">{label}</p>
      <p className={`stat-value-currency mt-1 ${color}`}>{formatNzCurrency(cents, { compact: true })}</p>
      <p className="font-mono text-2xs text-ink-400 mt-1 truncate" title={formatNzCurrency(cents)}>
        {formatNzCurrency(cents)}
      </p>
    </div>
  );
}
