import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Shield, Layout, Users, FlaskConical, ExternalLink } from 'lucide-react';
import SEO, { BreadcrumbJsonLd } from '../../components/SEO';
import { useAuth } from '../../contexts/AuthContext';
import { createSandboxPaymentIntent, CrmApiError, type SandboxPaymentIntent } from '../../lib/crmApi';
import { captureError } from '../../lib/errorReporting';
import {
  MEMBERSHIP_ANNUAL_CENTS,
  GST_PRICE_SUFFIX,
  GST_PRICE_NOTE,
  PRICING_CURRENCY,
} from '../../config/pricing';
import {
  LANDING_STANDARDS_PACKAGE_CENTS,
  WORKSPACE_ADMIN_MONTHLY_CENTS,
  WORKSPACE_SEAT_MONTHLY_CENTS,
  ORGANISATION_WORKSPACE_NAME,
  MEMBER_MONITORING_SUMMARY,
} from '../../config/customerProducts';
import { BANK_TRANSFER_AVAILABLE, PAYMARK_AVAILABLE } from '../../config/billing';

/**
 * Prices are formatted from the same constants the CRM and the portal bill
 * from, never retyped. A price quoted on a public page that disagrees with the
 * invoice is a trust problem for a company selling trust.
 */
function price(cents: number): string {
  const whole = cents / 100;
  return Number.isInteger(whole) ? `$${whole}` : `$${whole.toFixed(2)}`;
}

interface Plan {
  id: string;
  icon: typeof Shield;
  name: string;
  price: string;
  cadence: string;
  summary: string;
  features: string[];
  cta: { label: string; to: string };
  featured?: boolean;
  footnote?: string;
}

/**
 * Staff-only harness for firing a real Paymark sandbox payment.
 *
 * Deliberately on the pricing page rather than buried in the CRM: this is
 * where the prices being charged are written down, so it is where you want to
 * confirm that charging actually works.
 *
 * Nothing here is a secret. The route it calls refuses unless PAYMARK_ENV is
 * "sandbox", so this cannot move real money — the isStaff gate is about not
 * showing customers a test button, not about holding the line on payments.
 */
