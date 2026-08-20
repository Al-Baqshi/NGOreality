import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, LogOut, type LucideIcon } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function NavUser({
  onSignOut,
  extraItems = [],
}: {
  onSignOut: () => void;
  extraItems?: { title: string; url: string; icon: LucideIcon }[];
}) {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const { profile, user, centralUser } = useAuth();

  const name =
    profile?.full_name?.trim() ||
    centralUser?.full_name?.trim() ||
    centralUser?.username ||
    'Account';
  const email = user?.email ?? centralUser?.email ?? '';
  const letters = initials(name);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="h-12 rounded-lg px-2 hover:bg-white/10 aria-expanded:bg-white/10 aria-expanded:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-1.5!"
              />
            }
          >
            <Avatar className="size-8 rounded-lg after:rounded-lg after:border-white/20">
              <AvatarFallback className="rounded-lg bg-sidebar-primary/90 font-semibold text-sidebar-primary-foreground">
                {letters}
              </AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-medium text-white">{name}</span>
              {email ? (
                <span className="truncate text-xs text-white/55">{email}</span>
              ) : null}
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-white/50 group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8 rounded-lg after:rounded-lg">
                    <AvatarFallback className="rounded-lg bg-sidebar-primary/90 font-semibold text-sidebar-primary-foreground">
                      {letters}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{name}</span>
                    {email ? <span className="truncate text-xs text-muted-foreground">{email}</span> : null}
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            {extraItems.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {extraItems.map((item) => (
                    <DropdownMenuItem
                      key={item.url}
                      onClick={() => {
                        if (item.url.startsWith('http')) {
                          window.open(item.url, '_blank', 'noopener');
                          return;
                        }
                        navigate(item.url);
                      }}
                    >
                      <item.icon />
                      {item.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSignOut}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
