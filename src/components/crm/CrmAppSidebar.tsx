import type { ComponentProps } from 'react';
import { Bell, Globe } from 'lucide-react';

import { AppSidebarBrand } from '@/components/AppSidebarBrand';
import { NavMain } from '@/components/nav-main';
import { NavSecondary } from '@/components/nav-secondary';
import { NavUser } from '@/components/nav-user';
import { CRM_NAV_GROUPS, isCrmNavActive } from '@/components/crm/crm-nav';
import { useCrmNavCounts } from '@/hooks/useCrmNavCounts';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from '@/components/ui/sidebar';
import { useLocation } from 'react-router-dom';

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
      <AppSidebarBrand
        to="/dashboard"
        title="NGOreality"
        subtitle="Staff CRM"
        tooltip="NGOreality Staff CRM"
        isActive={pathname === '/dashboard'}
      />

      <SidebarContent className="gap-1 px-1 py-2">
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

      <SidebarFooter className="border-t border-sidebar-border/35 p-2">
        <NavUser
          onSignOut={onSignOut}
          extraItems={[{ title: 'Notifications', url: '/notifications', icon: Bell }]}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
