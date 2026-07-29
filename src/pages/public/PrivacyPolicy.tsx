import { Link } from 'react-router-dom';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';

const updated = '29 July 2026';

/**
 * NOT LEGAL ADVICE. Drafted against what the product actually does and against
 * the Privacy Act 2020, but not reviewed by a lawyer.
 *
 * The critical structural point is the split in "Two very different roles"
 * below. For our own customer data we are the agency. For the beneficiary
 * records a charity keeps in the Organisation Workspace we are a service
 * provider holding information on that charity's behalf (Privacy Act 2020,
 * s 11). Conflating the two would have us claiming rights over information
 * about vulnerable people that is not ours, and would leave the charity without
 * the processor commitments it needs to meet its own obligations.
 */

const sections = [
  {
    title: 'Who we are',
    body: [
      'NGOreality is a trading name of Baqshi Limited, a company registered in New Zealand. Baqshi Limited is the agency responsible under the Privacy Act 2020 for the personal information described in this policy, except where we say otherwise.',
      'This policy applies to visitors to our website, nonprofit representatives, directory participants, verification applicants, portal and workspace users, people who contact us, and people who support us financially.',
      'We handle personal information in accordance with the Privacy Act 2020 and the Information Privacy Principles.',
    ],
  },
  {
    title: 'Two very different roles \u2014 please read this part',
    body: [
      'We hold two kinds of personal information and our responsibilities are not the same for each.',
      'FIRST: information about our own users and customers \u2014 the people who run charities and sign up with us. For that information we are the agency. We decide what to collect and why, and this policy explains it.',
      'SECOND: information a charity records in the Organisation Workspace about the people IT supports \u2014 its clients, service users and beneficiaries. That information is not ours. The charity decides what to collect, why, and how long to keep it. We hold it on the charity\u2019s behalf as its service provider, under section 11 of the Privacy Act 2020, and we act only on that charity\u2019s instructions.',
      'If you are a person supported by a charity and you want to know what that charity holds about you, ask the charity, not us. We cannot answer for them, and we will not hand over their records to anyone else \u2014 including to you \u2014 without their instruction. If you contact us we will pass your request to them.',
      'The commitments we give charities about that information are in our Data Processing Addendum.',
    ],
  },
  {
    title: 'Information we collect about our users',
    body: [
      'Account information: name, email address, the organisation you act for, and your role. Passwords are handled by our authentication provider and we never see them.',
      'Organisation information: the details you give us or confirm about your charity \u2014 name, registration number, website, contact details, logo, mission and brand colours \u2014 together with registry information published by Charities Services.',
      'Verification information: your answers and evidence relating to trust standards, application and review notes, badge status and history.',
      'Billing information: payment references, amounts, dates, status, and correspondence about payments. We do not collect or store card numbers; where card payment is offered it is handled by a payment provider and card details never reach our systems.',
      'Support and contact information: messages you send us and our replies.',
      'Technical information: IP address, browser and device information, pages visited, and error logs, used to keep the service working and secure.',
    ],
  },
  {
    title: 'Information in the Organisation Workspace',
    body: [
      'The workspace is built to hold sensitive information, because case management requires it. Depending on what a charity chooses to record, it can contain: names, dates of birth, contact details and addresses; case notes and service delivery records; consent records; uploaded documents; and, in a separately protected area, ethnicity, iwi affiliation, gender, health notes, legal status and risk flags.',
      'We know how sensitive that is, and the system is built accordingly. Each charity\u2019s data lives in its own database schema, not mixed in shared tables. The most sensitive fields sit in a separate table that staff on limited roles cannot read \u2014 for those users the information is never sent to their browser at all, not merely hidden. Case notes and the access log cannot be edited or deleted once written.',
      'NGOreality personnel have no standing access to any charity\u2019s workspace records. Our staff permissions grant nothing inside a charity\u2019s workspace. Access happens only where the charity asks us to help, where it is strictly necessary to fix a fault or respond to a security incident, or where the law requires it \u2014 and it is logged.',
      'We do not sell workspace data, share it with anyone for their own purposes, use it for analytics or marketing, or use it to train machine learning models. Ever.',
    ],
  },
  {
    title: 'How we collect information',
    body: [
      'Directly from you, when you create an account, claim an organisation, apply for verification, contact us, or use the portal and workspace.',
      'From the New Zealand Charities Register, which is public information published by Charities Services. This is how most directory listings begin, before any organisation has contacted us.',
      'Automatically, through your use of the website and through website monitoring checks of publicly accessible pages.',
    ],
  },
  {
    title: 'Why we use information',
    body: [
      'To provide the services: create and secure accounts, publish directory listings, carry out verification reviews, issue and maintain badges, run website monitoring and alerts, and operate the workspace.',
      'To communicate: confirm applications, send payment instructions and receipts, notify you about your badge, monitoring alerts, service changes, and to answer your questions.',
      'To take payment and keep the financial records the law requires us to keep.',
      'To keep the platform secure and working, investigate misuse, and meet our legal obligations.',
      'We do not sell personal information. We do not use workspace data for any purpose of our own.',
    ],
  },
  {
    title: 'The public directory',
    body: [
      'Our directory lists organisations, not individuals. It shows organisational information \u2014 charity name, registration number, website, publicly listed contact details, sector and location \u2014 sourced from the public Charities Register and from information organisations give us.',
      'Where a charity publishes a person\u2019s name or email as its public contact, that will appear as the charity publishes it. If you would rather it did not, ask us and we will remove it from our listing.',
      'Verification outcomes, badge status and badge history are published for verified organisations, because a trust signal nobody can check is worthless.',
      'If your organisation is listed and something is wrong, contact us. We will correct genuine errors promptly and consider removal requests in good faith.',
    ],
  },
  {
    title: 'Who we share information with',
    body: [
      'Service providers who help us run the platform, listed below. They act on our instructions and may not use information for their own purposes.',
      'Supabase \u2014 database, authentication and file storage, hosted in Sydney, Australia. Holds account, organisation, verification, badge, monitoring and billing information.',
      'Railway \u2014 hosting for the workspace service and its database. Holds workspace client and case records.',
      'Vercel \u2014 hosting and delivery of the website.',
      'Cloudflare \u2014 DNS, network delivery and protection against abuse.',
      'Resend \u2014 sending our emails. Receives recipient addresses and message content. We do not put workspace client or case details into email.',
      'Payment providers \u2014 where electronic payment is offered, to process the payment. They see what is needed to take it; we never see card numbers.',
      'We also disclose information where the law requires it, to protect someone\u2019s safety, to establish or defend a legal claim, or with your authorisation. If our business is sold or reorganised, information may transfer to the buyer, who must continue to handle it under a policy no less protective than this one.',
    ],
  },
  {
    title: 'Information held overseas',
    body: [
      'Our databases are hosted in Sydney, Australia, and some providers process information in other countries. Sending personal information overseas is a disclosure under Information Privacy Principle 12.',
      'We rely on those providers being required, by contract, to protect personal information to a standard comparable to the Privacy Act 2020. Australia has a broadly comparable privacy regime.',
      'If your organisation needs its information to stay in New Zealand \u2014 which some government-funded services require \u2014 tell us before you sign up, because we cannot currently offer that.',
    ],
  },
  {
    title: 'Security',
    body: [
      'Connections are encrypted in transit and data is encrypted at rest by our hosting providers. Access is restricted by role and separated between customers at the database level.',
      'Passwords are handled by our authentication provider; we cannot see them. Access to production systems is limited to those who need it.',
      'No system is completely secure and we do not claim otherwise. If a privacy breach occurs that is likely to cause serious harm, we will notify the Office of the Privacy Commissioner and affected people as required by the Privacy Act 2020, and \u2014 where it involves a charity\u2019s workspace data \u2014 we will notify that charity without undue delay so it can meet its own obligations.',
    ],
  },
  {
    title: 'How long we keep information',
    body: [
      'Account and organisation information: while your account is active, and for up to seven years afterwards where it forms part of records we must keep.',
      'Financial records: seven years, as required by New Zealand law.',
      'Verification and badge records: while the organisation is listed, and afterwards as a record of what was assessed and when.',
      'Website monitoring results: recent detailed results are pruned; incident summaries are kept longer.',
      'Workspace data: kept as long as the charity instructs. The charity sets its own retention period. On request, or within a reasonable period after an account is closed, the workspace and everything in it is deleted.',
      'We may keep information longer where the law requires it or where it is needed for a legal claim.',
    ],
  },
  {
    title: 'Cookies',
    body: [
      'We use cookies and similar storage to keep you signed in, remember preferences such as light or dark mode, and keep the site secure. These are necessary for the site to work.',
      'We do not use advertising cookies and we do not track you across other websites.',
    ],
  },
  {
    title: 'Your rights',
    body: [
      'You may ask for access to the personal information we hold about you, and ask us to correct it if it is wrong. We will respond as soon as we reasonably can and within twenty working days.',
      'You may withdraw consent for optional communications at any time, and close your account at any time.',
      'If you are unhappy with how we have handled your information, tell us first and we will try to put it right. You may also complain to the Office of the Privacy Commissioner \u2014 privacy.org.nz, 0800 803 909.',
      'Again: if you are a person supported by a charity that uses our workspace, direct requests about those records to the charity. It decides, not us.',
    ],
  },
  {
    title: 'Changes to this policy',
    body: [
      'We may update this policy as the services change. The "last updated" date at the top shows when it last changed. Where a change materially affects how we handle your information, we will tell you before it takes effect.',
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <>
      <SEO
        title="Privacy Policy"
        description="Privacy Policy for NGOreality (Baqshi Limited) \u2014 how we handle personal information, and how we hold beneficiary records on behalf of charities under the Privacy Act 2020."
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
