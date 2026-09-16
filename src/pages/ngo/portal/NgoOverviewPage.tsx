import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';
import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import { OrgTrustStatusBadge, QueryError } from '../../../components/ui';
import {
  getProfileCompletionItems,
  profileCompletionPercent,
} from '../../../lib/ngoProfileCompletion';
import NgoSetupReadinessGuide, { NgoCustomWorkCard } from '../../../components/ngo/NgoSetupReadinessGuide';
import SEO from '../../../components/SEO';
import { getLatestMembership, getMembershipDisplayStatus } from '../../../lib/membership';
import { allPublicCriteriaPass, publicCriteriaScore } from '../../../lib/criteria';
import { BADGE_PIPELINE_NGO, getBadgePipelineStage } from '../../../lib/badgePipeline';

export default function NgoOverviewPage() {
  const { organization, badges, memberships, criteria, setupRequests, error } = useNgoPortalContext();
  if (!organization) return null;

  const activeBadge = badges.find((b) => b.is_active);
  const profileItems = getProfileCompletionItems(organization);
  const profilePct = profileCompletionPercent(profileItems);
  const profileMissing = profileItems.filter((i) => !i.complete).map((i) => i.label.toLowerCase());
  const standardsPass = allPublicCriteriaPass(criteria);
  const liveSetup = setupRequests.find((r) => r.status !== 'cancelled');
  const membershipStatus = getMembershipDisplayStatus(getLatestMembership(memberships));
  const hasActiveMembership =
    membershipStatus === 'active' || membershipStatus === 'expiring_soon';
  const badgeStage = getBadgePipelineStage({
    hasActiveBadge: Boolean(activeBadge),
    hasActiveMembership,
    standardsPass,
  });

  const steps = [
    {
      to: '/ngo/profile',
      title: 'Complete your profile',
      body:
        profilePct === 100
          ? 'Mission, logo, website and contact details are all in.'
          : `Add your mission, logo, website link and contact details. Missing: ${profileMissing.join(', ')}.`,
      status: `${profilePct}%`,
      done: profilePct === 100,
    },
    {
      to: '/ngo/setup-request',
      title: 'Request your website setup',
      body: liveSetup
        ? `Request ${liveSetup.status.replace(/_/g, ' ')}. We will follow up by email.`
        : 'Order a trust landing page with your colours and contact details, or ask us to quote custom work.',
      status: liveSetup ? liveSetup.status.replace(/_/g, ' ') : 'Not started',
      done: Boolean(liveSetup),
    },
    {
      to: '/ngo/services',
      title: 'Pay for membership',
      body: hasActiveMembership
        ? 'Membership is active.'
        : 'Pay by bank transfer, then press “I’ve made the payment” so we know to look for it.',
      status: hasActiveMembership ? 'Active' : 'Unpaid',
      done: hasActiveMembership,
    },
    {
      to: '/ngo/standards',
      title: 'Meet the trust standards',
      body: 'We check your website, mission, contact details, privacy policy and security basics.',
      status: `${publicCriteriaScore(criteria)}%`,
      done: standardsPass,
    },
    {
      to: '/ngo/badge',
      title: 'Show your Reality Badge',
      body: activeBadge
        ? 'Your badge is live. Add it to your website.'
        : 'Issued once membership is paid and the standards pass.',
      status: activeBadge ? 'Live' : 'Locked',
      done: Boolean(activeBadge),
    },
  ];
  const nextStepIndex = steps.findIndex((s) => !s.done);

  return (
    <>
      <SEO title={`${organization.name} — Portal`} path="/ngo" />
      <div className="space-y-6">
        <div>
          <p className="font-mono text-2xs uppercase tracking-[0.25em] text-ink-400 mb-2">Member portal</p>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight truncate">{organization.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <OrgTrustStatusBadge org={organization} />
            <Link
              to="/ngo/profile"
              className="font-mono text-2xs uppercase border border-ink-200 px-2 py-1 hover:border-teal"
            >
              Profile {profilePct}% complete
            </Link>
          </div>
        </div>

        {error && <QueryError message={error} />}

        {activeBadge && (
          <div className="card-brutal flex flex-col items-start gap-4 border-teal p-5 sm:flex-row sm:items-center sm:p-6">
            <img
              src="/reality-badge.png"
              alt="NGOreality Reality Badge"
              className="h-20 w-20 shrink-0 object-contain"
            />
            <div className="min-w-0">
              <h2 className="text-lg font-black uppercase tracking-tight">
                You&rsquo;re verified — Reality Badge active
              </h2>
              <p className="mt-1 text-sm text-ink-600 dark:text-muted-foreground">
                Badge <span className="font-mono font-semibold">{activeBadge.verification_id}</span>. Download
                the badge asset and add it to your website.
              </p>
              <Link
                to="/ngo/badge"
                className="btn-brutal-teal mt-3 inline-block px-4 py-2 text-xs"
              >
                Get your badge assets
              </Link>
            </div>
          </div>
        )}

        {!error && !activeBadge && badgeStage === 'membership_active_badge_pending' && (
          <div className="card-brutal border-l-4 border-l-amber-500 p-5 sm:p-6">
            <h2 className="text-lg font-black uppercase tracking-tight">Membership active</h2>
            <p className="mt-1 text-sm text-ink-600 dark:text-muted-foreground leading-relaxed">
              {BADGE_PIPELINE_NGO.membership_active_badge_pending}
            </p>
            <Link to="/ngo/badge" className="btn-brutal-outline mt-3 inline-block px-4 py-2 text-xs">
              Badge status
            </Link>
          </div>
        )}

        <section className="card-brutal p-5 sm:p-6" aria-labelledby="next-steps-title">
          <h2 id="next-steps-title" className="text-lg font-black uppercase tracking-tight">
            {nextStepIndex === -1 ? 'You’re all set' : 'Your next steps'}
          </h2>
          <p className="mt-1 text-sm text-ink-600 dark:text-muted-foreground">
            {nextStepIndex === -1
              ? 'Everything is done. Keep your profile current and we will keep monitoring your site.'
              : `${steps.filter((st) => st.done).length} of ${steps.length} done. Work through these in order.`}
          </p>
          <ol className="mt-4 space-y-2">
            {steps.map((step, i) => (
              <li key={step.to}>
                <Link
                  to={step.to}
                  className={
                    'group flex items-start gap-3 border-2 p-3 sm:p-4 transition-colors ' +
                    (i === nextStepIndex
                      ? 'border-teal bg-teal/5 hover:bg-teal/10'
                      : 'border-ink-100 hover:border-ink-300 dark:border-border')
                  }
                >
                  <span
                    className={
                      'flex size-7 shrink-0 items-center justify-center border-2 font-mono text-xs font-bold ' +
                      (step.done ? 'border-teal bg-teal text-white' : 'border-ink-300 dark:border-border')
                    }
                    aria-hidden
                  >
                    {step.done ? <CheckCircle size={14} /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={
                          'font-semibold ' +
                          (step.done ? 'text-ink-500 line-through decoration-1' : 'text-ink-950 dark:text-foreground')
                        }
                      >
                        {step.title}
                      </span>
                      <span className="font-mono text-2xs uppercase text-ink-500">{step.status}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-600 dark:text-muted-foreground">{step.body}</span>
                  </span>
                  <ArrowRight
                    size={16}
                    className="mt-1 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-teal"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <NgoSetupReadinessGuide compact />

        <NgoCustomWorkCard />
      </div>
    </>
  );
}
