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
import { cn } from '@/lib/utils';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/** Compact account menu for the app header (beside notifications). */
export function NavUser({
  onSignOut,
  extraItems = [],
}: {
  onSignOut: () => void;
  extraItems?: { title: string; url: string; icon: LucideIcon }[];
}) {
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
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex h-9 max-w-[12rem] items-center gap-2 rounded-md px-1.5 text-sm outline-hidden',
          'text-foreground transition-colors hover:bg-muted',
          'focus-visible:ring-2 focus-visible:ring-ring',
          'data-popup-open:bg-muted aria-expanded:bg-muted',
        )}
        aria-label="Account menu"
      >
        <Avatar className="size-7 rounded-md after:rounded-md">
          <AvatarFallback className="rounded-md bg-accent font-semibold text-accent-foreground text-xs">
            {letters}
          </AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 truncate font-medium sm:inline">{name}</span>
        <ChevronsUpDown className="hidden size-3.5 shrink-0 text-muted-foreground sm:inline" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="z-[100] min-w-56 rounded-lg"
        side="bottom"
        align="end"
        sideOffset={8}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar className="size-8 rounded-lg after:rounded-lg">
                <AvatarFallback className="rounded-lg bg-accent font-semibold text-accent-foreground">
                  {letters}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                {email ? (
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
                ) : null}
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
  );
}
