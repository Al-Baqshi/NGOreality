import type { ClaimSearchOrganization } from '../../hooks/useOrganizationClaimSearch';
import { getProfileCompletionItems, profileCompletionPercent } from '../../lib/ngoProfileCompletion';

type NgoDirectoryOrgPreviewProps = {
  org: ClaimSearchOrganization;
};

export default function NgoDirectoryOrgPreview({ org }: NgoDirectoryOrgPreviewProps) {
  const items = getProfileCompletionItems({
    name: org.name,
    description: org.description ?? '',
    mission_statement: org.mission_statement ?? '',
    category: org.category ?? '',
    location: org.location ?? '',
    email: org.email ?? '',
    phone: org.phone ?? '',
    website_url: org.website_url ?? '',
    logo_url: org.logo_url ?? '',
  });
  const pct = profileCompletionPercent(items);
  const missing = items.filter((i) => !i.complete).map((i) => i.label);

  return (
    <div className="border-2 border-ink-950 dark:border-border bg-ink-50 dark:bg-muted/30 p-4 space-y-3">
      <p className="font-mono text-2xs uppercase tracking-wider text-teal">Directory record</p>
      <h3 className="font-black uppercase tracking-tight text-lg">{org.name}</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {org.location && (
          <div>
            <dt className="label-brutal text-ink-400">Location</dt>
            <dd>{org.location}</dd>
          </div>
        )}
        {org.charity_registration_number && (
          <div>
            <dt className="label-brutal text-ink-400">Charity #</dt>
            <dd className="font-mono text-xs">{org.charity_registration_number}</dd>
          </div>
        )}
        {org.website_url?.trim() && (
          <div className="sm:col-span-2">
            <dt className="label-brutal text-ink-400">Website</dt>
            <dd className="font-mono text-2xs break-all">{org.website_url}</dd>
          </div>
        )}
        {org.mission_statement?.trim() && (
          <div className="sm:col-span-2">
            <dt className="label-brutal text-ink-400">Mission</dt>
            <dd className="text-ink-600 dark:text-muted-foreground line-clamp-3">{org.mission_statement}</dd>
          </div>
        )}
      </dl>
      <p className="font-mono text-2xs text-ink-500">
        Profile on file: {pct}% complete
        {missing.length > 0 && ` · still need: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}`}
      </p>
      <p className="text-xs text-ink-500 leading-relaxed">
        After you link this organization you can update your mission, request a trust landing page, and submit your
        logo for our team.
      </p>
    </div>
  );
}
