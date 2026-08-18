import { useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Globe, LogOut, PanelLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';
import {
  NGO_PORTAL_NAV,
  NGO_PORTAL_NAV_ONBOARDING,
  ngoNavIdFromPathname,
  ngoNavItemById,
} from './ngo/ngo-nav';
import { useNgoPortal } from '../hooks/useNgoPortal';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import PortalNotificationBell from './notifications/PortalNotificationBell';

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
  const { signOut, user, centralUser } = useAuth();
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
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
  const activeItem = ngoNavItemById(activeId, onboarding);
  const pageTitle = activeItem?.label ?? 'Member portal';

  useEffect(() => {
    const sectionId = hash.replace('#', '');
    if (!sectionId) return;
    const target = NGO_HASH_REDIRECTS[sectionId];
    if (target) {
      navigate(target, { replace: true });
    }
  }, [hash, navigate]);

  const goToNavItem = (item: (typeof navItems)[number]) => {
    if (item.path.startsWith('http')) return;
    navigate(item.path);
    if (isMobile) setOpenMobile(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/ngo/login', { replace: true });
  };

  return (
    <>
      <Sidebar collapsible="icon" variant="sidebar" className="border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="data-[slot=sidebar-menu-button]:!p-2"
                isActive={activeId === 'overview'}
                onClick={() => goToNavItem(navItems[0])}
              >
                <img
                  src="/reality-badge.png"
                  alt=""
                  className="size-9 shrink-0 object-contain"
                  decoding="async"
                />
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold text-sidebar-foreground">
                    {organization?.name ?? 'NGOreality'}
                  </span>
                  <span className="truncate font-mono text-2xs uppercase tracking-[0.14em] text-sidebar-foreground/60">
                    {organization ? (isVerified ? 'Verified member ✓' : 'Member portal') : 'Member portal'}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="font-mono text-2xs uppercase tracking-[0.14em] text-sidebar-foreground/50">
              Your organisation
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeId === item.id}
                      className="data-active:shadow-[inset_2px_0_0_#EBBB57]"
                      tooltip={item.label}
                      onClick={() => goToNavItem(item)}
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link to="/public" className="flex w-full items-center gap-2" />}
                  >
                    <Globe className="size-4 shrink-0" />
                    <span>Public site</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border">
          <div className="px-2 py-2 text-sm group-data-[collapsible=icon]:hidden">
            <p className="truncate font-medium text-sidebar-foreground">Signed in</p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              {user?.email ?? centralUser?.email ?? centralUser?.username}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="mx-2 mb-2 h-9 w-[calc(100%-1rem)] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="flex h-svh min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:h-16 sm:px-4">
          <SidebarTrigger className="-ml-1 size-9" aria-label="Toggle menu">
            <PanelLeft className="size-4" />
          </SidebarTrigger>
          <Separator orientation="vertical" className="mx-1 hidden h-4 sm:block" />
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{pageTitle}</h1>
          {organization && (
            <span className="hidden min-w-0 items-center gap-1.5 truncate font-mono text-2xs uppercase tracking-wider text-muted-foreground sm:flex">
              {isVerified && (
                <img src="/reality-badge.png" alt="Reality Badge" className="size-5 shrink-0 object-contain" />
              )}
              <span className="truncate">{organization.name}</span>
            </span>
          )}
          <ThemeToggle variant="ghost" />
          {!onboarding && <PortalNotificationBell audience="ngo" to="/ngo/notifications" />}
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <div className="p-3 sm:p-6 lg:p-8">
            <div className="mx-auto w-full min-w-0 max-w-3xl">
              <main className="min-w-0">
                <Outlet />
              </main>
            </div>
          </div>
        </div>
      </SidebarInset>
    </>
  );
}

export default function NgoLayout() {
  return (
    <TooltipProvider delay={0}>
      <SidebarProvider defaultOpen>
        <NgoPortalFrame />
      </SidebarProvider>
    </TooltipProvider>
  );
}
