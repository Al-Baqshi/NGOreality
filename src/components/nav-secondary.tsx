import * as React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

export function NavSecondary({
  items,
  className,
  ...props
}: {
  items: {
    title: string;
    url: string;
    icon: LucideIcon;
  }[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarGroup
      {...props}
      className={cn(
        'border-t border-sidebar-border/30 pt-2',
        'group-data-[collapsible=icon]:border-t-0 group-data-[collapsible=icon]:px-0',
        className,
      )}
    >
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:items-center">
          {items.map((item) => (
            <SidebarMenuItem
              key={item.title}
              className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center"
            >
              <SidebarMenuButton
                tooltip={item.title}
                className={cn(
                  'h-9 rounded-md px-2.5 text-[13px] text-white/65 hover:bg-white/10 hover:text-white',
                  'group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:p-0!',
                  'group-data-[collapsible=icon]:justify-center',
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
                <item.icon className="size-4 opacity-70" />
                <span className="group-data-[collapsible=icon]:sr-only">{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
