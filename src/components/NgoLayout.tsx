import { useEffect, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { User, UserCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';
import PortalNotificationBell from './notifications/PortalNotificationBell';
import {
  NGO_PORTAL_NAV,
  NGO_PORTAL_NAV_ONBOARDING,
  ngoNavIdFromPathname,
} from './ngo/ngo-nav';
import { NgoAppSidebar } from './ngo/NgoAppSidebar';
import { NavUser } from './nav-user';
import { useNgoPortal } from '../hooks/useNgoPortal';
import { BAQSHI_ACCOUNT_URL } from '../lib/baqshiAuth';
import { SiteHeader } from './site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

/** Legacy hash links → route paths */
const NGO_HASH_REDIRECTS: Record<string, string> = {
  profile: '/ngo/profile',
  'setup-request': '/ngo/setup-request',
  membership: '/ngo/membership',
  standards: '/ngo/standards',
  badge: '/ngo/badge',
  monitoring: '/ngo/monitoring',
  requests: '/ngo/requests',
  registration: '/ngo/signup',
};

function NgoPortalFrame() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const { needsRegistration, loading: portalLoading, organization, badges } = useNgoPortal();
  const hasActiveBadge = badges.some((b) => b.is_active);
  const isVerified =
    hasActiveBadge ||
    organization?.verification_level === 'verified' ||
    organization?.verification_level === 'transparent_financial';

  const onboarding = !portalLoading && needsRegistration;
  const navItems = useMemo(
    () => (onboarding ? NGO_PORTAL_NAV_ONBOARDING : NGO_PORTAL_NAV),
    [onboarding],
  );

  const activeId = ngoNavIdFromPathname(pathname);

  useEffect(() => {
    const sectionId = hash.replace('#', '');
    if (!sectionId) return;
    const target = NGO_HASH_REDIRECTS[sectionId];
    if (target) {
      navigate(target, { replace: true });
    }
  }, [hash, navigate]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/ngo/login', { replace: true });
  };

  return (
    <>
      <SiteHeader>
        {organization ? (
          <span className="hidden min-w-0 items-center gap-1.5 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:flex">
            {isVerified ? (
              <img
                src="/reality-badge.png"
                alt="Reality Badge"
                className="size-5 shrink-0 object-contain"
              />
            ) : null}
            <span className="truncate">{organization.name}</span>
          </span>
        ) : null}
        <ThemeToggle variant="ghost" />
        {!onboarding ? <PortalNotificationBell audience="ngo" to="/ngo/notifications" /> : null}
        <NavUser
          onSignOut={handleSignOut}
          extraItems={
            !onboarding
              ? [
                  { title: 'Profile', url: '/ngo/profile', icon: User },
                  { title: 'Account', url: BAQSHI_ACCOUNT_URL, icon: UserCircle },
                ]
              : []
          }
        />
      </SiteHeader>
      <div className="flex min-h-0 flex-1">
        <NgoAppSidebar
          navItems={navItems}
          activeId={activeId}
          organizationName={organization?.name ?? 'NGOreality'}
          subtitle={
            organization
              ? isVerified
                ? 'Verified member'
                : 'Member portal'
              : 'Member portal'
          }
          homePath={navItems[0]?.path ?? '/ngo'}
        />
        <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div className="p-3 sm:p-6 lg:p-8">
              <div className="mx-auto w-full min-w-0 max-w-3xl">
                <Outlet />
              </div>
            </div>
          </div>
        </SidebarInset>
      </div>
    </>
  );
}

export default function NgoLayout() {
  return (
    <TooltipProvider delay={0}>
      <div className="[--header-height:calc(--spacing(14))]">
        <SidebarProvider className="flex flex-col">
          <NgoPortalFrame />
        </SidebarProvider>
      </div>
    </TooltipProvider>
  );
}
