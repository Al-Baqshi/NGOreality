import { type ReactNode } from 'react';
import { Shield, ShieldCheck, Clock, XCircle, AlertCircle, Landmark } from 'lucide-react';
import type { OrgStatus, VerificationLevel } from '../../types';
import { ORG_STATUS_LABELS, VERIFICATION_LEVEL_LABELS, isNgorealityVerified } from '../../types';
import { FINANCIAL_VERIFICATION_ENABLED } from '../../config/features';
import type { Organization } from '../../types';
import { getOrgTrustDisplay } from '../../lib/orgTrustStatus';

export function StatusPill({ status }: { status: OrgStatus }) {
  const styles: Record<OrgStatus, string> = {
    listed: 'bg-sky-50 text-sky-800 border-sky-300',
    onboarding: 'bg-ink-50 text-ink-600 border-ink-300',
    under_review: 'bg-amber-50 text-amber-700 border-amber-300',
    verified: 'bg-teal-light text-teal border-teal',
    active: 'bg-teal-light text-teal border-teal',
    lapsed: 'bg-accent-light text-accent border-accent',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 border font-mono text-2xs font-semibold uppercase tracking-wider px-2.5 py-1 ${styles[status]}`}>
      {status === 'verified' || status === 'active' ? <ShieldCheck size={12} /> : <Clock size={12} />}
      {ORG_STATUS_LABELS[status]}
    </span>
  );
}

/** Single trust + pipeline badge for CRM and public directory. */
export function OrgTrustStatusBadge({
  org,
  showHint = true,
}: {
  org: Pick<Organization, 'status' | 'verification_level'>;
  showHint?: boolean;
}) {
  const { label, hint, tone } = getOrgTrustDisplay(org);

  const toneClass =
    tone === 'trust'
      ? 'badge-verified'
      : tone === 'warn'
        ? 'border-2 border-amber-400 bg-amber-50 text-amber-900 font-mono text-2xs font-semibold uppercase tracking-wider px-2.5 py-1 inline-flex items-center gap-1.5 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100'
        : tone === 'muted'
          ? 'inline-flex items-center gap-1.5 border border-dashed border-ink-300 bg-ink-50 text-ink-500 font-mono text-2xs font-semibold uppercase tracking-wider px-2.5 py-1 dark:border-border dark:bg-muted dark:text-muted-foreground'
          : 'inline-flex items-center gap-1.5 border border-ink-300 bg-ink-50 text-ink-600 font-mono text-2xs font-semibold uppercase tracking-wider px-2.5 py-1 dark:border-border dark:bg-muted dark:text-muted-foreground';

  const Icon =
    tone === 'trust' ? ShieldCheck : tone === 'warn' ? AlertCircle : Clock;

  return (
    <span className={`${toneClass} max-w-full`}>
      <Icon size={12} className="shrink-0" />
      <span className="truncate">{label}</span>
      {showHint && hint ? (
        <span className="normal-case tracking-normal font-medium opacity-80 hidden sm:inline">
          · {hint}
        </span>
      ) : null}
    </span>
  );
}

export function DirectoryTrustBadge({ org }: { org: Pick<Organization, 'status' | 'verification_level'> }) {
  if (isNgorealityVerified(org)) {
    return <OrgTrustStatusBadge org={org} showHint={false} />;
  }
  return (
    <span className="inline-flex items-center gap-1.5 border border-ink-300 bg-ink-50 text-ink-600 font-mono text-2xs font-semibold uppercase tracking-wider px-2.5 py-1 dark:border-border dark:bg-muted dark:text-muted-foreground">
      <AlertCircle size={10} />
      Listed · Not verified
    </span>
  );
}

export function VerificationBadge({ level, showDisclaimer }: { level: VerificationLevel; showDisclaimer?: boolean }) {
  if (level === 'none') {
    return (
      <span className="inline-flex items-center gap-1.5 border border-ink-200 bg-ink-50 text-ink-400 font-mono text-2xs font-semibold uppercase tracking-wider px-2.5 py-1">
        <XCircle size={12} />
        Not Verified
      </span>
    );
  }

  if (level === 'transparent_financial') {
    if (!FINANCIAL_VERIFICATION_ENABLED) {
      return (
        <span className="inline-flex items-center gap-1.5 border border-dashed border-ink-300 bg-ink-50 text-ink-500 font-mono text-2xs font-semibold uppercase tracking-wider px-2.5 py-1">
          <Landmark size={12} />
          Coming soon
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 border-2 border-teal bg-teal-light text-teal font-mono text-2xs font-semibold uppercase tracking-wider px-2.5 py-1">
        <Landmark size={12} />
        {VERIFICATION_LEVEL_LABELS[level]}
      </span>
    );
  }

  return (
    <span className="badge-verified">
      <Shield size={12} />
      {VERIFICATION_LEVEL_LABELS[level]}
      {showDisclaimer && (
        <span className="ml-1 normal-case tracking-normal font-medium opacity-70">(non-financial)</span>
      )}
    </span>
  );
}

export function CriterionStatus({ status }: { status: 'pass' | 'fail' | 'pending' }) {
  if (status === 'pass') {
    return <span className="badge-verified"><ShieldCheck size={12} />Pass</span>;
  }
  if (status === 'fail') {
    return <span className="badge-failed"><XCircle size={12} />Fail</span>;
  }
  return <span className="badge-pending"><AlertCircle size={12} />Pending</span>;
}

export function formatStatValue(value: string | number): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString('en-NZ') : '—';
  }
  return value;
}

export function MetricCard({
  label,
  value,
  sub,
  accent,
  compact,
  currency,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  /** Tighter padding for dense grids (e.g. registry insights on business plan). */
  compact?: boolean;
  /** Use nowrap tabular sizing for NZD amounts */
  currency?: boolean;
}) {
  const display = formatStatValue(value);
  const valueClass = currency ? 'stat-value-currency' : 'stat-value';
  const tone = accent ? 'text-emerald-700' : 'text-ink-950';
  return (
    <div
      className={`card-brutal stat-card ${compact ? 'p-3 sm:p-4' : 'p-4 sm:p-5 md:p-6'}`}
      title={typeof value === 'string' && value.length > 12 ? value : undefined}
    >
      <div className="label-brutal">{label}</div>
      <div className={`${valueClass} ${tone}`}>{display}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

export function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b-3 border-ink-950 pb-4 mb-6 min-w-0">
      <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight min-w-0 truncate">{children}</h2>
      {action && (
        <div className="shrink-0 w-full sm:w-auto [&_a]:w-full sm:[&_a]:w-auto [&_button]:w-full sm:[&_button]:w-auto [&_a]:justify-center sm:[&_a]:justify-start [&_button]:justify-center sm:[&_button]:justify-start">
          {action}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-ink-300 mb-4">{Icon}</div>
      <h3 className="text-lg font-bold text-ink-700 mb-2">{title}</h3>
      <p className="text-sm text-ink-400 max-w-sm">{description}</p>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-ink-950/60" onClick={onClose} />
      <div className="relative card-brutal w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b-3 border-ink-950 px-6 py-4">
          <h3 className="text-lg font-black uppercase tracking-tight">{title}</h3>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-950 transition-colors">
            <XCircle size={20} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function FormField({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div className="mb-4">
      <label className="label-brutal">{label}</label>
      {children}
      {error && <p className="text-accent text-xs font-mono mt-1">{error}</p>}
    </div>
  );
}