function SandboxPaymentTester() {
  const [dollars, setDollars] = useState('1.00');
  const [intent, setIntent] = useState<SandboxPaymentIntent | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setError('');
    setIntent(null);

    const cents = Math.round(Number.parseFloat(dollars) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      setError('Enter an amount greater than zero.');
      setBusy(false);
      return;
    }

    try {
      const result = await createSandboxPaymentIntent(cents, 'NGR-TEST');
      setIntent(result);
      // Paymark's hosted page. Opened rather than redirected so you keep this
      // tab and can compare the ids against the CRM payment events.
      window.open(result.payment_url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if (err instanceof CrmApiError) {
        setError(
          err.status === 403
            ? 'Refused: PAYMARK_ENV is not "sandbox". This button never touches production.'
            : err.status === 503
              ? 'Paymark is not configured — PAYMARK_CONSUMER_KEY, PAYMARK_CONSUMER_SECRET and PAYMARK_MERCHANT_ID must all be set on the API.'
              : err.status === 401
                ? 'Not signed in to the CRM API.'
                : err.message,
        );
      } else {
        setError(err instanceof Error ? err.message : 'Could not start the payment.');
        captureError(err, { where: 'Pricing.sandboxPayment' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-t-3 border-ink-950 dark:border-border bg-gold-light dark:bg-muted/40">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical size={18} className="text-ink-950 dark:text-foreground shrink-0" aria-hidden />
            <h2 className="text-xl font-black uppercase tracking-tight">Payment test</h2>
            <span className="font-mono text-2xs uppercase tracking-wider border-2 border-ink-950 dark:border-border px-2 py-0.5">
              staff only
            </span>
          </div>
          <p className="text-sm text-ink-700 dark:text-foreground/80 mb-5">
            Starts a real Online EFTPOS payment against Paymark&rsquo;s sandbox and opens their
            hosted page. Approve it in the sandbox banking app to see the callback land in{' '}
            <Link to="/reconciliation" className="underline font-semibold">
              reconciliation
            </Link>
            . No real money moves.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label-brutal" htmlFor="test-amount">
                Amount ({PRICING_CURRENCY})
              </label>
              <input
                id="test-amount"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={dollars}
                onChange={(e) => setDollars(e.target.value)}
                className="input-brutal w-40 text-base"
              />
            </div>
            <button
              type="button"
              onClick={start}
              disabled={busy}
              className="btn-brutal-accent min-h-[48px] text-sm inline-flex items-center gap-2 disabled:opacity-60"
            >
              {busy ? 'Starting…' : 'Start sandbox payment'}
              {!busy && <ExternalLink size={16} />}
            </button>
            <button
              type="button"
              onClick={() => setDollars(String(MEMBERSHIP_ANNUAL_CENTS / 100))}
              className="btn-brutal-outline min-h-[48px] text-sm"
            >
              Use the real {price(MEMBERSHIP_ANNUAL_CENTS)} membership price
            </button>
          </div>

          {error && (
            <p
              className="mt-4 text-accent text-xs font-mono border-2 border-accent bg-accent-light px-3 py-2"
              role="alert"
            >
              {error}
            </p>
          )}

          {intent && (
            <div className="mt-4 border-3 border-ink-950 dark:border-border bg-white dark:bg-card p-4">
              <p className="font-mono text-xs mb-2">
                Started in <strong>{intent.environment}</strong> — if the tab did not open,{' '}
                <a
                  href={intent.payment_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline font-semibold"
                >
                  open the payment page
                </a>
                .
              </p>
              <dl className="font-mono text-2xs text-ink-600 dark:text-muted-foreground space-y-0.5">
                <div>
                  <dt className="inline">payment_id: </dt>
                  <dd className="inline break-all">{intent.payment_id}</dd>
                </div>
                <div>
                  <dt className="inline">merchant_transaction_id: </dt>
                  <dd className="inline break-all">{intent.merchant_transaction_id}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Pricing() {
  const { isStaff } = useAuth();
  const plans: Plan[] = [
    {
      id: 'membership',
      icon: Shield,
      name: 'Membership',
      price: price(MEMBERSHIP_ANNUAL_CENTS),
      cadence: `${PRICING_CURRENCY} / year`,
      summary:
        'The Reality Badge, ongoing website monitoring, and an email if your site looks down.',
      features: [
        'Reality Badge with a public verification page',
        'Unique verification ID you can embed on your site',
        MEMBER_MONITORING_SUMMARY,
        'Annual renewal and compliance re-check',
        'Portal access to your trust standards and progress',
      ],
      cta: { label: 'Join as a member', to: '/ngo/signup' },
      featured: true,
    },
    {
      id: 'landing',
      icon: Layout,
      name: 'Trust landing page',
      price: price(LANDING_STANDARDS_PACKAGE_CENTS),
      cadence: `${PRICING_CURRENCY} one-off`,
      summary:
        'We build the page and walk you through the standards until you are ready for badge review.',
      features: [
        'A trust landing page built for your organisation',
        'Standards education and a checklist walkthrough',
        'Your content and evidence organised for review',
        'Ready to submit for Reality Badge assessment',
        'Connect your own domain',
      ],
      cta: { label: 'Talk to us', to: '/public/contact' },
      footnote: 'Membership is separate and still required for the badge itself.',
    },
    {
      id: 'workspace',
      icon: Users,
      name: ORGANISATION_WORKSPACE_NAME,
      price: price(WORKSPACE_ADMIN_MONTHLY_CENTS),
      cadence: `${PRICING_CURRENCY} / month`,
      summary:
        'A private workspace for your organisation — clients, cases, notes and consents, isolated from every other organisation.',
      features: [
        'Your own isolated database schema',
        'Client and case records with consent tracking',
        'Session notes that cannot be silently edited',
        'Document register and CSV export',
        `Additional users ${price(WORKSPACE_SEAT_MONTHLY_CENTS)} / month each`,
      ],
      cta: { label: 'See the workspace', to: '/public/workspace' },
    },
  ];

  return (
    <>
      <SEO
        title="Pricing"
        description="NGOreality pricing for New Zealand charities — $70/year membership including the Reality Badge and website monitoring, a $650 trust landing page package, and the Organisation Workspace from $25/month."
        path="/public/pricing"
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', path: '/public' },
          { name: 'Pricing', path: '/public/pricing' },
        ]}
      />

      <div>
        {/* Hero */}
        <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-teal" />
                <span className="font-mono text-xs uppercase tracking-widest text-teal">Pricing</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight mb-6">
                Priced for charities, not for software budgets
              </h1>
              <p className="text-lg text-ink-300">
                One membership covers the badge and the monitoring behind it. Everything else is
                optional and priced separately, so you are never paying for something you did not
                ask for.
              </p>
            </div>
          </div>
        </section>

        {/* Plans */}
        <section className="bg-white dark:bg-background">
          <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="grid gap-8 md:grid-cols-3">
              {plans.map((plan) => {
                const Icon = plan.icon;
                return (
                  <div
                    key={plan.id}
                    className={`border-3 border-ink-950 dark:border-border p-6 flex flex-col ${
                      plan.featured ? 'shadow-brutal bg-white dark:bg-card' : 'bg-white dark:bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <Icon size={24} className="text-teal shrink-0" />
                      <h2 className="text-lg font-black uppercase tracking-tight">{plan.name}</h2>
                    </div>

                    <div className="mb-1 flex items-baseline gap-2">
                      <span className="text-4xl font-black tracking-tight">{plan.price}</span>
                      <span className="font-mono text-xs text-ink-500 dark:text-muted-foreground">
                        {plan.cadence}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-ink-500 dark:text-muted-foreground mb-4">
                      {GST_PRICE_SUFFIX}
                    </p>

                    <p className="text-sm text-ink-700 dark:text-foreground/80 mb-5">{plan.summary}</p>

                    <ul className="space-y-2 mb-6 flex-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm">
                          <Check size={16} className="text-teal shrink-0 mt-0.5" />
                          <span className="text-ink-700 dark:text-foreground/80">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {plan.footnote && (
                      <p className="text-xs text-ink-500 dark:text-muted-foreground mb-4">
                        {plan.footnote}
                      </p>
                    )}

                    <Link
                      to={plan.cta.to}
                      className={`${
                        plan.featured ? 'btn-brutal-teal' : 'btn-brutal-outline'
                      } text-sm inline-flex items-center justify-center gap-2 min-h-[44px]`}
                    >
                      {plan.cta.label} <ArrowRight size={16} />
                    </Link>
                  </div>
                );
              })}
            </div>

            <p className="mt-8 max-w-3xl text-sm text-ink-600 dark:text-muted-foreground">
              {GST_PRICE_NOTE}
            </p>
          </div>
        </section>

        {/* How to pay */}
        <section className="border-t-3 border-ink-950 dark:border-border bg-paper dark:bg-muted/20">
          <div className="max-w-7xl mx-auto px-6 py-16">
            <h2 className="text-2xl font-black uppercase tracking-tight mb-6">How to pay</h2>
            <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
              {BANK_TRANSFER_AVAILABLE && (
                <div className="border-3 border-ink-950 dark:border-border bg-white dark:bg-card p-5">
                  <h3 className="font-black uppercase text-sm tracking-tight mb-2">Bank transfer</h3>
                  <p className="text-sm text-ink-700 dark:text-foreground/80">
                    Sign in to your portal and you will see our account details and a reference
                    unique to your organisation. Quote that reference so we can match the payment to
                    you automatically.
                  </p>
                </div>
              )}
              <div className="border-3 border-ink-950 dark:border-border bg-white dark:bg-card p-5">
                <h3 className="font-black uppercase text-sm tracking-tight mb-2">
                  Online EFTPOS {!PAYMARK_AVAILABLE && <span className="text-ink-500">— coming soon</span>}
                </h3>
                <p className="text-sm text-ink-700 dark:text-foreground/80">
                  Pay straight from your bank account by entering your mobile number and approving
                  the payment in your banking app. No card required.
                </p>
              </div>
            </div>
            <p className="mt-6 text-sm text-ink-600 dark:text-muted-foreground max-w-3xl">
              Invoices are issued by Baqshi Limited. If your organisation needs a purchase order or
              a different arrangement, get in touch and we will sort it out.
            </p>
          </div>
        </section>

        {isStaff && <SandboxPaymentTester />}

        {/* CTA */}
        <section className="bg-ink-950 text-white">
          <div className="max-w-7xl mx-auto px-6 py-16 text-center">
            <h2 className="text-3xl font-black uppercase tracking-tight mb-4">
              Ready to get verified?
            </h2>
            <p className="text-ink-300 max-w-lg mx-auto mb-8">
              Create your organisation account, work through the standards, and apply for the badge
              when you are ready.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/ngo/signup"
                className="btn-brutal-teal text-base inline-flex items-center gap-2 justify-center min-h-[48px]"
              >
                NGO sign up <ArrowRight size={18} />
              </Link>
              <Link
                to="/public/contact"
                className="btn-brutal-outline border-white bg-transparent text-white hover:bg-white hover:text-ink-950 text-base inline-flex items-center gap-2 justify-center min-h-[48px]"
              >
                Contact us <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
