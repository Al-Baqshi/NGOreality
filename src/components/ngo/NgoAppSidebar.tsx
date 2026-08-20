import type { ComponentProps } from 'react';
import { Bell, Globe, User, UserCircle } from 'lucide-react';

import { AppSidebarBrand } from '@/components/AppSidebarBrand';
import { NavMain } from '@/components/nav-main';
import { NavSecondary } from '@/components/nav-secondary';
import { NavUser } from '@/components/nav-user';
import {
  NGO_PORTAL_NAV_GROUPS,
  type NgoNavItem,
} from '@/components/ngo/ngo-nav';
import { BAQSHI_ACCOUNT_URL } from '@/lib/baqshiAuth';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
  const useGroupedNav = navItems.length > 2;
  const groups = useGroupedNav
    ? NGO_PORTAL_NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => navItems.some((n) => n.id === item.id)),
      })).filter((group) => group.items.length > 0)
    : [{ label: 'Get started', items: navItems }];

  return (
    <Sidebar
      collapsible="icon"
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      {...props}
    >
      <AppSidebarBrand
        to={homePath}
        title={organizationName}
        subtitle={subtitle}
        tooltip={`${organizationName} — ${subtitle}`}
        isActive={activeId === 'overview'}
      />

      <SidebarContent className="gap-1 px-1 py-2">
        {groups.map((group) => (
          <NavMain
            key={group.label}
            label={group.label}
            items={group.items.map((item) => ({
              title: item.label,
              url: item.path,
              icon: item.icon,
              isActive: activeId === item.id,
            }))}
          />
        ))}
        <NavSecondary
          className="mt-auto"
          items={[{ title: 'Public site', url: '/public', icon: Globe }]}
        />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/35 p-2">
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
