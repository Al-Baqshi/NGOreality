import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import CashflowYearOutlook from './CashflowYearOutlook';
import { loadCashflowYearSnapshot } from '../../lib/businessCashflowSnapshot';
import { NZ_GST_RATE_LABEL } from '../../config/nzCashflowGuide';
import { formatNzCurrency } from '../../lib/formatMoney';

/** Same 12-month numbers as Cash flow — units → receipts → profit/loss. */
export default function BusinessPlanFinancialSnapshot() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<Awaited<ReturnType<typeof loadCashflowYearSnapshot>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadCashflowYearSnapshot(12)
      .then((data) => {
        if (!cancelled) {
          setSnap(data);
          setError(data.error);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load cashflow');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="card-brutal p-6 flex items-center gap-2 text-ink-500 font-mono text-2xs">
        <Loader2 size={16} className="animate-spin" /> Loading linked cashflow…
      </div>
    );
  }

  if (error || !snap) {
    return (
      <div className="card-brutal p-6 border-l-4 border-l-accent">
        <p className="text-sm text-ink-700">{error ?? 'Cashflow not available'}</p>
        <Link to="/cash-flow" className="inline-flex items-center gap-2 mt-3 btn-brutal-outline text-2xs py-2 px-3">
          <FileSpreadsheet size={14} /> Open cash flow worksheet
        </Link>
      </div>
    );
  }

  const profitable = snap.yearNetExpected >= 0;

  return (
    <section className="card-brutal overflow-hidden border-l-4 border-l-teal mb-10" data-pdf-section>
      <div className="bg-ink-950 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-2xs uppercase tracking-wider">Financial snapshot (linked to cash flow)</p>
        <Link
          to="/cash-flow"
          className="print:hidden inline-flex items-center gap-1.5 font-mono text-2xs uppercase border border-teal text-teal px-3 py-2 min-h-[40px] hover:bg-teal/10"
        >
          <FileSpreadsheet size={14} /> Edit worksheet
        </Link>
      </div>
      <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <p className="font-mono text-2xs uppercase text-ink-500">12-mo receipts (expected)</p>
          <p className="stat-value-currency text-emerald-700 mt-1">{formatNzCurrency(snap.yearReceiptsExpected)}</p>
          <p className="text-2xs text-ink-500 mt-1">Volume units → membership, $650, workspace MRR</p>
        </div>
        <div>
          <p className="font-mono text-2xs uppercase text-ink-500">Operating profit (expected)</p>
          <p
            className={`text-xl font-bold mt-1 ${snap.yearOperatingExpected >= 0 ? 'text-emerald-700' : 'text-red-700'}`}
          >
            {formatNzCurrency(snap.yearOperatingExpected)}
          </p>
          <p className="text-2xs text-ink-500 mt-1">Receipts minus GST expenses (before drawings)</p>
        </div>
        <div>
          <p className="font-mono text-2xs uppercase text-ink-500">12-mo net cashflow (expected)</p>
          <p className={`text-xl font-bold mt-1 ${profitable ? 'text-emerald-700' : 'text-red-700'}`}>
            {formatNzCurrency(snap.yearNetExpected)}
          </p>
          <p className="text-2xs text-ink-500 mt-1">
            {profitable ? 'Forecast: profitable after all payments' : 'Forecast: cash short — review costs'}
          </p>
        </div>
        <div>
          <p className="font-mono text-2xs uppercase text-ink-500">Month-12 bank balance (exp)</p>
          <p className={`text-xl font-bold mt-1 ${snap.month12ClosingExpected >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {formatNzCurrency(snap.month12ClosingExpected)}
          </p>
        </div>
      </div>
      <p className="px-4 pb-4 text-xs text-ink-600 leading-relaxed border-t border-ink-100 pt-3">
        Change <strong>volume units</strong> on the cash flow page and expected sales lines update automatically. NZ{' '}
        <strong>GST ({NZ_GST_RATE_LABEL})</strong>, Flexi-Wage, grants, and owner funds are explained on the cash flow page. Add office
        rent on <strong>Overheads (rent, power)</strong> when you lease.
      </p>
      {snap.totalsByPeriod && snap.periods.length > 0 && (
        <div className="border-t border-ink-200">
          <CashflowYearOutlook periods={snap.periods} totalsByPeriod={snap.totalsByPeriod} compact />
        </div>
      )}
    </section>
  );
}
