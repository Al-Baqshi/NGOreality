import { Link } from 'react-router-dom';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';

const updated = '10 June 2026';

const sections = [
  {
    title: 'Agreement to these terms',
    body: [
      'These Terms of Service apply when you access or use the NGOreality website, public directory, NGO portal, verification services, Reality Badge services, contact forms, and related digital services.',
      'By using NGOreality, you agree to these terms. If you use NGOreality on behalf of an organization, you confirm that you are authorised to bind that organization.',
    ],
  },
  {
    title: 'About NGOreality',
    body: [
      'NGOreality provides digital trust infrastructure for nonprofits, including public directory listings, website and trust-signal reviews, verification workflows, portal tools, and Reality Badge status indicators.',
      'NGOreality is independent. We are not a government regulator, Charities Services, a legal authority, an auditor, a financial adviser, or a substitute for an organization obtaining its own legal, accounting, privacy, cybersecurity, or governance advice.',
    ],
  },
  {
    title: 'Accounts and authority',
    body: [
      'You must provide accurate, current, and complete information when creating an account, submitting an inquiry, claiming an organization profile, requesting verification, or using the NGO portal.',
      'You are responsible for maintaining the confidentiality of login credentials and for all activity under your account. You must promptly tell us if you suspect unauthorised access or a mistake in account permissions.',
      'We may request reasonable evidence that you are authorised to act for an organization before granting access, changing public details, or issuing verification outcomes.',
    ],
  },
  {
    title: 'Verification, directory listings, and badge status',
    body: [
      'Verification outcomes are based on the information available to us, the standards in place at the time of review, and our assessment processes. A verification outcome is not a legal compliance certificate, financial audit, endorsement of governance, or guarantee that an organization is safe, solvent, effective, or free from misconduct.',
      'We may update, suspend, remove, or correct directory information, verification status, badge status, or public profile content where information is inaccurate, incomplete, outdated, disputed, misleading, unlawful, or inconsistent with our standards.',
      'If we grant an organization permission to display a Reality Badge or related mark, that permission is limited, revocable, non-exclusive, non-transferable, and subject to ongoing compliance with NGOreality standards and brand instructions.',
    ],
  },
  {
    title: 'Fees, billing, and refunds',
    body: [
      'Some NGOreality services may be free and others may require payment. Prices, inclusions, billing periods, payment methods, and taxes will be shown in the relevant order, invoice, checkout, or service description.',
      'You must pay applicable fees when due and ensure billing details are accurate. We may suspend paid features if fees remain unpaid after reasonable notice.',
      'Refunds are handled according to the applicable service description and New Zealand law. Nothing in these terms limits non-excludable rights under the Consumer Guarantees Act 1993, Fair Trading Act 1986, or other applicable legislation.',
    ],
  },
  {
    title: 'Your content and responsibilities',
    body: [
      'You retain ownership of content and information you provide. You grant NGOreality a worldwide, royalty-free licence to host, copy, use, process, adapt, publish, and display that content as reasonably necessary to provide, secure, promote, and improve NGOreality services.',
      'You must ensure content you provide is accurate, lawful, not misleading, and does not infringe any rights. You must not submit malicious code, false authority claims, private information you are not entitled to share, or content that is defamatory, discriminatory, abusive, or unlawful.',
    ],
  },
  {
    title: 'Acceptable use',
    body: [
      'You must not interfere with the security, availability, integrity, or proper operation of NGOreality. This includes scraping at unreasonable scale, bypassing security checks, probing systems without permission, reverse engineering non-public services, sending spam, or using NGOreality to mislead donors, beneficiaries, regulators, or the public.',
      'We may limit, suspend, or terminate access where we reasonably believe these terms have been breached, access creates legal or security risk, or continued use may harm NGOreality, users, organizations, or the public.',
    ],
  },
  {
    title: 'Intellectual property',
    body: [
      'NGOreality owns or licenses the website, software, design, branding, trademarks, verification methodology, documentation, and other platform materials. Except as expressly permitted, you must not copy, modify, distribute, sell, or create derivative works from NGOreality materials.',
      'You may link to public NGOreality pages in a fair and non-misleading way. You must not imply endorsement, partnership, verification, or badge status unless NGOreality has expressly granted that status.',
    ],
  },
  {
    title: 'Third-party services and links',
    body: [
      'NGOreality may link to third-party websites, registries, payment processors, authentication systems, analytics services, security checks, or hosting providers. We are not responsible for third-party services, content, availability, or terms.',
      'Public directory information may include links to organization websites or public registers. You should make your own assessment before donating, contracting, volunteering, or relying on any third-party information.',
    ],
  },
  {
    title: 'Availability and changes',
    body: [
      'We aim to keep NGOreality reliable, but we do not promise uninterrupted, error-free, or permanent availability. We may modify, pause, replace, or discontinue features where reasonably necessary.',
      'We may update these terms from time to time. Material changes will apply from the stated effective date or, if no date is stated, when posted. Continued use after changes are posted means you accept the updated terms.',
    ],
  },
  {
    title: 'Liability',
    body: [
      'To the maximum extent permitted by law, NGOreality excludes warranties, representations, and guarantees that are not expressly stated in these terms. We do not exclude any warranty, guarantee, right, or remedy that cannot lawfully be excluded.',
      'To the maximum extent permitted by law, NGOreality is not liable for indirect loss, loss of profit, loss of revenue, loss of donations, reputational loss, loss of data, or consequential loss arising from use of the services.',
      'Where liability cannot be excluded but can be limited, our liability is limited to resupplying the relevant service or the amount you paid for that service in the three months before the event giving rise to the claim, whichever is greater.',
    ],
  },
  {
    title: 'Governing law and disputes',
    body: [
      'These terms are governed by New Zealand law. The courts of New Zealand have non-exclusive jurisdiction, except where applicable consumer law gives you the right to bring a claim elsewhere.',
      'Before starting formal proceedings, each party should first try to resolve the dispute in good faith by giving written notice of the issue and allowing a reasonable time for response, unless urgent relief is required.',
    ],
  },
];

