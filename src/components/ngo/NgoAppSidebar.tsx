import type { ComponentProps } from 'react';
import { Globe } from 'lucide-react';

import { AppSidebarBrand } from '@/components/AppSidebarBrand';
import { NavMain } from '@/components/nav-main';
import { NavSecondary } from '@/components/nav-secondary';
import {
  NGO_PORTAL_NAV_GROUPS,
  type NgoNavItem,
} from '@/components/ngo/ngo-nav';
import {
  Sidebar,
  SidebarContent,
  SidebarRail,
} from '@/components/ui/sidebar';

export function NgoAppSidebar({
  navItems,
  activeId,
  organizationName,
  subtitle,
  homePath,
  ...props
}: ComponentProps<typeof Sidebar> & {
  navItems: NgoNavItem[];
  activeId: string;
  organizationName: string;
  subtitle: string;
  homePath: string;
}) {
  const useGroupedNav = navItems.length > 2;
  const groups = useGroupedNav
    ? NGO_PORTAL_NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => navItems.some((n) => n.id === item.id)),
      })).filter((group) => group.items.length > 0)
    : [{ label: 'Get started', items: navItems }];

  return (
    <Sidebar collapsible="icon" {...props}>
      <AppSidebarBrand
        to={homePath}
        title={organizationName}
        subtitle={subtitle}
        tooltip={`${organizationName} — ${subtitle}`}
        isActive={activeId === 'overview'}
      />

      <SidebarContent className="gap-1 px-1 py-2 group-data-[collapsible=icon]:px-1.5 group-data-[collapsible=icon]:items-center">
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
      <SidebarRail />
    </Sidebar>
  );
}
