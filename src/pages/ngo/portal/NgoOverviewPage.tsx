import { Link } from 'react-router-dom';
import { useNgoPortalContext } from '../../../contexts/NgoPortalContext';
import { OrgTrustStatusBadge } from '../../../components/ui';
import {
  getProfileCompletionItems,
  profileCompletionPercent,
} from '../../../lib/ngoProfileCompletion';
import { NgoPortalQuickLinks } from '../../../components/ngo/NgoPortalPageShell';
import SEO from '../../../components/SEO';

export default function NgoOverviewPage() {
  const { organization, badges } = useNgoPortalContext();
  if (!organization) return null;

  const activeBadge = badges.find((b) => b.is_active);
  const profilePct = profileCompletionPercent(getProfileCompletionItems(organization));

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

        <p className="text-sm text-ink-600 dark:text-muted-foreground leading-relaxed">
          Use the menu to manage your profile, pay for Reality Badge or a trust landing page, and track
          your progress.
        </p>

        {!activeBadge && (
          <Link
            to="/ngo/services"
            className="card-brutal block border-l-4 border-l-teal p-5 hover:bg-paper dark:hover:bg-muted/20"
          >
            <h2 className="text-lg font-black uppercase tracking-tight">Choose services</h2>
            <p className="mt-1 text-sm text-ink-600 dark:text-muted-foreground">
              Pay by bank transfer for Reality Badge membership ($70/yr) and/or the trust landing page
              package ($650).
            </p>
            <span className="btn-brutal-teal mt-3 inline-block px-4 py-2 text-xs">Open services &amp; pay</span>
          </Link>
        )}

        <NgoPortalQuickLinks />
      </div>
    </>
  );
}
