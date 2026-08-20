import { Link } from 'react-router-dom';

import BrandLogo from '@/components/BrandLogo';
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

type AppSidebarBrandProps = {
  to: string;
  title: string;
  subtitle: string;
  tooltip?: string;
  isActive?: boolean;
};

/**
 * Shared brand lockup for CRM + member-portal sidebars.
 * Reality Badge seal — collapses to a centered icon on the compact rail.
 */
export function AppSidebarBrand({
  to,
  title,
  subtitle,
  tooltip,
  isActive = false,
}: AppSidebarBrandProps) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;

  return (
    <SidebarHeader
      className={cn(
        'gap-0 border-b border-sidebar-border/35 p-0',
        collapsed && 'flex items-center justify-center py-3',
      )}
    >
      <div
        className={cn(
          'bg-gradient-to-b from-white/[0.06] to-transparent',
          collapsed ? 'flex w-full justify-center px-0' : 'px-2 pb-2 pt-2.5',
        )}
      >
        <SidebarMenu className={cn(collapsed && 'w-auto')}>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={tooltip ?? title}
              isActive={isActive}
              className={cn(
                'h-14 gap-3 rounded-lg px-2.5 hover:bg-white/10 data-active:bg-white/10',
                'group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center',
              )}
              render={
                <Link
                  to={to}
                  onClick={() => {
                    if (isMobile) setOpenMobile(false);
                  }}
                />
              }
            >
              <BrandLogo
                variant="icon"
                iconClassName={cn(
                  'shrink-0 object-contain drop-shadow-sm mix-blend-lighten',
                  collapsed ? 'size-9' : 'size-10',
                )}
              />
              {!collapsed ? (
                <div className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-[13px] font-bold tracking-[0.04em] text-white uppercase">
                    {title}
                  </span>
                  <span className="mt-0.5 truncate font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-primary">
                    {subtitle}
                  </span>
                </div>
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </div>
    </SidebarHeader>
  );
}
