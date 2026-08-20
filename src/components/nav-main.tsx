import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

export type NavMainItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  isActive?: boolean;
  count?: number;
  urgent?: boolean;
};

export function NavMain({
  label,
  items,
}: {
  label?: string;
  items: NavMainItem[];
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarMenu>
        {items.map((item) => {
          const count = item.count ?? 0;
          return (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                tooltip={count > 0 ? `${item.title} — ${count} waiting` : item.title}
                isActive={item.isActive}
                render={
                  <Link
                    to={item.url}
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                    }}
                  />
                }
              >
                <item.icon />
                <span>{item.title}</span>
              </SidebarMenuButton>
              {count > 0 ? (
                <SidebarMenuBadge
                  className={
                    item.urgent
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : undefined
                  }
                >
                  {count > 99 ? '99+' : count}
                </SidebarMenuBadge>
              ) : null}
              {count > 0 ? (
                <span
                  className="bg-sidebar-primary pointer-events-none absolute top-1 right-1 hidden size-1.5 group-data-[collapsible=icon]:block"
                  aria-hidden
                />
              ) : null}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
