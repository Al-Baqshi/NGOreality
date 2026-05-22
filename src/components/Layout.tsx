import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import PortalNotificationBell from './notifications/PortalNotificationBell';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';
import CrmNavUser from './crm/CrmNavUser';
import { CRM_NAV_GROUPS } from './crm/crm-nav';
import { getCrmPageTitle } from './crm/crm-page-title';
import { Separator } from '@/components/ui/separator';
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
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

function isNavActive(pathname: string, to: string): boolean {
  if (to === '/dashboard') return pathname === '/dashboard';
  if (to === '/public') return pathname.startsWith('/public');
  return pathname === to || pathname.startsWith(`${to}/`);
}

export default function CRMLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pageTitle = getCrmPageTitle(pathname);

  const handleSignOut = async () => {
    await signOut();
    navigate('/staff/login', { replace: true });
  };

  return (
    <TooltipProvider delay={0}>
      <SidebarProvider defaultOpen>
        <Sidebar collapsible="icon" variant="sidebar" className="border-sidebar-border">
          <SidebarHeader className="border-b border-sidebar-border">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  className="data-[slot=sidebar-menu-button]:!p-2"
                  render={
                    <Link
                      to="/dashboard"
                      className="flex w-full min-w-0 items-center gap-2"
                      aria-label="NGOreality CRM home"
                    />
                  }
                >
                  <img
                    src="/logo-icon-dark.svg"
                    alt=""
                    className="size-8 shrink-0 rounded-md object-contain"
                    decoding="async"
                  />
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold tracking-tight">NGOreality</span>
                    <span className="truncate text-xs opacity-70">Staff CRM</span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            {CRM_NAV_GROUPS.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton
                          isActive={isNavActive(pathname, item.to)}
                          tooltip={item.label}
                          render={
                            <NavLink
                              to={item.to}
                              className="flex w-full min-w-0 items-center gap-2"
                            >
                              <item.icon className="size-4 shrink-0" />
                              <span>{item.label}</span>
                            </NavLink>
                          }
                        />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border">
            <div className="mb-2 flex items-center justify-between gap-2 px-1 group-data-[collapsible=icon]:justify-center">
              <ThemeToggle />
            </div>
            <CrmNavUser onSignOut={handleSignOut} />
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="flex h-svh min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:h-16 sm:px-4">
            <SidebarTrigger className="-ml-1 size-9 sm:size-10" aria-label="Toggle sidebar">
              <PanelLeft className="size-4" />
            </SidebarTrigger>
            <Separator orientation="vertical" className="mx-1 hidden h-4 sm:block" />
            <h1 className="min-w-0 flex-1 truncate text-base font-medium text-foreground">
              {pageTitle}
            </h1>
            <PortalNotificationBell audience="staff" to="/notifications" />
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 lg:p-8">
              <div className="flex w-full min-w-0 flex-col gap-4 sm:gap-6">
                <Outlet />
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
