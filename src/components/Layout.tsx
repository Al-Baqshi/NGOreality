import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import PortalNotificationBell from './notifications/PortalNotificationBell';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';
import CrmNavUser from './crm/CrmNavUser';
import { CRM_NAV_GROUPS } from './crm/crm-nav';
import { useCrmNavCounts } from '../hooks/useCrmNavCounts';
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
  const navCounts = useCrmNavCounts();

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
                    src="/reality-badge.png"
                    alt=""
                    className="size-9 shrink-0 object-contain"
                    decoding="async"
                  />
                  <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-black uppercase tracking-[0.04em] text-sidebar-foreground">
                      NGOreality
                    </span>
                    <span className="truncate font-mono text-2xs uppercase tracking-[0.14em] text-sidebar-foreground/60">
                      Staff CRM
                    </span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            {CRM_NAV_GROUPS.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="font-mono text-2xs uppercase tracking-[0.14em] text-sidebar-foreground/50">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const count = item.countKey ? navCounts[item.countKey] : 0;
                      return (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton
                            isActive={isNavActive(pathname, item.to)}
                            className="data-active:shadow-[inset_2px_0_0_#EBBB57]"
                            tooltip={count > 0 ? `${item.label} — ${count} waiting` : item.label}
                            render={
                              <NavLink
                                to={item.to}
                                className="flex w-full min-w-0 items-center gap-2"
                              >
                                <item.icon className="size-4 shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                {/* Answers "where is there work waiting?" without
                                    opening five screens. Hidden when the rail is
                                    collapsed to icons, where there is no room. */}
                                {count > 0 && (
                                  <span
                                    className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums group-data-[collapsible=icon]:hidden ${
                                      item.urgent
                                        ? 'bg-gold font-semibold text-ink-950'
                                        : 'bg-sidebar-accent text-sidebar-accent-foreground'
                                    }`}
                                  >
                                    {count > 999 ? '999+' : count}
                                  </span>
                                )}
                              </NavLink>
                            }
                          />
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border">
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
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-foreground">
              {pageTitle}
            </h1>
            <ThemeToggle variant="ghost" />
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
