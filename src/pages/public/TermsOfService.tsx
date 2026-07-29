import { Link } from 'react-router-dom';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';

const updated = '29 July 2026';

/**
 * NOT LEGAL ADVICE. These terms were drafted to match what the product actually
 * does and to reflect New Zealand law, but they have not been reviewed by a
 * lawyer. Have them reviewed before relying on them in a dispute.
 *
 * Two things are deliberately NOT what was originally asked for, because as
 * asked they would have reduced protection rather than increased it:
 *
 * 1. "No refunds ever." A blanket bar is likely an unfair contract term in a
 *    standard-form small trade contract (Fair Trading Act 1986 s 26A) and is
 *    misleading if we simply fail to supply. A court that strikes the clause
 *    leaves you with NO refund policy at all. What is written below is a strong
 *    non-refundable default with narrow, honest carve-outs, which survives.
 *
 * 2. "Not liable for anything." A total exclusion is void against the Consumer
 *    Guarantees Act where it applies, unenforceable for fraud, and a classic
 *    unfair term. Again, struck down means unlimited liability. A cap at fees
 *    paid in the last 12 months plus exclusion of indirect loss is the strongest
 *    position that actually holds.
 */

const sections = [
  {
    title: 'Who you are contracting with',
    body: [
      'NGOreality is a trading name of Baqshi Limited, a company registered in New Zealand. In these terms, "we", "us", "our" and "NGOreality" mean Baqshi Limited. Invoices, receipts and bank transfers are issued and received in the name of Baqshi Limited.',
      'These terms apply when you access or use the NGOreality website, public directory, NGO portal, Organisation Workspace, verification services, Reality Badge services, website monitoring, contact forms, and related digital services (together, the "Services").',
      'By using the Services you agree to these terms. If you use the Services on behalf of an organisation, you confirm you are authorised to bind that organisation, and "you" means both you and that organisation.',
    ],
  },
  {
    title: 'What NGOreality is, and is not',
    body: [
      'We provide digital trust infrastructure for nonprofits: public directory listings, website and trust-signal reviews, verification workflows, portal tools, Reality Badge status indicators, website monitoring, and a subscription client management workspace.',
      'We are independent. We are not a government regulator, Charities Services, a legal authority, an auditor, a financial adviser, or a substitute for your own legal, accounting, privacy, cybersecurity or governance advice.',
      'Baqshi Limited is a private company operating for profit. It is not a registered charity and does not hold donee organisation status.',
    ],
  },
  {
    title: 'Accounts and authority',
    body: [
      'You must provide accurate, current and complete information when creating an account, submitting an inquiry, claiming an organisation profile, requesting verification, or using the portal or workspace.',
      'You are responsible for keeping login credentials confidential and for all activity under your account. Tell us promptly if you suspect unauthorised access or a mistake in account permissions.',
      'We may require reasonable evidence that you are authorised to act for an organisation before granting access, changing public details, or issuing a verification outcome.',
      'An organisation may be claimed once. If control of an organisation account needs to change, contact us — we will not transfer access on the basis of an unverified request.',
    ],
  },
  {
    title: 'What the Reality Badge does and does not verify',
    body: [
      'The Reality Badge is a statement about an organisation\u2019s DIGITAL PRESENCE at the time of review, and nothing more. It confirms that we checked, and found satisfactory, matters such as a live and functioning website, a clear mission statement, accessible contact details, a published privacy policy, and mobile usability.',
      'The badge is NOT an assessment of an organisation\u2019s honesty, financial position, solvency, accounting records, governance, safeguarding practices, programme effectiveness, use of donations, legal compliance, or fitness to receive funding. It is not an audit, an endorsement, a recommendation, or a guarantee that an organisation is safe, competent or free from misconduct.',
      'Do not rely on the badge as a reason to donate, contract with, or fund an organisation without your own enquiries. A badge tells you a charity presents itself credibly online. It does not tell you the charity is good.',
      'Verification reflects the information available to us and the standards in force at the time of review. Circumstances change and we do not continuously re-verify every organisation.',
      'Permission to display the Reality Badge is limited, revocable, non-exclusive and non-transferable, and depends on continuing to meet our standards, holding a current membership, and following our brand instructions. We may update, suspend, correct or withdraw a directory listing, verification status or badge where information is inaccurate, incomplete, outdated, disputed, misleading, unlawful, or inconsistent with our standards.',
    ],
  },
  {
    title: 'Directory listings from the public register',
    body: [
      'Our directory includes organisations sourced from the New Zealand Charities Register, which is public information published by Charities Services. Those organisations have not asked to be listed and listing does not imply any relationship with, or endorsement by, us.',
      'A listing drawn from the register shows registry information and publicly observable facts about an organisation\u2019s website. Being listed does not mean an organisation has been verified, holds a Reality Badge, or is a customer.',
      'If your organisation is listed and you believe information is wrong, out of date, or should not appear, contact us. We will correct genuine errors promptly and will consider removal requests in good faith. We may keep a listing where the information is accurate and drawn from the public register.',
    ],
  },
  {
    title: 'Fees, GST, and payment',
    body: [
      'Prices are shown on the relevant page, order, invoice or service description, and are stated EXCLUSIVE of GST. Baqshi Limited is not currently registered for GST, so no GST is charged and you pay the amount shown. If we become GST registered, GST will be added to fees charged from that date and we will tell you before it applies.',
      'Membership is an annual fee paid in advance. The Organisation Workspace is a monthly subscription with a base fee plus a fee for each additional user seat, also paid in advance. One-off services are quoted separately.',
      'Payment is currently by New Zealand bank transfer quoting the payment reference we give you. Card and other electronic payment methods may be offered later. Bank transfers are matched manually and can take up to three business days to be applied to your account.',
      'Benefits begin when payment is received and matched, not when it is sent. If a payment cannot be matched because a reference was omitted or altered, we will do our best to identify it, but we may not be able to.',
      'If payment is not received by the due date we may suspend or withdraw benefits, including badge display rights, monitoring, and workspace access, after giving you notice and a reasonable chance to pay.',
    ],
  },
  {
    title: 'Renewal and cancellation',
    body: [
      'Annual membership does not renew automatically. It runs for twelve months and lapses at the end of that period unless you choose to renew. We will normally remind you before it expires.',
      'The Organisation Workspace subscription continues monthly until you cancel. You may cancel at any time, effective at the end of the current paid month. We do not charge a cancellation fee.',
      'We may change fees for future periods. We will give at least thirty days\u2019 notice before a change takes effect, and you may cancel rather than accept it. We will not change the price of a period you have already paid for.',
      'You may close your account at any time. On closure, badge display rights end immediately and your data is handled as described in the Privacy Policy and, for workspace customers, the Data Processing Addendum.',
    ],
  },
  {
    title: 'Refunds',
    body: [
      'Fees are paid in advance and are NON-REFUNDABLE. In particular, we do not refund an annual membership because you changed your mind, because your circumstances changed, because you did not use the service, because you cancelled part-way through a paid period, or because a verification review did not result in a badge being issued. Reviewing an application takes work whatever its outcome.',
      'This is subject to the following, which we will honour without argument. If we fail to supply a service you have paid for, if we cancel or withdraw a service other than because of your breach, if we have charged you in error or taken a duplicate payment, or if a refund is required by law, we will refund the affected amount.',
      'To the extent the Consumer Guarantees Act 1993 applies, nothing in these terms limits rights you have under it. Where you acquire the Services in trade for the purposes of a business, you and we agree that the Consumer Guarantees Act does not apply, and that it is fair and reasonable to agree this, given the nature of the Services and the price. This does not apply where you are not in trade.',
      'Refunds, where given, are made to the original payer by the original method.',
    ],
  },
  {
    title: 'The Organisation Workspace',
    body: [
      'The Organisation Workspace is a subscription tool in which your organisation records and manages information about the people it supports. Your workspace data is stored in its own database schema, separate from other customers.',
      'YOU decide what information goes into your workspace, why, and for how long it is kept. In privacy terms you are the agency responsible for that information and we hold it on your behalf as a service provider. The Data Processing Addendum sets out how we handle it and what we will and will not do with it.',
      'You are responsible for having a lawful basis to collect and hold information about the people you support, for telling them what you are doing with it, for obtaining any consent required, for the accuracy of what you record, and for who in your organisation you give access to. We provide role-based access controls; choosing who gets which role is your decision.',
      'You must not use the workspace to store information you have no lawful reason to hold, and you must not use it as your only copy of records you are legally required to retain. Export your data regularly. Export tools are provided.',
      'We do not access, read, analyse, sell, share or use your workspace data for our own purposes, and we do not use it to train machine learning models. We may access it only where you ask us to for support, where it is necessary to fix a fault or maintain security, or where the law requires it.',
      'Seats are billed by the number of active users in your workspace. You are responsible for removing people who no longer need access, both for billing and for security.',
    ],
  },
  {
    title: 'Website monitoring',
    body: [
      'Monitoring checks whether your website responds from our monitoring location, at the frequency stated for your plan, and may alert you by email if it appears to be down.',
      'Monitoring is provided on a best-efforts basis. It is not a guaranteed service, has no service level agreement, and is not a substitute for your own hosting arrangements, backups or uptime monitoring. Checks can be delayed, missed or wrong, alerts can fail to arrive or arrive late, and a site can be broken in ways an availability check cannot see.',
      'We are not responsible for any loss arising because monitoring failed to detect an outage, failed to alert you, alerted you late, or alerted you incorrectly.',
    ],
  },
  {
    title: 'Supporting NGOreality',
    body: [
      'You may choose to give money to support our work. Please read this before you do.',
      'Baqshi Limited is a private company operating for profit. It is NOT a registered charity and does NOT hold donee organisation status with Inland Revenue. A payment to us is a voluntary contribution to a business, not a charitable donation.',
      'This means: you cannot claim a donation tax credit or deduction for it; we cannot issue a donation receipt for tax purposes; and the money is not held on trust or restricted to any particular purpose. We may use it for any business purpose.',
      'Contributions are voluntary, final and non-refundable once received, except where we have charged you in error, taken a duplicate payment, or a refund is required by law.',
      'A contribution does not buy verification, a Reality Badge, a directory position, a favourable review, or any other benefit. Verification outcomes are decided on our published standards alone and are not for sale. If you have paid us to support our work and later apply for verification, your application is assessed exactly as anyone else\u2019s would be.',
      'If you intended to donate to a charity listed in our directory, do not pay us. Give directly to that charity.',
    ],
  },
  {
    title: 'Your content and responsibilities',
    body: [
      'You keep ownership of content you provide, including organisation details, logos, documents and workspace data. You give us the rights we need to host, process, display and back it up so we can provide the Services, and to show your public profile information in the directory.',
      'You are responsible for making sure content you give us is accurate, that you have the right to provide it, and that publishing it does not breach anyone else\u2019s rights or the law.',
      'You must not use the Services to store or transmit anything unlawful, misleading, defamatory, or harmful, or to impersonate another organisation.',
    ],
  },
  {
    title: 'Acceptable use',
    body: [
      'Do not attempt to gain unauthorised access to any part of the Services, another customer\u2019s data, or our infrastructure; probe or test our security without our written permission; scrape or bulk-extract the directory; overload or disrupt the Services; or misrepresent your verification or badge status.',
      'Displaying a Reality Badge you do not currently hold, or that has expired or been withdrawn, is a breach of these terms and may also be misleading conduct under the Fair Trading Act 1986.',
      'We may suspend or terminate access immediately, without refund, for a serious or repeated breach of this section.',
    ],
  },
  {
    title: 'Intellectual property',
    body: [
      'The Services, the NGOreality name and logo, the Reality Badge design and mark, our standards, and the structure and presentation of the directory are owned by Baqshi Limited or our licensors.',
      'Nothing in these terms transfers ownership to you. Permission to display the Reality Badge is a licence on the terms described above and ends when your entitlement ends.',
      'Directory information sourced from the New Zealand Charities Register remains public register information and is used as published by Charities Services.',
    ],
  },
  {
    title: 'Third-party services',
    body: [
      'The Services rely on third-party providers for hosting, databases, email delivery, content delivery and payments. A failure, outage, change or security incident at a provider can affect the Services, and some are outside New Zealand. The Privacy Policy lists who they are and what they handle.',
      'Links to third-party websites are provided for convenience. We do not control and are not responsible for their content, practices or availability.',
    ],
  },
  {
    title: 'Availability and changes',
    body: [
      'We aim to keep the Services available but do not guarantee uninterrupted or error-free operation. We may modify, suspend or discontinue any part of the Services. Where a change materially reduces a paid service, we will give reasonable notice and, if you do not accept it, refund the unused portion of what you have paid.',
      'We may update these terms. Changes take effect when published, except that a change which materially affects your rights or obligations applies from thirty days after we publish it, or from your next renewal, whichever is sooner. The "last updated" date at the top shows when we last changed them. Continuing to use the Services after that means you accept the change.',
    ],
  },
  {
    title: 'Limitation of liability',
    body: [
      'Nothing in these terms limits liability that cannot lawfully be limited. That includes liability for fraud, for fraudulent misrepresentation, for death or personal injury caused by negligence, and rights under the Consumer Guarantees Act 1993 where it applies and cannot be excluded.',
      'Subject to that, and to the maximum extent the law allows: we provide the Services "as is" and "as available"; we exclude all implied warranties, terms and guarantees; and we are not liable for indirect or consequential loss, loss of profits, loss of revenue, loss of goodwill or reputation, loss of anticipated savings, loss of donations or funding, business interruption, or loss or corruption of data.',
      'Subject to the first paragraph of this section, our total liability to you for all claims arising out of or in connection with the Services, whether in contract, tort (including negligence), equity, under statute or otherwise, is limited in aggregate to the total fees you actually paid us in the twelve months immediately before the event giving rise to the claim. Where you have paid us nothing, our total liability is limited to NZ$100.',
      'We are not liable for loss arising from: your own acts or omissions; anything you or your people record, publish or do in the workspace or portal; a third party relying on a directory listing, verification outcome or badge; the accuracy of information published on the New Zealand Charities Register; a failure or delay of a third-party provider; or events outside our reasonable control.',
      'Each limitation and exclusion in this section operates separately. If one is held unenforceable, the others continue to apply.',
      'You must bring any claim within twelve months of becoming aware of the circumstances giving rise to it.',
    ],
  },
  {
    title: 'Indemnity',
    body: [
      'You indemnify us against claims, losses and reasonable costs arising from your breach of these terms, from content or data you provide, from your use of the workspace to hold information about other people, and from your display of the Reality Badge otherwise than as permitted.',
      'This does not apply to the extent the claim results from our own breach or negligence.',
    ],
  },
  {
    title: 'Suspension and termination',
    body: [
      'We may suspend or terminate your access if you breach these terms, if payment is overdue after notice, if we are required to by law, or if continuing would expose us or others to material risk. Where practical we will tell you first and give you a chance to fix the problem.',
      'On termination, your right to use the Services and display the Reality Badge ends immediately. Fees already paid are not refunded where termination is because of your breach. You may request an export of your workspace data within thirty days of termination, after which it may be deleted.',
    ],
  },
  {
    title: 'Governing law and disputes',
    body: [
      'These terms are governed by New Zealand law, and the New Zealand courts have exclusive jurisdiction.',
      'If something goes wrong, contact us first. Most problems are resolved quickly that way, and we would rather fix an issue than argue about it.',
    ],
  },
  {
    title: 'General',
    body: [
      'If any provision is held invalid or unenforceable, it is severed and the rest continues in force.',
      'A delay in enforcing a right is not a waiver of it.',
      'You may not transfer your rights under these terms without our written consent. We may transfer ours as part of a sale or reorganisation of the business, provided your rights are not reduced.',
      'These terms, together with the Privacy Policy and — for workspace customers — the Data Processing Addendum, are the entire agreement between us about the Services.',
    ],
  },
];

export default function TermsOfService() {
  return (
    <>
      <SEO
        title="Terms of Service"
        description="Terms of Service for NGOreality (Baqshi Limited) — directory, verification, Reality Badge, website monitoring, Organisation Workspace, payments and support contributions."
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
                The rules that apply to the NGOreality website, directory, verification, Reality Badge, website monitoring, and the Organisation Workspace. NGOreality is a trading name of Baqshi Limited.
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
