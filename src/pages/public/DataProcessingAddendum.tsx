import { Link } from 'react-router-dom';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';

const updated = '29 July 2026';

/**
 * NOT LEGAL ADVICE. Drafted against the Privacy Act 2020 and against what the
 * software actually enforces, but not reviewed by a lawyer.
 *
 * This document exists because a charity cannot lawfully put its clients'
 * records into someone else's software on a handshake. Its funders and its own
 * board will ask what happens to that information, and "it's in the privacy
 * policy" is not an answer — a privacy policy describes what WE do with OUR
 * data, and these records are not ours.
 *
 * Every commitment below is one the code actually keeps. Where something is
 * recorded but not yet enforced — retention is the live example — it says so
 * rather than promising it. A legal document describing behaviour the software
 * does not have is worse than no document, because it is a misrepresentation
 * with a signature on it.
 */
const sections = [
  {
    title: 'What this document is',
    body: [
      'This Data Processing Addendum applies when your organisation uses the NGOreality Organisation Workspace to record information about the people you support. It forms part of our Terms of Service.',
      'It exists because those records are not ours. You collected them, you are answerable for them, and you need to know exactly what we will and will not do with them. If our Terms of Service and this Addendum disagree about workspace data, this Addendum wins.',
      'In this document "you" means the organisation using the workspace, and "we" means Baqshi Limited, trading as NGOreality.',
    ],
  },
  {
    title: 'Who is responsible for what',
    body: [
      'YOU are the agency for the client records in your workspace, under the Privacy Act 2020. You decide what to collect, why, who may see it, and how long to keep it. You are responsible for having a lawful purpose, for giving the people concerned the information required by Information Privacy Principle 3, for obtaining any consent required, and for the accuracy of what you record.',
      'WE are your service provider. Under section 11 of the Privacy Act 2020, information we hold solely for the purpose of providing this service to you is treated as held by you, not by us. We act only on your instructions.',
      'Using the workspace is your instruction to us to store and process those records so we can provide the service. We will not do anything else with them.',
    ],
  },
  {
    title: 'What we will not do',
    body: [
      'We will not sell your client records, or share them with anyone for their own purposes.',
      'We will not use them for our own analytics, product research, marketing or benchmarking.',
      'We will not use them to train machine learning or artificial intelligence models.',
      'We will not use them to contact the people you support.',
      'We will not disclose them to another customer, and no other customer can reach them.',
      'These are not aspirations. They are commitments, and they are enforceable against us.',
    ],
  },
  {
    title: 'Who at NGOreality can see your records',
    body: [
      'In normal operation, nobody. A staff account on the NGOreality platform carries no permissions inside your workspace, and our ordinary administrative rights grant nothing there.',
      'There is one exception and we would rather describe it than let you discover it. We keep a break-glass support path that can grant a person access to a workspace \u2014 it exists so that a charity which has locked itself out can get back in. It is the only way our people can reach your records.',
      'It cannot be used quietly. Using it requires a written reason; granting ownership requires a separate explicit confirmation; and every use writes an entry into YOUR OWN audit log, visible to your administrators, recording who was granted access, what role, when, and why. It is also recorded on our side.',
      'So the protection we are offering you is not \u201cwe promise not to look\u201d. It is \u201cwe cannot look without leaving a record in your workspace that you can read\u201d. Check your audit log; if you see an entry you did not expect, ask us and we will account for it.',
      'Beyond that, we access your records only where you ask us to for support, where it is strictly necessary to diagnose a fault or contain a security incident, or where we are compelled by law. Where the law compels disclosure we will tell you first, unless legally prohibited from doing so.',
    ],
  },
  {
    title: 'How your data is kept separate',
    body: [
      'Each customer’s workspace lives in its own database schema. Your records are not stored in shared tables alongside another organisation’s, and there is no query that returns rows from two customers.',
      'The separation is enforced at the database connection level on every request. Automated tests specifically attempt to reach one customer’s data while authenticated as another, and must fail, before code is released.',
      'Workspace data is held in a separate database from our public directory and marketing site. A compromise of the public website does not reach client records.',
    ],
  },
  {
    title: 'Especially sensitive information',
    body: [
      'The workspace can hold ethnicity, iwi affiliation, gender, health notes, legal status and risk flags. These are stored in a separate, more tightly controlled table.',
      'Staff you assign to limited roles — volunteer or viewer — cannot read those fields. For those users the information is never sent to their browser at all, rather than being fetched and hidden in the interface. The same applies to case notes you mark as restricted.',
      'You decide who holds which role. We provide the controls; the decision about who in your organisation should see a client’s health information is yours and cannot be ours.',
      'If your organisation provides health or disability services, the Health Information Privacy Code 2020 may apply to you and imposes stricter obligations than the general principles. Please take your own advice on that before recording health information.',
    ],
  },
  {
    title: 'Records that cannot be altered',
    body: [
      'Case notes cannot be edited or deleted once saved. A correction is made by adding a further note. This is enforced by the database, not by the interface, so it holds even against a fault in our software.',
      'The access log records who did what and when, including who READ a client record and who exported data — not only who changed something. It is append-only for the same reason.',
      'This protects your organisation as much as the people you support: it means your records can be relied on later.',
    ],
  },
  {
    title: 'Where your data is held',
    body: [
      'Workspace data is hosted with Railway. Our authentication and platform data is hosted with Supabase in Sydney, Australia. Email is sent through Resend. The website is delivered through Vercel and Cloudflare.',
      'Storing New Zealand personal information overseas is a cross-border disclosure under Information Privacy Principle 12. We rely on these providers being contractually required to protect personal information to a comparable standard.',
      'We will tell you before adding a sub-processor that handles workspace data, so that you can object.',
      'If your funding or contracts require client data to remain in New Zealand, tell us before you subscribe. We cannot currently offer that, and it is better that you know now than after you have loaded a caseload.',
    ],
  },
  {
    title: 'Getting your data out',
    body: [
      'You can export your client records and service delivery records to CSV at any time, from within the workspace, without asking us.',
      'We encourage you to export regularly and keep your own copy. Do not rely on the workspace as the only copy of records you are legally required to retain.',
      'If you leave, you may request a full export within thirty days of your account closing.',
    ],
  },
  {
    title: 'Deletion',
    body: [
      'You may delete individual client records at any time.',
      'When your account is closed, your workspace and every record in it can be deleted permanently on request, including the database schema itself. Deletion is irreversible, so we will ask you to confirm in a way that cannot be done by accident.',
      'Backups are retained for a limited period after deletion and then expire. We will not restore deleted data from a backup for our own purposes.',
    ],
  },
  {
    title: 'Retention — what is true today',
    body: [
      'The workspace lets you record a retention period for client records, and we recommend setting one that matches your obligations and your funders’ requirements.',
      'Being straight with you: that setting is currently a record of your policy, not an automatic deletion schedule. We do not yet delete records automatically when the period expires. Until we do, deciding when to remove records remains a task for your organisation.',
      'We would rather tell you this than let you assume a control exists that does not.',
    ],
  },
  {
    title: 'If something goes wrong',
    body: [
      'If we become aware of a security or privacy breach affecting your workspace data, we will notify you without undue delay and give you what we know: what happened, which records were affected, what we have done, and what we recommend.',
      'You remain the agency for your records, so any notification to the Office of the Privacy Commissioner or to affected people under the notifiable breach scheme is yours to make. We will give you the information and assistance you reasonably need to do it properly and on time.',
    ],
  },
  {
    title: 'Helping people exercise their rights',
    body: [
      'People you support have the right to ask you for access to information you hold about them, and to ask you to correct it. Those requests are yours to answer, because the records are yours.',
      'If such a request reaches us, we will not answer it. We will pass it to you promptly, and we will give you reasonable assistance to locate and produce the information.',
    ],
  },
  {
    title: 'Your responsibilities',
    body: [
      'Collect only what you have a lawful purpose to collect, and tell people what you are doing with it.',
      'Give access only to people who need it, and remove people who leave. Seats are yours to manage.',
      'Do not put information into the workspace that you have no lawful reason to hold.',
      'Keep your own exports of anything you are legally required to retain.',
      'Tell us promptly if an account has been compromised.',
    ],
  },
  {
    title: 'Changes',
    body: [
      'We may update this Addendum as the service changes. Where a change reduces a protection given here, we will tell you at least thirty days before it takes effect, and you may cancel rather than accept it.',
    ],
  },
];

