import { Link } from 'react-router-dom';
import { ArrowRight, Database, FileText, Lock, Users } from 'lucide-react';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';

/**
 * Public marketing page for the Organisation Workspace (the case management CRM).
 *
 * Every claim here was checked against docs/CRM_SAAS.md and
 * docs/PRIVACY_AND_RESIDENCY.md. Some deliberately careful wording:
 *
 *  - "No NGOreality staff account can open your client records" — NOT "we
 *    cannot". There is no encryption at rest against us and no tenant-held
 *    key. The people who run the database could reach the data; what is true
 *    is that no staff account has a route in and there is no impersonation.
 *  - Role enforcement is described as the software withholding fields, not as
 *    a database-level control. The live product is the Go service, which has
 *    no RLS inside a tenant schema (docs/CRM_SAAS.md: "The API enforces them").
 *  - Sensitive-field protection is scoped to structured fields. Case notes are
 *    free text and default to team-visible, so anything typed into a note is
 *    visible to volunteers. Saying otherwise would mislead a charity into
 *    recording health information where a volunteer can read it.
 *  - Hosting says "offshore, not in New Zealand" WITHOUT naming a region. The
 *    ap-southeast-2 value in the codebase is a self-declared default string,
 *    not a verified fact about where the Railway database runs. Naming a wrong
 *    region in a cross-border disclosure is worse than naming none.
 */
