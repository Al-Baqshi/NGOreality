import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import PortalNotificationBell from './notifications/PortalNotificationBell';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';
import CrmNavUser from './crm/CrmNavUser';
import { CRM_NAV_GROUPS } from './crm/crm-nav';
import { useCrmNavCounts } from '../hooks/useCrmNavCounts';
import { getCrmPageTitle } from './crm/crm-page-title';
import { cn } from '@/lib/utils';
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

const NAV_BTN =
  'h-8 rounded-none px-2.5 text-[13px] font-medium text-white/80 hover:bg-white/10 hover:text-white data-active:bg-gold data-active:font-semibold data-active:text-ink-950 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0';

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
        <Sidebar collapsible="icon" variant="sidebar" className="border-r-2 border-gold">
          <SidebarHeader className="border-b border-white/10 p-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="NGOreality Staff CRM"
                  className={cn(
                    NAV_BTN,
                    'h-auto py-3 hover:bg-transparent hover:text-white data-active:bg-transparent data-active:text-white group-data-[collapsible=icon]:size-auto group-data-[collapsible=icon]:h-12 group-data-[collapsible=icon]:w-full',
                  )}
                  render={
                    <Link
                      to="/dashboard"
                      className="flex w-full min-w-0 items-center gap-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                      aria-label="NGOreality CRM home"
                    />
                  }
                >
                  <img
                    src="/reality-badge.png"
                    alt=""
                    className="size-8 shrink-0 object-contain group-data-[collapsible=icon]:size-7"
                    decoding="async"
                  />
                  <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate text-[13px] font-black uppercase tracking-[0.06em] text-white">
                      NGOreality
                    </span>
                    <span className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-gold">
                      Staff CRM
                    </span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-2 py-2 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-2">
            {CRM_NAV_GROUPS.map((group, index) => (
              <SidebarGroup
                key={group.label}
                className={cn(
                  'p-0',
                  index > 0 && 'mt-3 border-t border-white/10 pt-3',
                  'group-data-[collapsible=icon]:mt-1 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:pt-0',
                )}
              >
                <SidebarGroupLabel className="mb-1 h-auto px-2.5 py-0 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-gold/70 group-data-[collapsible=icon]:!hidden">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-px group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1">
                    {group.items.map((item) => {
                      const count = item.countKey ? navCounts[item.countKey] : 0;
                      return (
                        <SidebarMenuItem
                          key={item.to}
                          className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center"
                        >
                          <SidebarMenuButton
                            isActive={isNavActive(pathname, item.to)}
                            className={NAV_BTN}
                            tooltip={count > 0 ? `${item.label} — ${count} waiting` : item.label}
                            render={
                              <NavLink
                                to={item.to}
                                className="relative flex w-full min-w-0 items-center gap-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                              >
                                <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
                                <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
                                  {item.label}
                                </span>
                                {count > 0 && (
                                  <span
                                    className={cn(
                                      'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-none px-1 font-mono text-[10px] leading-none tabular-nums group-data-[collapsible=icon]:hidden',
                                      item.urgent
                                        ? 'bg-gold font-semibold text-ink-950'
                                        : 'bg-white/15 text-white',
                                      isNavActive(pathname, item.to) &&
                                        (item.urgent
                                          ? 'bg-ink-950 text-gold'
                                          : 'bg-ink-950/20 text-ink-950'),
                                    )}
                                  >
                                    {count > 99 ? '99+' : count}
                                  </span>
                                )}
                                {count > 0 && (
                                  <span
                                    className="pointer-events-none absolute top-1 right-1 hidden size-1.5 bg-gold group-data-[collapsible=icon]:block"
                                    aria-hidden
                                  />
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

          <SidebarFooter className="border-t border-white/10 p-2 group-data-[collapsible=icon]:p-1.5">
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
                <main className="min-w-0 flex-1">
                  <Outlet />
                </main>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
