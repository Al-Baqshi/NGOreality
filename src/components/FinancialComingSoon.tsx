import { Clock, Landmark } from 'lucide-react';

type Variant = 'card' | 'section' | 'compact' | 'crm';

interface FinancialComingSoonProps {
  variant?: Variant;
  className?: string;
}

export default function FinancialComingSoon({ variant = 'section', className = '' }: FinancialComingSoonProps) {
  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center gap-2 border-2 border-dashed border-ink-300 bg-ink-50 px-3 py-2 font-mono text-2xs uppercase tracking-wider text-ink-500 ${className}`}
      >
        <Clock size={12} className="shrink-0" />
        Financial transparency — coming soon
      </div>
    );
  }

  if (variant === 'crm') {
    return (
      <div className={`card-brutal border-2 border-dashed border-ink-300 bg-ink-50 ${className}`}>
        <div className="border-b-2 border-ink-200 px-6 py-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center border-2 border-ink-300 bg-white">
            <Landmark size={18} className="text-ink-400" />
          </div>
          <div>
            <div className="font-mono text-2xs uppercase tracking-wider text-ink-400">Tier 2 — not active yet</div>
            <h3 className="text-sm font-bold">Transparent Financial criteria</h3>
          </div>
          <span className="ms-auto font-mono text-2xs uppercase tracking-wider bg-ink-950 text-white px-2 py-1">
            Coming soon
          </span>
        </div>
        <div className="px-6 py-5 text-sm text-ink-600 leading-relaxed">
          Financial record checks stay in the codebase but are hidden for launch. Onboard NGOs on the Reality Badge
          first (website, security, privacy, accessibility). We will introduce the financial transparency tier when
          organizations are ready.
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={`card-brutal p-6 border-t-4 border-t-ink-300 border-2 border-dashed bg-ink-50 opacity-95 ${className}`}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center border-3 border-ink-300 bg-white">
            <Landmark size={24} className="text-ink-400" />
          </div>
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight text-ink-700">Transparent Financial</h3>
            <span className="inline-block mt-1 font-mono text-2xs uppercase tracking-wider bg-ink-950 text-white px-2 py-0.5">
              Coming soon
            </span>
          </div>
        </div>
        <p className="text-sm text-ink-600 leading-relaxed">
          After NGOs earn the Reality Badge for digital independence, cybersecurity, and data privacy, we will offer an
          optional tier for published financial records and expenditure transparency. Not required to get verified
          today.
        </p>
      </div>
    );
  }

  return (
    <section className={`border-b-3 border-ink-950 bg-surface-overlay ${className}`}>
      <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
        <div className="max-w-2xl mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px w-12 bg-ink-300" />
            <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">Tier 2</span>
            <span className="font-mono text-2xs uppercase tracking-wider bg-ink-950 text-white px-2 py-0.5">
              Coming soon
            </span>
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tight mb-2 text-ink-800">
            Transparent Financial criteria
          </h2>
          <p className="text-sm text-ink-500 leading-relaxed">
            We are launching with the Reality Badge first: prove your organization is real, reachable, and meets
            general digital trust standards. Financial transparency verification will follow in a later release.
          </p>
        </div>
        {/*
        Financial criteria (disabled for launch — see FINANCIAL_CRITERIA in types/index.ts)
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">...</div>
        */}
        <div className="card-brutal p-6 border-2 border-dashed border-ink-300 bg-white max-w-xl">
          <div className="flex items-center gap-2 text-ink-600 text-sm">
            <Clock size={16} className="shrink-0 text-ink-400" />
            <span>Public financial checks, audit disclosures, and a distinct financial badge — planned, not live yet.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
