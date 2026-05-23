import {
  BATCH_ONBOARD_END_PER_DAY,
  BATCH_ONBOARD_START_PER_DAY,
  NZ_COVERAGE_TARGET_ORGS,
  NZ_COVERAGE_TARGET_PCT,
  NZ_REGISTRY_LISTED,
  WORKSPACE_MONTHLY_ARPU_CENTS,
  computeAllMonthFunnels,
  projectedWorkspaceArrCents,
} from '../../config/salesFunnelModel';
import { WORKSPACE_ADMIN_MONTHLY_CENTS, WORKSPACE_SEAT_MONTHLY_CENTS } from '../../config/customerProducts';
import { MEMBERSHIP_ANNUAL_CENTS } from '../../config/pricing';
import { LANDING_STANDARDS_PACKAGE_CENTS } from '../../config/customerProducts';
import { formatMonthLabel } from '../../lib/businessPlan';
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
  const y1Badges = funnels.reduce((s, f) => s + f.badgesThisMonth, 0);
  const y1Packages = funnels.reduce((s, f) => s + f.packagesThisMonth, 0);
  const y1ReceiptsFromSheet = periods.reduce((s, p) => s + (totalsByPeriod[p]?.totalReceipts.expected ?? 0), 0);
  const y1Net = periods.reduce((s, p) => s + (totalsByPeriod[p]?.netCashflow.expected ?? 0), 0);
  const y1Op = periods.reduce((s, p) => s + (totalsByPeriod[p]?.operatingProfit.expected ?? 0), 0);
  const year2Arr = projectedWorkspaceArrCents(periods.length);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
      <div className="card-brutal p-4 sm:p-5 border-l-4 border-l-emerald-600">
        <p className="font-mono text-2xs uppercase text-ink-500 mb-3">Units → revenue (green)</p>
        <dl className="space-y-2 text-xs sm:text-sm">
          <div>
            <dt className="font-semibold text-ink-950">Daily batch onboarding</dt>
            <dd className="text-ink-600 mt-1">
              {BATCH_ONBOARD_START_PER_DAY} NGOs/day → {BATCH_ONBOARD_END_PER_DAY}/day over 12 months (automation +
              mass invite). Each month: units in the table above drive the dollar lines below.
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono text-2xs border-t border-ink-100 pt-2">
            <div>
              <span className="text-ink-500">Month 1 batch</span>
              <p className="text-emerald-800 font-bold">{m1?.ngosOnboardedBatch ?? 0} NGOs</p>
              <p className="text-ink-600">
                {m1?.badgesThisMonth} badges · {m1?.packagesThisMonth} × $650 · workspace MRR mo 2+
              </p>
            </div>
            <div>
              <span className="text-ink-500">Month 12 batch</span>
              <p className="text-emerald-800 font-bold">{m12?.ngosOnboardedBatch ?? 0} NGOs</p>
              <p className="text-ink-600">
                {m12?.badgesThisMonth} badges · {m12?.workspaceActiveSubs} workspace subs (
                {money(m12?.workspaceMrrCents ?? 0)}/mo)
              </p>
            </div>
          </div>
          <div className="border-t border-ink-100 pt-2 space-y-1">
            <div className="flex justify-between gap-2">
              <dt>Badge</dt>
              <dd className="text-emerald-700">${MEMBERSHIP_ANNUAL_CENTS / 100}/yr</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>$650 package</dt>
              <dd className="text-emerald-700">${LANDING_STANDARDS_PACKAGE_CENTS / 100}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Organisation Workspace</dt>
              <dd className="text-emerald-700 text-end">
                ${WORKSPACE_ADMIN_MONTHLY_CENTS / 100} admin + ${WORKSPACE_SEAT_MONTHLY_CENTS / 100}/user/mo
              </dd>
            </div>
          </div>
          <div className="border-t border-ink-100 pt-2 font-mono text-2xs text-emerald-800">
            Year 1 units: {y1Onboarded.toLocaleString()} onboarded · {y1Badges} badges · {y1Packages} packages
            <br />
            Year 1 receipts (worksheet): {money(y1ReceiptsFromSheet)} · operating {money(y1Op)}
            <br />
            <span className="text-ink-600">Year 2+ recurring hint: ~{money(year2Arr)} workspace ARR if month-12 subs hold</span>
          </div>
        </dl>
      </div>

      <div className="card-brutal p-4 sm:p-5 border-l-4 border-l-red-600">
        <p className="font-mono text-2xs uppercase text-ink-500 mb-3">Costs &amp; plan (red)</p>
        <dl className="space-y-2 text-xs sm:text-sm text-ink-700">
          <div>
            <dt className="font-semibold text-ink-950">Per-org workspace ARPU (forecast)</dt>
            <dd className="mt-1 text-red-700 font-mono">
              ${(WORKSPACE_MONTHLY_ARPU_CENTS / 100).toFixed(2)}/mo (~1 admin + 1.5 seats)
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-950">Priority</dt>
            <dd className="mt-1 leading-relaxed">
              Auto-ready NGOs (AI verifier + hybrid review) → badge. Batch without site → $650. All cohorts →
              Organisation Workspace from month after onboard. Staff from month 1 ($1.5–2k/wk); up to 5 with premises.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-950">NZ → export</dt>
            <dd className="mt-1 leading-relaxed">
              ≥{Math.round(NZ_COVERAGE_TARGET_PCT * 100)}% of {NZ_REGISTRY_LISTED.toLocaleString()} charities (
              {NZ_COVERAGE_TARGET_ORGS.toLocaleString()}) then AU/other registries with the same automation.
            </dd>
          </div>
          <div className="border-t border-ink-100 pt-2">
            <dt className="font-semibold text-ink-950">12-month net (expected)</dt>
            <dd className={`mt-1 font-mono text-lg font-bold ${y1Net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {money(y1Net)} {y1Net >= 0 ? '(profit)' : '(loss)'}
            </dd>
            <dd className="text-2xs text-ink-500 mt-1">
              Linked: edit volume units → sales lines and (A) total update. Overheads line = rent/power when you add a
              office. <strong>Reset expected</strong> if numbers look stale.
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
