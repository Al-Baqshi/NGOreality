import { Link } from 'react-router-dom';
import {
  Award,
  Globe,
  LayoutGrid,
  Phone,
  Sparkles,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react';
import CustomerJourneyDiagram from './CustomerJourneyDiagram';
import RegistryInsights from './RegistryInsights';
import {
  LANDING_STANDARDS_PACKAGE_CENTS,
  MEMBER_MONITORING_SUMMARY,
  ORGANISATION_WORKSPACE_NAME,
} from '../../config/customerProducts';
import { NZ_GST_RATE_LABEL } from '../../config/nzCashflowGuide';
import {
  FLEXI_WAGE_SUMMARY,
  REVENUE_STREAMS,
  type RevenueStream,
} from '../../config/businessPlanNarrative';

const iconMap = {
  badge: Award,
  monitor: Phone,
  workspace: LayoutGrid,
  web: Globe,
  custom: Sparkles,
};

function StreamCard({ stream }: { stream: RevenueStream }) {
  const Icon = iconMap[stream.icon];
  return (
    <div className="card-brutal p-4 flex flex-col h-full border-l-4 border-l-teal min-w-0">
      <div className="flex items-start gap-3 mb-2">
        <div className="border-2 border-ink-950 p-2 bg-ink-950 text-white shrink-0">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <h4 className="font-semibold text-sm leading-tight break-words">{stream.title}</h4>
          <p className="font-mono text-2xs text-teal mt-0.5 break-words">{stream.price}</p>
        </div>
      </div>
      <p className="text-xs text-ink-600 leading-relaxed flex-1">{stream.description}</p>
    </div>
  );
}

export function RevenueMixChart() {
  const slices = [
    { label: 'Membership', pct: 40, color: 'bg-teal' },
    { label: `$${LANDING_STANDARDS_PACKAGE_CENTS / 100} setups`, pct: 30, color: 'bg-accent' },
    { label: ORGANISATION_WORKSPACE_NAME, pct: 20, color: 'bg-ink-700' },
    { label: 'Custom projects', pct: 10, color: 'bg-ink-400' },
  ];
  return (
    <div className="card-brutal p-4 sm:p-5 min-w-0">
      <h3 className="font-mono text-2xs uppercase tracking-wider text-ink-500 mb-4">Year 1 revenue mix (target)</h3>
      <div className="flex h-8 border-3 border-ink-950 overflow-hidden mb-4">
        {slices.map((s) => (
          <div
            key={s.label}
            className={`${s.color} flex items-center justify-center font-mono text-2xs text-white min-w-[1.5rem] px-0.5`}
            style={{ width: `${s.pct}%` }}
            title={s.label}
          >
            <span className="hidden sm:inline">{s.pct}%</span>
          </div>
        ))}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 min-w-0">
            <span className={`w-3 h-3 border border-ink-950 shrink-0 ${s.color}`} />
            <span className="break-words">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FlywheelDiagram() {
  const steps = [
    { n: '01', title: 'Registry data', body: '~29k NZ charities' },
    { n: '02', title: 'See the gap', body: 'No site · down · standards' },
    { n: '03', title: '$650 + education', body: 'Landing + checklist' },
    { n: '04', title: 'Badge + care', body: '~24h checks · email · call' },
  ];
  return (
    <div className="card-brutal p-4 sm:p-5 bg-ink-950 text-white min-w-0">
      <h3 className="font-mono text-2xs uppercase tracking-wider text-ink-300 mb-4">Data flywheel</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((s, i) => (
          <div key={s.n} className="relative border-2 border-ink-600 p-3 min-w-0">
            <span className="font-mono text-2xs text-teal">{s.n}</span>
            <p className="font-semibold text-sm mt-1 leading-snug">{s.title}</p>
            <p className="text-2xs text-ink-300 mt-1">{s.body}</p>
            {i < steps.length - 1 && (
              <span className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 text-teal z-10">→</span>
            )}
          </div>
        ))}
      </div>
      <p className="font-mono text-2xs text-ink-400 mt-4 leading-relaxed">
        Not hourly monitoring — {MEMBER_MONITORING_SUMMARY.toLowerCase()}.
      </p>
    </div>
  );
}

export function RegistryMarketVisual() {
  return (
    <div className="card-brutal p-4 sm:p-5 min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 mb-4 min-w-0">
        <TrendingUp size={16} className="text-teal shrink-0" />
        <h3 className="font-mono text-2xs uppercase tracking-wider leading-snug">
          Live market intelligence (NZ registry)
        </h3>
      </div>
      <RegistryInsights country="NZ" layout="full" />
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  variant = 'default',
}: {
  label: string;
  value: string;
  sub: string;
  variant?: 'default' | 'teal' | 'dark';
}) {
  const shell =
    variant === 'teal'
      ? 'card-brutal stat-card p-4 sm:p-5 bg-teal/10 border-teal'
      : variant === 'dark'
        ? 'card-brutal stat-card p-4 sm:p-5 bg-ink-950 text-white'
        : 'card-brutal stat-card p-4 sm:p-5';
  const labelClass = variant === 'dark' ? 'label-brutal text-ink-300' : 'label-brutal';
  return (
    <div className={shell}>
      <p className={labelClass}>{label}</p>
      <p className={`stat-value ${variant === 'dark' ? 'text-white' : 'text-ink-950'}`}>{value}</p>
      <p className={`stat-sub ${variant === 'dark' ? 'text-ink-400' : ''}`}>{sub}</p>
    </div>
  );
}

export default function BusinessPlanInfographics() {
  return (
    <div className="space-y-8 min-w-0">
      <div data-pdf-section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <HeroStat
          label="Membership"
          value="$100/yr"
          sub="Badge · ~24h checks · email if down"
          variant="teal"
        />
        <HeroStat
          label="Setup package"
          value={`$${LANDING_STANDARDS_PACKAGE_CENTS / 100}`}
          sub="Landing + standards education"
        />
        <HeroStat
          label={ORGANISATION_WORKSPACE_NAME}
          value="Portal"
          sub="Their org hub — not staff CRM"
        />
        <div className="card-brutal stat-card p-4 sm:p-5 bg-ink-950 text-white flex flex-col justify-center min-h-[44px]">
          <p className="label-brutal text-ink-300">Cashflow</p>
          <Link
            to="/cash-flow"
            className="print:hidden mt-2 inline-flex items-center gap-1 font-semibold text-sm sm:text-base text-white hover:text-teal min-h-[44px]"
          >
            Open worksheet →
          </Link>
        </div>
      </div>

      <div data-pdf-section>
        <CustomerJourneyDiagram />
      </div>

      <div data-pdf-section>
        <FlywheelDiagram />
      </div>

      <div data-pdf-section>
        <h3 className="font-mono text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
          <Wrench size={14} /> Revenue streams (not “hourly monitoring”)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {REVENUE_STREAMS.map((s) => (
            <StreamCard key={s.id} stream={s} />
          ))}
        </div>
      </div>

      <div data-pdf-section className="grid grid-cols-1 gap-6">
        <RegistryMarketVisual />
        <RevenueMixChart />
        <div className="card-brutal p-4 sm:p-5 border-l-4 border-l-teal min-w-0">
          <h3 className="font-mono text-2xs uppercase tracking-wider text-ink-500 mb-2">NZ cashflow &amp; GST</h3>
          <p className="text-xs text-ink-600 leading-relaxed">
            The live worksheet links <strong>volume units → sales → (A) receipts → profit/loss</strong>. Green lines
            include membership, $650 packages, and workspace MRR; other receipts include Flexi-Wage, capitalisation
            grant, and owner funds. GST ({NZ_GST_RATE_LABEL}) and IRD set-asides are on the red side — expand the guide on the cash
            flow page.
          </p>
          <Link
            to="/cash-flow"
            className="print:hidden inline-flex mt-3 btn-brutal-outline text-2xs py-2 px-3 min-h-[40px] items-center"
          >
            Open cashflow + chart →
          </Link>
        </div>
      </div>

      <div data-pdf-section className="card-brutal p-4 sm:p-5 border-3 border-ink-950">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Users size={20} className="text-teal shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-sm">Scale path</p>
              <p className="text-xs text-ink-500 leading-relaxed">
                Year 1: founder + contractors. Hire when memberships and $650 packages fund payroll.
              </p>
            </div>
          </div>
          <Link
            to="/outreach"
            className="print:hidden btn-brutal-outline text-2xs py-2 px-4 sm:ms-auto text-center min-h-[44px] flex items-center justify-center"
          >
            Outreach board →
          </Link>
        </div>
      </div>
    </div>
  );
}
