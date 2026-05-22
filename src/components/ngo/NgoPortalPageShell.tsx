import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useNgoPortalContext } from '../../contexts/NgoPortalContext';
import { OrgTrustStatusBadge } from '../ui';
import SEO from '../SEO';

type NgoPortalPageShellProps = {
  title: string;
  path: string;
  children: ReactNode;
  showOrgHeader?: boolean;
};

export default function NgoPortalPageShell({
  title,
  path,
  children,
  showOrgHeader = true,
}: NgoPortalPageShellProps) {
  const { organization, error } = useNgoPortalContext();
  if (!organization) return null;

  return (
    <>
      <SEO title={`${title} — ${organization.name}`} path={path} />
      <div className="space-y-6">
        {showOrgHeader && (
          <div className="border-b-2 border-ink-100 dark:border-border pb-4">
            <p className="font-mono text-2xs uppercase tracking-[0.25em] text-ink-400 mb-1">{organization.name}</p>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">{title}</h1>
            <div className="mt-2">
              <OrgTrustStatusBadge org={organization} />
            </div>
          </div>
        )}

        {error && (
          <p className="text-accent text-xs font-mono border-2 border-accent px-3 py-2" role="alert">
            {error}
          </p>
        )}

        {children}
      </div>
    </>
  );
}

export function NgoPortalQuickLinks() {
  const links = [
    { to: '/ngo/profile', label: 'Complete profile' },
    { to: '/ngo/setup-request', label: 'Request setup' },
    { to: '/ngo/membership', label: 'Membership' },
    { to: '/ngo/notifications', label: 'Notifications' },
    { to: '/ngo/standards', label: 'Trust standards' },
  ];

  return (
    <nav className="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-label="Portal sections">
      {links.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="card-brutal p-4 text-sm font-semibold uppercase tracking-tight hover:border-teal min-h-[48px] flex items-center"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