export default function Workspace() {
  return (
    <>
      <SEO
        title="Organisation Workspace"
        description="Private case management for New Zealand charities. Clients, cases, notes, consents and funder reports — separate from your public profile."
        path="/public/workspace"
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', path: '/public' },
          { name: 'Organisation Workspace', path: '/public/workspace' },
        ]}
      />

      <div>
        {/* Hero */}
        <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-teal" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">
                  Organisation Workspace
                </span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-4">
                Case management, kept private
              </h1>
              <p className="text-ink-300 text-lg">
                A private place to manage the people your charity helps. Clients, cases,
                notes, consents and funder reports. Your team sees it, by the role you
                give each person. No NGOreality staff account can open your client records.
              </p>
            </div>
          </div>
        </section>

        {/* The spreadsheet problem */}
        <section className="border-b-3 border-ink-950">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl mb-12">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-accent" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">
                  The problem
                </span>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tight md:text-4xl">
                Most charities run on a spreadsheet
              </h2>
              <p className="text-sm text-ink-500 mt-2">
                It works until it does not.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="card-brutal-hover p-6">
                <div className="mb-3 font-mono text-2xs font-semibold tracking-widest text-accent">01</div>
                <h3 className="mb-3 text-lg font-black uppercase tracking-tight">Everyone sees everything</h3>
                <p className="text-sm leading-relaxed text-ink-500">
                  A shared sheet cannot keep a volunteer out of one column and let a
                  caseworker in. Sensitive details end up visible to whoever has the link.
                </p>
              </div>
              <div className="card-brutal-hover p-6">
                <div className="mb-3 font-mono text-2xs font-semibold tracking-widest text-accent">02</div>
                <h3 className="mb-3 text-lg font-black uppercase tracking-tight">No record of who changed what</h3>
                <p className="text-sm leading-relaxed text-ink-500">
                  When a client asks what you hold about them, or a funder asks how a
                  figure was reached, a spreadsheet cannot answer.
                </p>
              </div>
              <div className="card-brutal-hover p-6">
                <div className="mb-3 font-mono text-2xs font-semibold tracking-widest text-accent">03</div>
                <h3 className="mb-3 text-lg font-black uppercase tracking-tight">Reporting is a week of work</h3>
                <p className="text-sm leading-relaxed text-ink-500">
                  Counting sessions and outcomes by hand, every quarter, from a file
                  several people have edited.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* What it does */}
        <section className="border-b-3 border-ink-950 bg-surface-overlay">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl mb-12">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-teal" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">
                  What you get
                </span>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tight md:text-4xl">
                Built around case work
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="card-brutal-hover border-t-4 border-t-teal p-6">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center bg-teal text-white">
                  <Users size={22} aria-hidden />
                </div>
                <h3 className="mb-3 text-lg font-black uppercase tracking-tight">Clients and cases</h3>
                <p className="text-sm leading-relaxed text-ink-500">
                  Record who you are helping, open a case, assign a caseworker, and keep
                  the history in one place. Add your own fields when the standard ones do
                  not fit your programme.
                </p>
              </div>
              <div className="card-brutal-hover border-t-4 border-t-gold p-6">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center bg-gold text-white">
                  <FileText size={22} aria-hidden />
                </div>
                <h3 className="mb-3 text-lg font-black uppercase tracking-tight">Notes and service log</h3>
                <p className="text-sm leading-relaxed text-ink-500">
                  Case notes are append-only. A note cannot be edited or deleted later —
                  a correction is added as a new note, so the record of what was known and
                  when it was known stays intact.
                </p>
              </div>
              <div className="card-brutal-hover border-t-4 border-t-accent p-6">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center bg-accent text-white">
                  <Database size={22} aria-hidden />
                </div>
                <h3 className="mb-3 text-lg font-black uppercase tracking-tight">Funder reporting</h3>
                <p className="text-sm leading-relaxed text-ink-500">
                  Clients served, sessions delivered and hours, broken down by programme
                  and period. Export the underlying rows as CSV so a funder can see how a
                  number was reached.
                </p>
              </div>
              <div className="card-brutal-hover border-t-4 border-t-ink-950 p-6">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center bg-ink-950 text-white">
                  <Lock size={22} aria-hidden />
                </div>
                <h3 className="mb-3 text-lg font-black uppercase tracking-tight">Consent and retention</h3>
                <p className="text-sm leading-relaxed text-ink-500">
                  Record what each client agreed to and when, and withdraw it when they
                  ask. Set how long you keep records. Reads and exports of a client record
                  are logged, not only edits.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Who can see what — the honest section */}
        <section className="border-b-3 border-ink-950">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl mb-12">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-accent" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">
                  Access
                </span>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tight md:text-4xl">
                Who can see your clients
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="card-brutal p-6">
                <div className="label-brutal mb-4">Your team, by role</div>
                <ul className="space-y-3">
                  {[
                    'Owner and administrator — everything, plus settings and exports.',
                    'Caseworker — full case work, including sensitive details.',
                    'Volunteer — record clients and sessions. Sensitive fields are not sent to them.',
                    'Viewer — read only, without sensitive fields.',
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-accent mt-2 shrink-0" />
                      <span className="text-sm text-ink-700">{line}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-ink-500 mt-4 leading-relaxed">
                  &ldquo;Sensitive fields&rdquo; means the structured ones: health notes,
                  legal status, ethnicity, iwi affiliation and risk flags. For a volunteer
                  or viewer the software does not send those fields at all.
                </p>
              </div>

              <div className="card-brutal p-6">
                <div className="label-brutal mb-4">Not us</div>
                <p className="text-sm text-ink-700 leading-relaxed">
                  There is no staff view of your workspace and no impersonation. An
                  NGOreality account carries no permissions inside your organisation. Your
                  records sit in a different database from the public site and directory.
                </p>
                <p className="text-sm text-ink-700 mt-4 leading-relaxed">
                  There is one break-glass path, so a charity locked out of its own
                  workspace can be let back in. Using it requires a written reason and
                  writes an entry into your audit log — who, what role, when and why.
                  We cannot use it without you being able to see that we did.
                </p>
                <p className="text-sm text-ink-500 mt-4 leading-relaxed">
                  We are not claiming we hold no key. The small number of people who
                  operate the database could reach the data — that access exists to keep
                  the service running and for nothing else. Anyone who tells you otherwise
                  about hosted software is overselling it.
                </p>
              </div>
            </div>

            {/* Caveats a charity needs before trusting this with client data */}
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="border-3 border-ink-950 bg-amber-50 p-5 dark:bg-amber-950/20">
                <div className="label-brutal mb-2">Case notes are free text</div>
                <p className="text-sm text-ink-700 leading-relaxed">
                  Notes default to being visible to your whole team. Restricted notes are
                  available for caseworkers and above, but anything typed into an ordinary
                  note can be read by a volunteer. Put sensitive detail in the sensitive
                  fields, not in a general note.
                </p>
              </div>
              <div className="border-3 border-ink-950 bg-amber-50 p-5 dark:bg-amber-950/20">
                <div className="label-brutal mb-2">Held offshore</div>
                <p className="text-sm text-ink-700 leading-relaxed">
                  Your records are held outside New Zealand. Under the Privacy Act 2020
                  that is a cross-border disclosure, so name it in the collection notice
                  you give your clients. There is no New Zealand region today. Our website
                  and email suppliers are in the United States; client records are never
                  sent to them.
                </p>
              </div>
            </div>

            <p className="text-sm text-ink-500 mt-6 max-w-3xl leading-relaxed">
              Sign-in is shared with the rest of NGOreality, so who holds owner or
              administrator on your organisation matters — only those two roles can create
              the workspace or grant someone a seat.
            </p>
          </div>
        </section>

        {/* Your data */}
        <section className="border-b-3 border-ink-950 bg-surface-overlay">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px w-12 bg-teal" />
                  <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">
                    Your data
                  </span>
                </div>
                <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4">
                  Bring it in, take it out
                </h2>
                <p className="text-ink-600 leading-relaxed max-w-lg">
                  Import your existing spreadsheet and keep the columns you already use —
                  anything we do not recognise is kept as a custom field rather than
                  dropped. Export the whole caseload as CSV whenever you want, without
                  asking us.
                </p>
                <p className="text-sm text-ink-500 mt-4 max-w-lg leading-relaxed">
                  If you leave, you can have the workspace and everything in it deleted.
                </p>
              </div>
              <div className="card-brutal p-6">
                <div className="label-brutal mb-4">What it costs</div>
                <p className="font-mono text-sm text-teal mb-4">
                  $25 NZD per month, per organisation.
                  <br />
                  Plus $15 per additional user.
                </p>
                <p className="text-sm text-ink-600 leading-relaxed">
                  Reality Badge membership is separate and not required to use the
                  workspace.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA — no border-b-3; the footer's border-t-3 supplies that line */}
        <section className="bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4">
                Getting started
              </h2>
              <p className="text-ink-300 mb-8 leading-relaxed">
                Sign in to your NGOreality portal and create the workspace from there. It
                is ready immediately, and it is empty until you put something in it. If
                your charity is not registered with us yet, start there.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/ngo/signup" className="btn-brutal-teal inline-flex items-center justify-center gap-2">
                  Register your charity
                  <ArrowRight size={16} aria-hidden />
                </Link>
                <Link to="/public/contact" className="btn-brutal-outline inline-flex items-center justify-center">
                  Ask a question
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