export default function DataProcessingAddendum() {
  return (
    <>
      <SEO
        title="Data Processing Addendum"
        description="How NGOreality (Baqshi Limited) handles the client and case records a charity stores in the Organisation Workspace, under the Privacy Act 2020."
        path="/public/data-processing"
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', path: '/public' },
          { name: 'Data Processing Addendum', path: '/public/data-processing' },
        ]}
      />

      <div>
        <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-accent" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">Legal</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4">
                Data Processing Addendum
              </h1>
              <p className="text-ink-300 text-lg leading-relaxed">
                What happens to the records your organisation keeps about the people it supports.
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
              <h2 className="text-xl font-black uppercase tracking-tight mb-3">In one sentence</h2>
              <p className="text-sm text-ink-600 leading-relaxed">
                The records you keep about the people you support belong to your organisation, not to
                us. We hold them on your behalf, we do not read them, we never sell or share them, we
                do not train AI on them, and you can export or delete them whenever you choose.
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
              <h2 className="text-2xl font-black uppercase tracking-tight mb-4">Related</h2>
              <p className="text-sm text-ink-600 leading-relaxed">
                See also our{' '}
                <Link to="/public/privacy" className="font-semibold text-teal hover:underline">
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link to="/public/terms" className="font-semibold text-teal hover:underline">
                  Terms of Service
                </Link>
                . Questions can be sent through our{' '}
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
