import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, KeyRound, Wallet, Wrench, BadgeCheck, Check } from 'lucide-react';
import SEO, { OrganizationJsonLd, BreadcrumbJsonLd } from '../../components/SEO';
import { MEMBERSHIP_ANNUAL_CENTS, PRICING_CURRENCY } from '../../config/pricing';
import {
  LANDING_STANDARDS_PACKAGE_CENTS,
  WORKSPACE_ADMIN_MONTHLY_CENTS,
  WORKSPACE_SEAT_MONTHLY_CENTS,
} from '../../config/customerProducts';

/** Formatted from the same constants as the Pricing page, so the story never quotes a stale number. */
function price(cents: number): string {
  const whole = cents / 100;
  return Number.isInteger(whole) ? `$${whole}` : `$${whole.toFixed(2)}`;
}

const BELIEFS = [
  {
    icon: KeyRound,
    title: 'You own what you pay for',
    body: 'Your domain, your hosting, your data and your code stay in your organisation’s name. If you ever want to leave, you take all of it with you. Nobody holds your website hostage.',
  },
  {
    icon: Wallet,
    title: 'Affordable, on purpose',
    body: 'A small charity shouldn’t need a technology budget. Our prices are low and fixed, so you know exactly what you’re paying before anything starts.',
  },
  {
    icon: Wrench,
    title: 'We handle the technical side',
    body: 'We set things up, keep an eye on them and tell you when something needs attention. Your team gets its time back for the work that actually matters.',
  },
  {
    icon: BadgeCheck,
    title: 'Trust people can see',
    body: 'A secure setup, a public mission, a real way to get in touch. The Reality Badge shows all of that at a glance.',
  },
];

const SIGNALS = [
  'They can find you easily',
  'Your setup is secure and well looked after',
  'Your mission is public and clear',
  'They can contact you',
  'There are real humans behind it',
];