export default function TermsOfService() {
  return (
    <>
      <SEO
        title="Terms of Service"
        description="NGOreality Terms of Service for website, directory, NGO portal, verification, and Reality Badge services."
        path="/public/terms"
      />
      <BreadcrumbJsonLd items={[{ name: 'Home', path: '/public' }, { name: 'Terms of Service', path: '/public/terms' }]} />

      <div>
        <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-accent" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Legal</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4">
                Terms of Service
              </h1>
              <p className="text-ink-300 text-lg leading-relaxed">
                The rules that apply to NGOreality website, directory, verification, portal, and badge services.
              </p>
              <p className="mt-4 font-mono text-2xs uppercase tracking-wider text-ink-400">
                Last updated {updated}
              </p>
            </div>
          </div>
        </section>

        <section className="border-b-3 border-ink-950">
          <div className="max-w-4xl mx-auto px-6 py-12 md:py-16">
            <div className="card-brutal p-6 md:p-8 bg-teal-light">
              <h2 className="text-xl font-black uppercase tracking-tight mb-3">Important notice</h2>
              <p className="text-sm text-ink-600 leading-relaxed">
                NGOreality helps the public and nonprofits understand digital trust signals. Verification and
                badge status are not legal, accounting, financial, tax, governance, or regulatory advice, and
                they do not replace an organization&apos;s own compliance obligations.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-4xl mx-auto px-6 py-12 md:py-16">
          <div className="space-y-10">
            {sections.map((section) => (
              <section key={section.title} className="border-l-3 border-ink-950 pl-5">
                <h2 className="text-2xl font-black uppercase tracking-tight mb-4">{section.title}</h2>
                <div className="space-y-4">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="text-sm text-ink-600 leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            <section className="border-l-3 border-ink-950 pl-5">
              <h2 className="text-2xl font-black uppercase tracking-tight mb-4">Contact</h2>
              <p className="text-sm text-ink-600 leading-relaxed">
                Questions about these terms can be sent through our{' '}
                <Link to="/public/contact" className="font-semibold text-teal hover:underline">
                  contact page
                </Link>
                .
              </p>
            </section>
          </div>
        </section>
      </div>
    </>
  );
}
