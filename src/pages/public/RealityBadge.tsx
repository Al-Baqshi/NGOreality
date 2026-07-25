import { Link } from 'react-router-dom';
import { Shield, Landmark, CheckCircle, ArrowRight, AlertTriangle } from 'lucide-react';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';
import { FINANCIAL_VERIFICATION_ENABLED } from '../../config/features';
import FinancialComingSoon from '../../components/FinancialComingSoon';
import { FINANCIAL_CRITERIA } from '../../types';

const verifiedCriteria = [
  { key: 'website_functional', label: 'Website is functional and live', description: 'The organization has a working, accessible website that loads reliably.' },
  { key: 'mission_clear', label: 'Mission statement is clear and present', description: 'Visitors can immediately understand what the organization does and why.' },
  { key: 'contact_accessible', label: 'Contact information is accessible', description: 'There is a clear way for the public to reach the organization.' },
  { key: 'mobile_responsive', label: 'Website is mobile responsive', description: 'The website works well on all device sizes.' },
  { key: 'legal_pages', label: 'Privacy policy and terms are present', description: 'Basic legal pages exist to protect both the organization and visitors.' },
  { key: 'donation_transparency', label: 'Donation usage is clearly explained', description: 'Donors can understand how their contributions will be used.' },
  { key: 'uptime_reliable', label: 'Website has reliable uptime', description: 'The website is consistently available and not frequently down.' },
  { key: 'communication_clear', label: 'Communication is clear and professional', description: 'All public-facing content is well-written and professional.' },
];

/* const financialCriteria = [
  { key: 'financial_public', label: 'Financial records are publicly accessible', description: 'Annual financial statements or summaries are published and easy to find.' },
  { key: 'income_reported', label: 'Income sources are disclosed', description: 'All major funding sources are listed, including grants, donations, and other revenue.' },
  { key: 'expenditure_breakdown', label: 'Expenditure breakdown is provided', description: 'Spending is categorized so the public can see where money goes.' },
  { key: 'independent_audit', label: 'Independent audit or review exists', description: 'Financials have been reviewed or audited by an independent third party.' },
  { key: 'real_time_reporting', label: 'Regular reporting cadence', description: 'Financial updates are published at least annually, with clear timelines.' },
  { key: 'donor_traceability', label: 'Donor acknowledgment and traceability', description: 'Major donors are acknowledged and contributions can be traced to outcomes.' },
]; */


