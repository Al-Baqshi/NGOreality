import { Link } from 'react-router-dom';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';

const updated = '10 June 2026';

const sections = [
  {
    title: 'Who this policy applies to',
    body: [
      'This Privacy Policy applies to NGOreality public website visitors, nonprofit representatives, staff users, directory participants, and people who contact us, create an NGO portal account, request verification, or otherwise use NGOreality services.',
      'NGOreality is operated from New Zealand. We handle personal information in accordance with the Privacy Act 2020 and the Information Privacy Principles, including transparency, purpose limitation, security, access, correction, and responsible disclosure.',
    ],
  },
  {
    title: 'Personal information we collect',
    body: [
      'We may collect identity and contact details, including names, roles, email addresses, phone numbers, organization names, login details, and communications with us.',
      'We may collect organization and verification information, including public registry details, website details, ownership or authority confirmations, evidence submitted for verification, badge requests, service requests, billing references, and notes required to administer NGOreality services.',
      'We may collect technical and usage information, including device, browser, IP address, security-check results, pages viewed, timestamps, form events, and diagnostic logs needed to operate, secure, and improve the website.',
      'We do not knowingly ask for sensitive personal information unless it is reasonably necessary for a specific service request. Please do not submit health, financial, identity-document, or other sensitive information unless we specifically request it through a secure process.',
    ],
  },
  {
    title: 'How we collect information',
    body: [
      'We collect information directly from you when you submit forms, register or sign in, communicate with us, request verification, manage an NGO profile, or use the NGO portal.',
      'We may collect information from public sources, including New Zealand public registers and organization websites, where that information is relevant to directory listing, verification, fraud prevention, or public trust signals.',
      'We may receive limited information from service providers that support hosting, security, authentication, payments, analytics, email delivery, and operational support.',
    ],
  },
  {
    title: 'Why we use information',
    body: [
      'We use personal information to provide, administer, and secure NGOreality services; verify organization claims; assess badge eligibility; maintain public directory records; respond to inquiries; process billing and service requests; prevent misuse; meet legal obligations; and improve the reliability and usability of the platform.',
      'We may use contact details to send service messages, verification updates, security notices, billing messages, and requested communications. We will only send marketing communications where permitted and you can opt out of non-essential messages.',
    ],
  },
  {
    title: 'Public directory and verification information',
    body: [
      'NGOreality is a trust and verification platform. Some organization information is intended to be public, including organization name, category, public website, registry status, verification status, badge status, and other trust signals shown on public profiles.',
      'We do not intentionally publish private contact details, private documents, payment information, internal notes, or portal account data unless you have authorised publication or publication is otherwise lawful and appropriate.',
    ],
  },
  {
    title: 'Sharing and disclosure',
    body: [
      'We may share information with contractors and service providers who help us operate the website, portal, database, hosting, security, analytics, communications, payment, and support systems. They may only use the information for the services they provide to us.',
      'We may disclose information to professional advisers, insurers, payment providers, regulators, courts, law enforcement, or other parties where required or permitted by law, to enforce our terms, to protect rights and safety, or to investigate suspected misuse.',
      'If NGOreality is reorganised, merged, funded, or transferred, relevant information may be disclosed to advisers and successor operators under confidentiality and privacy protections.',
    ],
  },
  {
    title: 'Storage, security, and overseas processing',
    body: [
      'We use administrative, technical, and organisational safeguards designed to protect personal information from loss, unauthorised access, misuse, disclosure, alteration, and destruction.',
      'Some technology providers may store or process information outside New Zealand. Where we disclose personal information offshore, we take reasonable steps to ensure appropriate privacy safeguards are in place, or that another exception under the Privacy Act 2020 applies.',
      'No online service can guarantee absolute security. If we become aware of a privacy breach that has caused, or is likely to cause, serious harm, we will notify affected individuals and the Office of the Privacy Commissioner where required by New Zealand law.',
    ],
  },
  {
    title: 'Retention',
    body: [
      'We keep personal information only for as long as reasonably required for the purposes described in this policy, including service delivery, verification history, audit trails, legal obligations, dispute management, security, accounting, and business records.',
      'When information is no longer required, we will take reasonable steps to delete, de-identify, or securely archive it.',
    ],
  },
  {
    title: 'Cookies and similar technologies',
    body: [
      'We may use cookies, local storage, analytics, security checks, and similar technologies to keep the website working, remember preferences, manage sessions, protect forms from abuse, measure usage, and improve services.',
      'You can control cookies through your browser settings. Some features may not work correctly if required cookies or storage are disabled.',
    ],
  },
  {
    title: 'Access, correction, and complaints',
    body: [
      'You may request access to personal information we hold about you, and you may ask us to correct it if it is inaccurate, incomplete, or misleading. We may need to verify your identity before responding.',
      'If you have a privacy concern, please contact us first so we can try to resolve it. You may also complain to the New Zealand Office of the Privacy Commissioner.',
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <>
      <SEO
        title="Privacy Policy"
        description="NGOreality Privacy Policy for website visitors, nonprofit representatives, verification applicants, and portal users in New Zealand."
        path="/public/privacy"
      />
      <BreadcrumbJsonLd items={[{ name: 'Home', path: '/public' }, { name: 'Privacy Policy', path: '/public/privacy' }]} />

      <div>
        <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-accent" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Legal</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4">
                Privacy Policy
              </h1>
              <p className="text-ink-300 text-lg leading-relaxed">
                How NGOreality collects, uses, stores, and discloses personal information.
              </p>
              <p className="mt-4 font-mono text-2xs uppercase tracking-wider text-ink-400">
                Last updated {updated}
              </p>
            </div>
          </div>
        </section>

        <section className="border-b-3 border-ink-950">
          <div className="max-w-4xl mx-auto px-6 py-12 md:py-16">
            <div className="card-brutal p-6 md:p-8 bg-accent-light">
              <h2 className="text-xl font-black uppercase tracking-tight mb-3">Plain English summary</h2>
              <p className="text-sm text-ink-600 leading-relaxed">
                NGOreality uses personal information to run a New Zealand-based nonprofit verification and
                directory platform. We collect only what is reasonably needed, protect it, publish only the
                organization information intended for public trust purposes, and respect access and correction
                rights under the Privacy Act 2020.
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
              <h2 className="text-2xl font-black uppercase tracking-tight mb-4">Contact us</h2>
              <p className="text-sm text-ink-600 leading-relaxed">
                For privacy requests or questions, contact NGOreality through our{' '}
                <Link to="/public/contact" className="font-semibold text-teal hover:underline">
                  contact page
                </Link>
                . Please include enough detail for us to identify the information or account involved.
              </p>
            </section>
          </div>
        </section>
      </div>
    </>
  );
}
