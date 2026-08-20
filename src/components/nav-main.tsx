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
import { cn } from '@/lib/utils';

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
    <SidebarGroup className="py-1.5 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-1">
      {label ? (
        <SidebarGroupLabel className="mb-1 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-primary/80">
          {label}
        </SidebarGroupLabel>
      ) : null}
      <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:items-center">
        {items.map((item) => {
          const count = item.count ?? 0;
          return (
            <SidebarMenuItem key={item.url} className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
              <SidebarMenuButton
                tooltip={count > 0 ? `${item.title} — ${count} waiting` : item.title}
                isActive={item.isActive}
                className={cn(
                  'h-9 rounded-md px-2.5 text-[13px] text-white/80 transition-colors',
                  'hover:bg-white/10 hover:text-white',
                  'data-active:bg-sidebar-primary/15 data-active:font-semibold data-active:text-white',
                  'data-active:shadow-[inset_3px_0_0_0_var(--sidebar-primary)]',
                  'group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:p-0!',
                  'group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0',
                  'group-data-[collapsible=icon]:data-active:shadow-none group-data-[collapsible=icon]:data-active:bg-white/15',
                )}
                render={
                  <Link
                    to={item.url}
                    onClick={() => {
                      if (isMobile) setOpenMobile(false);
                    }}
                  />
                }
              >
                <item.icon
                  className={cn(
                    'size-4 opacity-80',
                    item.isActive && 'text-sidebar-primary opacity-100',
                  )}
                />
                <span className="group-data-[collapsible=icon]:sr-only">{item.title}</span>
              </SidebarMenuButton>
              {count > 0 ? (
                <SidebarMenuBadge
                  className={cn(
                    'rounded-md font-mono text-[10px] tabular-nums',
                    item.urgent
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'bg-white/15 text-white',
                  )}
                >
                  {count > 99 ? '99+' : count}
                </SidebarMenuBadge>
              ) : null}
              {count > 0 ? (
                <span
                  className="pointer-events-none absolute top-1 right-1 hidden size-1.5 rounded-full bg-sidebar-primary group-data-[collapsible=icon]:block"
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