export default function About() {
  const packages = [
    {
      name: 'Website setup',
      price: price(LANDING_STANDARDS_PACKAGE_CENTS),
      cadence: `${PRICING_CURRENCY} one-off`,
      body: 'We build your trust website, connect your own domain and walk you through the standards. A logo or custom branding isn’t included. If you need that, or anything more specific, we’ll quote it upfront before any work begins.',
    },
    {
      name: 'Membership',
      price: price(MEMBERSHIP_ANNUAL_CENTS),
      cadence: `${PRICING_CURRENCY} / year`,
      body: 'We check your website about every 24 hours and email you if something looks wrong. Membership also includes the Reality Badge and its public verification page.',
    },
    {
      name: 'Organisation Workspace',
      price: `From ${price(WORKSPACE_ADMIN_MONTHLY_CENTS)}`,
      cadence: `${PRICING_CURRENCY} / month`,
      body: `A private space for your organisation’s records, looked after by us. Extra users are ${price(WORKSPACE_SEAT_MONTHLY_CENTS)} a month each.`,
    },
  ];

  return (
    <>
      <SEO
        title="About"
        description="The story behind NGOreality: why Baqshi started it to help non-profits own their website, data and hosting affordably, so they can focus on their mission and be easy to find and trust."
        path="/public/about"
      />
      <OrganizationJsonLd />
      <BreadcrumbJsonLd items={[{ name: 'Home', path: '/public' }, { name: 'About', path: '/public/about' }]} />
    <div>
      {/* Hero */}
      <section className="border-b-3 border-ink-950 bg-ink-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-12 bg-gold" />
              <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-300">About · A note from the founder</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight mb-6">
              Your mission shouldn’t be held back by your website
            </h1>
            <p className="text-ink-300 text-lg md:text-xl max-w-2xl">
              NGOreality started with a frustration I couldn’t stop noticing. Here’s the story, in my own words.
            </p>
          </div>
        </div>
      </section>

      {/* The story */}
      <section className="border-b-3 border-ink-950 dark:border-border">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <article className="max-w-2xl mx-auto text-lg leading-relaxed text-ink-700 dark:text-foreground/85 space-y-6">
            <p className="text-2xl md:text-3xl font-black tracking-tight text-ink-950 dark:text-foreground">
              Kia ora, I’m Baqshi.
            </p>
            <p>
              I live in New Zealand, where I build and run a handful of ventures under Baqshi Limited. You can see what
              I’m working on at{' '}
              <a
                href="https://baqshi.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-ink-950 dark:text-foreground underline decoration-gold decoration-2 underline-offset-4 hover:decoration-ink-950"
              >
                baqshi.com
              </a>
              . Most of my days go into building software and making technology quietly do its job in the background.
            </p>
            <p>
              Along the way I kept seeing the same thing happen to non-profits. The people running them do some of the
              most important work in their communities, usually on very thin budgets. And yet a surprising amount of that
              money ends up spent on technology they don’t actually control.
            </p>
            <p>
              It tends to go like this. An agency builds the website, then keeps the code, the hosting account and
              sometimes even the domain name. Everything is fine until the relationship ends, the invoices climb or the
              agency simply stops replying. Suddenly the organisation can’t change a single line on its own site, and
              moving means starting again from nothing and paying twice. Some are overcharged. Some are flat-out scammed.
              Either way, they’re held back.
            </p>

            <blockquote className="my-10 border-l-3 border-gold pl-6 py-2">
              <p className="text-2xl md:text-3xl font-black tracking-tight text-ink-950 dark:text-foreground leading-snug">
                Money raised for a mission should go to the mission, not to getting your own website back.
              </p>
            </blockquote>

            <p>
              There’s a second problem hiding behind the first. When someone hears about a charity, whether they’re a
              donor, a volunteer, a funder or someone who needs help, they look it up. Within a few seconds they decide
              whether it’s real. If the site is broken, the mission is vague or there’s no obvious way to reach a person,
              they move on, even when the work behind it is excellent.
            </p>
            <p className="font-semibold text-ink-950 dark:text-foreground">
              So I started NGOreality to fix both problems at once.
            </p>
          </article>
        </div>
      </section>

      {/* What we believe */}
      <section className="border-b-3 border-ink-950 dark:border-border bg-surface-overlay">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-2xl mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-12 bg-gold" />
              <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">How we work</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4">
              Your organisation keeps the keys
            </h2>
            <p className="text-ink-600 dark:text-muted-foreground text-lg">
              We set you up the right way, the way that stays cheap and stays yours, and then we look after it for you.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {BELIEFS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card-brutal p-6">
                <div className="text-ink-950 dark:text-gold mb-4"><Icon size={28} /></div>
                <h3 className="text-lg font-black uppercase tracking-tight mb-3">{title}</h3>
                <p className="text-sm text-ink-600 dark:text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What it costs */}
      <section className="border-b-3 border-ink-950 dark:border-border">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-2xl mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px w-12 bg-gold" />
              <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">What it costs</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4">
              No mystery quotes
            </h2>
            <p className="text-ink-600 dark:text-muted-foreground text-lg">
              We put together a few simple packages to make this as easy as possible. Pick what you need and nothing
              you don’t.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {packages.map((pkg) => (
              <div key={pkg.name} className="border-3 border-ink-950 dark:border-border bg-white dark:bg-card p-6 flex flex-col">
                <h3 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-500 dark:text-muted-foreground mb-3">
                  {pkg.name}
                </h3>
                <div className="mb-4">
                  <span className="text-4xl font-black tracking-tight text-ink-950 dark:text-foreground">{pkg.price}</span>
                  <span className="ml-2 font-mono text-xs text-ink-500 dark:text-muted-foreground">{pkg.cadence}</span>
                </div>
                <p className="text-sm text-ink-600 dark:text-muted-foreground leading-relaxed">{pkg.body}</p>
              </div>
            ))}
          </div>
          <Link
            to="/public/pricing"
            className="mt-8 inline-flex items-center gap-2 font-semibold text-ink-950 dark:text-foreground underline decoration-gold decoration-2 underline-offset-4 hover:decoration-ink-950"
          >
            See full pricing <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* What people should see */}
      <section className="border-b-3 border-ink-950 dark:border-border bg-surface-overlay">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px w-12 bg-gold" />
                <span className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">Our own mission</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-6">
                Keep you focused on yours
              </h2>
              <div className="space-y-4 text-lg leading-relaxed text-ink-700 dark:text-foreground/85">
                <p>
                  This is the part I care about most. When someone finds your organisation online, I want them to know
                  within seconds that it’s the real thing.
                </p>
                <p>
                  That’s what the Reality Badge stands for. It isn’t a certificate for the wall. It tells people it’s
                  safe to trust you, donate, volunteer or reach out for help.
                </p>
              </div>
            </div>
            <div className="card-brutal p-6 md:p-8">
              <div className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-500 dark:text-muted-foreground mb-5">
                When people find you, they should see that
              </div>
              <ul className="space-y-4">
                {SIGNALS.map((signal) => (
                  <li key={signal} className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 border-2 border-ink-950 dark:border-border bg-gold p-0.5 text-ink-950">
                      <Check size={14} strokeWidth={3} />
                    </span>
                    <span className="font-semibold text-ink-950 dark:text-foreground">{signal}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Who is behind this */}
      <section className="border-b-3 border-ink-950 dark:border-border">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24">
          <div className="max-w-2xl mx-auto text-lg leading-relaxed text-ink-700 dark:text-foreground/85 space-y-6">
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-ink-950 dark:text-foreground">
              Who you’re dealing with
            </h2>
            <p>
              NGOreality is a trading name of Baqshi Limited, a company registered in New Zealand. We’re an independent
              business. We’re not a charity, a government regulator or a legal authority, and the Reality Badge doesn’t
              replace your legal or compliance obligations. What we do is build good technology and hand the keys to the
              people doing the work.
            </p>
            <p>If that sounds like what your organisation needs, I’d love to hear from you.</p>
            <div className="pt-4">
              <p className="text-ink-500 dark:text-muted-foreground">Ngā mihi,</p>
              <p className="text-2xl font-black tracking-tight text-ink-950 dark:text-foreground">Baqshi</p>
              <p className="text-sm text-ink-500 dark:text-muted-foreground">
                Founder, NGOreality ·{' '}
                <a
                  href="https://baqshi.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-ink-950 dark:hover:text-foreground"
                >
                  baqshi.com <ExternalLink size={12} />
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 text-center">
          <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-6">
            Let’s set you up properly
          </h2>
          <p className="text-ink-300 max-w-lg mx-auto mb-8">
            Own your website, keep your data and look trustworthy from the first click, without the agency price tag.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/public/contact" className="btn-brutal-gold text-base inline-flex items-center gap-2">
              Get in Touch <ArrowRight size={18} />
            </Link>
            <Link
              to="/public/pricing"
              className="btn-brutal-outline border-white bg-transparent text-base text-white hover:bg-white hover:text-ink-950 inline-flex items-center gap-2"
            >
              See Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
    </>
  );
}
