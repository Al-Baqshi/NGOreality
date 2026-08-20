import type { ComponentProps } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Globe } from 'lucide-react';

import { NavMain } from '@/components/nav-main';
import { NavSecondary } from '@/components/nav-secondary';
import { NavUser } from '@/components/nav-user';
import { CRM_NAV_GROUPS, isCrmNavActive } from '@/components/crm/crm-nav';
import { useCrmNavCounts } from '@/hooks/useCrmNavCounts';
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

export function CrmAppSidebar({
  onSignOut,
  ...props
}: ComponentProps<typeof Sidebar> & { onSignOut: () => void }) {
  const { pathname } = useLocation();
  const navCounts = useCrmNavCounts();

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
              tooltip="NGOreality Staff CRM"
              render={<Link to="/dashboard" />}
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
                <span className="truncate font-medium">NGOreality</span>
                <span className="truncate text-xs">Staff CRM</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {CRM_NAV_GROUPS.map((group) => (
          <NavMain
            key={group.label}
            label={group.label}
            items={group.items.map((item) => {
              const count = item.countKey ? navCounts[item.countKey] : 0;
              return {
                title: item.label,
                url: item.to,
                icon: item.icon,
                isActive: isCrmNavActive(pathname, item.to),
                count,
                urgent: item.urgent,
              };
            })}
          />
        ))}
        <NavSecondary
          className="mt-auto"
          items={[{ title: 'Public site', url: '/public', icon: Globe }]}
        />
      </SidebarContent>

      <SidebarFooter>
        <NavUser
          onSignOut={onSignOut}
          extraItems={[{ title: 'Notifications', url: '/notifications', icon: Bell }]}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
