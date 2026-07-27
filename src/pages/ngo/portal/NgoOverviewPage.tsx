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
  const { organization } = useNgoPortalContext();
  if (!organization) return null;

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

        <p className="text-sm text-ink-600 dark:text-muted-foreground leading-relaxed">
          Use the menu to manage your profile, request a trust landing page, check membership, and track your Reality
          Badge progress.
        </p>

        <NgoPortalQuickLinks />
      </div>
    </>
  );
}
