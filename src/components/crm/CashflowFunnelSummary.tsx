import {
  NGOs_ONBOARDED_MONTH_ONE,
  NZ_COVERAGE_TARGET_ORGS,
  NZ_COVERAGE_TARGET_PCT,
  NZ_REGISTRY_LISTED,
  WORKSPACE_MONTHLY_ARPU_CENTS,
  batchRampLabel,
  computeAllMonthFunnels,
  projectedWorkspaceArrCents,
} from '../../config/salesFunnelModel';
import { WORKSPACE_ADMIN_MONTHLY_CENTS, WORKSPACE_SEAT_MONTHLY_CENTS } from '../../config/customerProducts';
import { MEMBERSHIP_ANNUAL_CENTS } from '../../config/pricing';
import { LANDING_STANDARDS_PACKAGE_CENTS } from '../../config/customerProducts';
import type { CashflowPeriodTotals } from '../../lib/businessCashflow';

function money(cents: number) {
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

export default function CashflowFunnelSummary({
  periods,
  totalsByPeriod,
}: {
  periods: string[];
  totalsByPeriod: Record<string, CashflowPeriodTotals>;
}) {
  const funnels = computeAllMonthFunnels(periods.length);
  const m1 = funnels[0];
  const m12 = funnels[funnels.length - 1];
  const y1Onboarded = funnels.reduce((s, f) => s + f.ngosOnboardedBatch, 0);
  const y1ReceiptsFromSheet = periods.reduce((s, p) => s + (totalsByPeriod[p]?.totalReceipts.expected ?? 0), 0);
  const y1Net = periods.reduce((s, p) => s + (totalsByPeriod[p]?.netCashflow.expected ?? 0), 0);
  const y1Op = periods.reduce((s, p) => s + (totalsByPeriod[p]?.operatingProfit.expected ?? 0), 0);
  const year2Arr = projectedWorkspaceArrCents(periods.length);
  const workspaceArpu = Math.round(WORKSPACE_MONTHLY_ARPU_CENTS / 100);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
      <div className="card-brutal p-4 sm:p-5 border-l-4 border-l-emerald-600">
        <p className="font-mono text-2xs uppercase text-ink-500 mb-3">Units → revenue (green)</p>
        <dl className="space-y-3 text-xs sm:text-sm">
          <div>
            <dt className="font-semibold text-ink-950">Onboarding pace</dt>
            <dd className="text-ink-600 mt-1 leading-relaxed">
              Pipeline: <strong>{NGOs_ONBOARDED_MONTH_ONE.toLocaleString()} leads/mo</strong>. Conversions: {batchRampLabel()} by month 12.
              Edit the sky unit rows above — green receipt lines follow.
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-ink-100 pt-3">
            <div>
              <span className="font-mono text-2xs text-ink-500 uppercase">Month 1</span>
              <p className="text-emerald-800 font-bold text-base">{m1?.ngosOnboardedBatch ?? 0} NGOs</p>
            </div>
            <div>
              <span className="font-mono text-2xs text-ink-500 uppercase">Month 12</span>
              <p className="text-emerald-800 font-bold text-base">{m12?.ngosOnboardedBatch ?? 0} NGOs</p>
              <p className="text-ink-600 text-2xs">{m12?.workspaceActiveSubs ?? 0} workspace subs</p>
            </div>
          </div>
          <div className="border-t border-ink-100 pt-3 space-y-1.5">
            <div className="flex justify-between gap-2">
              <dt>Reality Badge</dt>
              <dd className="text-emerald-700">${MEMBERSHIP_ANNUAL_CENTS / 100}/yr</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Landing + standards</dt>
              <dd className="text-emerald-700">${LANDING_STANDARDS_PACKAGE_CENTS / 100}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Organisation Workspace</dt>
              <dd className="text-emerald-700 text-end">
                ${WORKSPACE_ADMIN_MONTHLY_CENTS / 100}/mo admin · ${WORKSPACE_SEAT_MONTHLY_CENTS / 100}/seat
              </dd>
            </div>
          </div>
          <div className="border-t border-ink-100 pt-3 text-ink-700 leading-relaxed">
            <p>
              <strong>Year 1:</strong> {y1Onboarded.toLocaleString()} NGOs onboarded · {money(y1ReceiptsFromSheet)}{' '}
              receipts · {money(y1Op)} operating
            </p>
            <p className="text-ink-500 text-2xs mt-1">
              If month-12 workspace subs hold: ~{money(year2Arr)}/yr recurring
            </p>
          </div>
        </dl>
      </div>

      <div className="card-brutal p-4 sm:p-5 border-l-4 border-l-red-600">
        <p className="font-mono text-2xs uppercase text-ink-500 mb-3">Costs &amp; plan (red)</p>
        <dl className="space-y-3 text-xs sm:text-sm text-ink-700">
          <div>
            <dt className="font-semibold text-ink-950">Workspace ARPU (forecast)</dt>
            <dd className="mt-1 text-red-700">${workspaceArpu}/mo per org</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-950">How we onboard</dt>
            <dd className="mt-1 leading-relaxed">
              AI-verified NGOs get the badge. Others get the $650 package. Every cohort moves to Organisation Workspace
              the month after onboard.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-950">NZ → export</dt>
            <dd className="mt-1 leading-relaxed">
              {Math.round(NZ_COVERAGE_TARGET_PCT * 100)}% of {NZ_REGISTRY_LISTED.toLocaleString()} NZ charities (
              {NZ_COVERAGE_TARGET_ORGS.toLocaleString()} orgs), then AU and other registries.
            </dd>
          </div>
          <div className="border-t border-ink-100 pt-3">
            <dt className="font-semibold text-ink-950">12-month net (expected)</dt>
            <dd className={`mt-1 font-mono text-lg font-bold ${y1Net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {money(y1Net)} {y1Net >= 0 ? 'profit' : 'loss'}
            </dd>
            <dd className="text-2xs text-ink-500 mt-1">
              Edit sky unit rows to update sales lines. Use <strong>Reset expected</strong> after changing assumptions in
              config.
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}