export default function RealityBadge() {
  const badgeBullets = [
    'Visual badge for website embedding',
    'Unique verification ID (e.g., REAL-2026-001)',
    'Public verification page with details',
    'Annual renewal and compliance check',
    ...(FINANCIAL_VERIFICATION_ENABLED ? ['Distinct badge for financial transparency tier'] : []),
  ];
  return (
    <>
      <SEO
        title="Reality Badge"
        description="The NGOreality Reality Badge is a public trust signal for nonprofits — digital independence, cybersecurity, and data privacy standards. Financial transparency tier coming soon."
        path="/public/reality-badge"
        image="/reality-badge.png"
      />
      <BreadcrumbJsonLd items={[{ name: 'Home', path: '/public' }, { name: 'Reality Badge', path: '/public/reality-badge' }]} />
      <div>
        {/* Hero */}
        <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-teal" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Reality Badge Standard</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4">
                What the Reality Badge means
              </h1>
              <p className="text-ink-300 text-lg">
                NGOreality Reality Badge is a public trust signal. It means an organization has met defined digital and transparency standards.
              </p>
            </div>
          </div>
        </section>

        {/* Two Tiers */}
        <section className="border-b-3 border-ink-950">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl mb-12">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-accent" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">{FINANCIAL_VERIFICATION_ENABLED ? 'Two Tiers' : 'Launch tier'}</span>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tight">
                Reality Badge levels
              </h2>
              {!FINANCIAL_VERIFICATION_ENABLED && (
                <p className="text-sm text-ink-500 mt-2">
                  We onboard NGOs on digital trust first. Financial transparency tier coming soon.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Verified Tier */}
              <div className="card-brutal p-6 border-t-4 border-t-teal">
                <div className="flex items-center gap-3 mb-4">
                  <img src="/reality-badge.png" alt="NGOreality Reality Badge" className="w-12 h-12 object-contain shrink-0" />
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Verified</h3>
                    <span className="badge-verified">Digital & Operational</span>
                  </div>
                </div>
                <p className="text-sm text-ink-600 leading-relaxed mb-4">
                  The organization has a functional live website, a clear mission statement, accessible contact methods, and meets all digital presence standards. This is a verification of operational credibility.
                </p>
                <div className="border-2 border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>Non-financial verification.</strong> This tier does not assess or verify financial records, spending, or fiscal transparency. It is solely a digital and operational standard.
                  </p>
                </div>
              </div>

              {FINANCIAL_VERIFICATION_ENABLED ? (
              <div className="card-brutal p-6 border-t-4 border-t-accent">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center border-3 border-accent bg-accent-light">
                    <Landmark size={24} className="text-accent" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Transparent Financial</h3>
                    <span className="badge-failed">Financial Transparency</span>
                  </div>
                </div>
                <p className="text-sm text-ink-600 leading-relaxed mb-4">
                  The organization has met all Verified criteria plus additional financial transparency standards. Financial records are publicly accessible, expenditures are broken down, and independent audits exist.
                </p>
                <div className="border-2 border-teal bg-teal-light p-3 flex items-start gap-2">
                  <Landmark size={16} className="text-teal mt-0.5 shrink-0" />
                  <p className="text-xs text-teal leading-relaxed">
                    <strong>Includes financial verification.</strong> This tier confirms that the organization publishes financial records, discloses income sources, and provides expenditure breakdowns accessible to the public.
                  </p>
                </div>
              </div>
              ) : (
                <FinancialComingSoon variant="card" />
              )}
            </div>
          </div>
        </section>

        {/* What it is / is not */}
        <section className="border-b-3 border-ink-950 bg-surface-overlay">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tight mb-6">Reality Badge is</h2>
                <ul className="space-y-3">
                  {[
                    'An independent assessment of digital presence',
                    'A public signal that standards are met',
                    'A commitment to transparency and accessibility',
                    'A tool for public confidence',
                    'A progressive system with two distinct tiers',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle size={16} className="text-teal mt-0.5 shrink-0" />
                      <span className="text-sm text-ink-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="text-3xl font-black uppercase tracking-tight mb-6">Reality Badge is not</h2>
                <ul className="space-y-3">
                  {[
                    'A government regulatory approval',
                    'A legal certification',
                    'A replacement for compliance systems',
                    'An endorsement of specific activities',
                    'A financial audit (at the Verified tier)',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-ink-300 mt-2 shrink-0" />
                      <span className="text-sm text-ink-500">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Verified Criteria */}
        <section className="border-b-3 border-ink-950">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl mb-12">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-teal" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">Tier 1</span>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tight mb-2">
                Verified criteria
              </h2>
              <p className="text-sm text-ink-500">Digital and operational standards. Non-financial.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {verifiedCriteria.map((c, i) => (
                <div key={c.key} className="card-brutal p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl font-black text-ink-100 leading-none">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <h3 className="text-sm font-bold mb-1">{c.label}</h3>
                      <p className="text-xs text-ink-500 leading-relaxed">{c.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {FINANCIAL_VERIFICATION_ENABLED ? (
        <section className="border-b-3 border-ink-950 bg-surface-overlay">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl mb-12">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-accent" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">Tier 2</span>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tight mb-2">
                Transparent Financial criteria
              </h2>
              <p className="text-sm text-ink-500">Additional financial transparency standards. Requires Verified tier first.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FINANCIAL_CRITERIA.map((c, i) => (
                <div key={c.criterion_key} className="card-brutal p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl font-black text-ink-100 leading-none">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <h3 className="text-sm font-bold mb-1">{c.criterion_label}</h3>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        ) : (
          <FinancialComingSoon variant="section" />
        )}

        {/* Badge */}
        <section className="border-b-3 border-ink-950">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px w-12 bg-teal" />
                  <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">The Badges</span>
                </div>
                <h2 className="text-3xl font-black uppercase tracking-tight mb-6">
                  Visible trust signals
                </h2>
                <p className="text-ink-600 leading-relaxed mb-6">
                  Each verified organization receives the NGOreality Reality Badge, a unique verification ID, and a public verification page. {!FINANCIAL_VERIFICATION_ENABLED && 'Financial transparency badge — coming soon.'} {FINANCIAL_VERIFICATION_ENABLED && ' Organizations that meet financial transparency standards receive the Transparent Financial badge.'}
                </p>
                <ul className="space-y-3">
                  {badgeBullets.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <Shield size={16} className="text-teal mt-0.5 shrink-0" />
                      <span className="text-sm text-ink-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col items-center gap-6">
                {/* Verified Badge */}
                <div className="card-brutal p-6 text-center w-full max-w-xs">
                  <img
                    src="/reality-badge.png"
                    alt="NGOreality Reality Badge"
                    className="w-24 h-24 mx-auto mb-3 object-contain"
                  />
                  <div className="font-mono text-xs uppercase tracking-[0.2em] text-teal font-bold mb-1">Verified Nonprofit</div>
                  <div className="font-mono text-2xs text-ink-400 tracking-wider">REAL-2026-001</div>
                  <div className="mt-3 pt-3 border-t-2 border-ink-100">
                    <div className="font-mono text-2xs text-ink-400 uppercase tracking-wider">Digital & Operational</div>
                    <div className="font-mono text-2xs text-amber-600 mt-1">Non-financial</div>
                  </div>
                </div>

                {FINANCIAL_VERIFICATION_ENABLED ? (
                <div className="card-brutal p-6 text-center w-full max-w-xs">
                  <div className="flex items-center justify-center mb-3">
                    <div className="flex h-16 w-16 items-center justify-center border-3 border-accent bg-accent-light">
                      <Landmark size={32} className="text-accent" />
                    </div>
                  </div>
                  <div className="font-mono text-xs uppercase tracking-[0.2em] text-accent font-bold mb-1">Transparent Financial</div>
                  <div className="font-mono text-2xs text-ink-400 tracking-wider">REAL-2026-001-FIN</div>
                  <div className="mt-3 pt-3 border-t-2 border-ink-100">
                    <div className="font-mono text-2xs text-ink-400 uppercase tracking-wider">Financial Transparency</div>
                    <div className="font-mono text-2xs text-teal mt-1">Includes financial verification</div>
                  </div>
                </div>
                ) : (
                  <FinancialComingSoon variant="compact" className="w-full max-w-xs justify-center" />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 text-center">
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-6">
              Get your organization verified
            </h2>
            <p className="text-ink-300 max-w-lg mx-auto mb-4">
              Meet public trust standards first — clear mission, contact, privacy policy, and a working site — then
              join as a member.
            </p>
            <p className="font-mono text-sm text-teal mb-8">
              $70 NZD / year — Reality Badge, monitoring, and email alerts if your site goes down. Hands-on support
              and custom builds are separate.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/ngo/signup" className="btn-brutal-teal text-base inline-flex items-center gap-2 justify-center min-h-[48px]">
                NGO sign up <ArrowRight size={18} />
              </Link>
              <Link to="/public/contact" className="btn-brutal-outline border-ink-600 text-white text-base inline-flex items-center gap-2 justify-center min-h-[48px]">
                Contact us <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
