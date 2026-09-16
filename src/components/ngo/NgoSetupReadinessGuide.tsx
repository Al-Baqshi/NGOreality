import { Link } from 'react-router-dom';
import { CheckCircle, Cloud, GitBranch, Globe, KeyRound, Mail, Server, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReadinessKey = 'domain' | 'org_email' | 'passwords' | 'dns' | 'hosting' | 'github';

export type ReadinessItem = {
  key: ReadinessKey;
  icon: LucideIcon;
  title: string;
  why: string;
  have: string;
};

/** What an NGO should control before we set up a landing page or any custom work. */
export const SETUP_READINESS_ITEMS: ReadinessItem[] = [
  {
    key: 'domain',
    icon: Globe,
    title: 'Your own domain',
    why: 'Your web address is your identity. If one volunteer registered it personally and leaves, you can lose it.',
    have: 'Registered in the organisation’s name, with the registrar login (e.g. Crazy Domains, GoDaddy, Cloudflare) held by the org and auto-renew on. No domain yet? We can help you register one.',
  },
  {
    key: 'org_email',
    icon: Mail,
    title: 'A shared organisation email',
    why: 'Every account below should be recoverable by the organisation, not by a personal Gmail.',
    have: 'An address like admin@yourorg.org.nz that at least two trusted people can read.',
  },
  {
    key: 'passwords',
    icon: KeyRound,
    title: 'Passwords in a shared manager',
    why: 'Handovers go wrong when logins live in one person’s head or a spreadsheet.',
    have: 'A password manager vault (Bitwarden, 1Password) owned by the org, with two-factor sign-in turned on. Never send us passwords by email — invite us to the account instead.',
  },
  {
    key: 'dns',
    icon: Cloud,
    title: 'DNS in Cloudflare',
    why: 'DNS decides where your domain and email point. Cloudflare is free and adds HTTPS and protection.',
    have: 'A free Cloudflare account on your org email with the domain added. Invite us as a member when we start.',
  },
  {
    key: 'hosting',
    icon: Server,
    title: 'Hosting for the landing page',
    why: 'The site should run on an account you own, so you keep it if you change providers.',
    have: 'A Netlify or Cloudflare Pages account on your org email (the free tier is enough for a landing page).',
  },
  {
    key: 'github',
    icon: GitBranch,
    title: 'A GitHub organisation',
    why: 'Your site’s code should belong to your NGO, not to the developer who built it.',
    have: 'A free GitHub organisation account owned by the org email. We add the code there and you invite us as a collaborator.',
  },
];

type GuideProps = {
  /** Short list for the overview; full explanations elsewhere. */
  compact?: boolean;
  className?: string;
};

export default function NgoSetupReadinessGuide({ compact = false, className }: GuideProps) {
  return (
    <section className={cn('card-brutal space-y-4 p-5 sm:p-6', className)} aria-labelledby="readiness-title">
      <div>
        <h2 id="readiness-title" className="text-lg font-black uppercase tracking-tight">
          Have these ready before setup
        </h2>
        <p className="mt-1 text-sm text-ink-600 dark:text-muted-foreground">
          Your NGO should own and control every account behind its website. Get these in place and
          setup takes days, not weeks.
        </p>
      </div>
      <ul className={cn('grid gap-3', compact ? 'sm:grid-cols-2' : 'grid-cols-1')}>
        {SETUP_READINESS_ITEMS.map((item) => (
          <li key={item.key} className="flex gap-3 border-2 border-ink-100 p-3 dark:border-border">
            <item.icon size={18} className="mt-0.5 shrink-0 text-teal" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-ink-950 dark:text-foreground">{item.title}</p>
              {compact ? (
                <p className="text-xs text-ink-500">{item.have}</p>
              ) : (
                <>
                  <p className="text-xs text-ink-500">{item.why}</p>
                  <p className="flex items-start gap-1.5 text-xs text-ink-700 dark:text-muted-foreground">
                    <CheckCircle size={12} className="mt-0.5 shrink-0 text-teal" aria-hidden />
                    <span>{item.have}</span>
                  </p>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Upsell for bespoke work — quoted per job, fulfilled through a setup request. */
export function NgoCustomWorkCard({ className }: { className?: string }) {
  return (
    <section className={cn('card-brutal flex flex-col gap-3 border-l-4 border-l-accent p-5 sm:p-6', className)}>
      <div className="flex items-center gap-2">
        <Wrench size={18} className="text-accent" aria-hidden />
        <h2 className="text-lg font-black uppercase tracking-tight">Need something custom?</h2>
      </div>
      <p className="text-sm text-ink-600 dark:text-muted-foreground">
        We do paid setup and custom work for NGOs: moving your domain or DNS to accounts you own,
        organisation email, hosting, fixes to an existing website, donation pages and more. Tell us
        what you need and we will send a quote before any work starts.
      </p>
      <Link
        to="/ngo/setup-request?type=custom"
        className="btn-brutal-outline inline-flex min-h-[44px] w-fit items-center px-4 text-xs"
      >
        Ask for a quote
      </Link>
    </section>
  );
}
