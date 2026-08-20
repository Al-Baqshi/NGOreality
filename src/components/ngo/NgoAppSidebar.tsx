import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Globe, User, UserCircle } from 'lucide-react';

import { NavMain } from '@/components/nav-main';
import { NavSecondary } from '@/components/nav-secondary';
import { NavUser } from '@/components/nav-user';
import { BAQSHI_ACCOUNT_URL } from '@/lib/baqshiAuth';
import type { NgoNavItem } from '@/components/ngo/ngo-nav';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

export function NgoAppSidebar({
  navItems,
  activeId,
  organizationName,
  subtitle,
  homePath,
  onSignOut,
  showAccountLinks,
  ...props
}: ComponentProps<typeof Sidebar> & {
  navItems: NgoNavItem[];
  activeId: string;
  organizationName: string;
  subtitle: string;
  homePath: string;
  onSignOut: () => void;
  showAccountLinks: boolean;
}) {
  return (
    <Sidebar
      collapsible="icon"
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={organizationName}
              isActive={activeId === 'overview'}
              render={<Link to={homePath} />}
            >
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <img
                  src="/reality-badge.png"
                  alt=""
                  className="size-5 object-contain"
                  decoding="async"
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{organizationName}</span>
                <span className="truncate text-xs">{subtitle}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain
          label="Your organisation"
          items={navItems.map((item) => ({
            title: item.label,
            url: item.path,
            icon: item.icon,
            isActive: activeId === item.id,
          }))}
        />
        <NavSecondary
          className="mt-auto"
          items={[{ title: 'Public site', url: '/public', icon: Globe }]}
        />
      </SidebarContent>

      <SidebarFooter>
        <NavUser
          onSignOut={onSignOut}
          extraItems={
            showAccountLinks
              ? [
                  { title: 'Profile', url: '/ngo/profile', icon: User },
                  { title: 'Notifications', url: '/ngo/notifications', icon: Bell },
                  { title: 'Account', url: BAQSHI_ACCOUNT_URL, icon: UserCircle },
                ]
              : []
          }
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
