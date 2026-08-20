import type { ComponentProps } from 'react';
import { Globe } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { AppSidebarBrand } from '@/components/AppSidebarBrand';
import { NavMain } from '@/components/nav-main';
import { NavSecondary } from '@/components/nav-secondary';
import { CRM_NAV_GROUPS, isCrmNavActive } from '@/components/crm/crm-nav';
import { useCrmNavCounts } from '@/hooks/useCrmNavCounts';
import {
  Sidebar,
  SidebarContent,
  SidebarRail,
} from '@/components/ui/sidebar';

export function CrmAppSidebar(props: ComponentProps<typeof Sidebar>) {
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
      <SidebarRail />
    </Sidebar>
  );
}
