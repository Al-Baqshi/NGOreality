import { LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';

function staffInitials(name: string | undefined): string {
  if (!name?.trim()) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

type CrmNavUserProps = {
  onSignOut: () => void;
};

/** Staff footer — name + sign out only (no account/billing menu). */
export default function CrmNavUser({ onSignOut }: CrmNavUserProps) {
  const { profile, user } = useAuth();

  const name = profile?.full_name?.trim() || 'Staff';
  const email = user?.email ?? 'Signed in';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex w-full min-w-0 items-center gap-2 rounded-md border-2 border-ink-950 bg-white px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0 dark:border-gold dark:bg-transparent">
          <Avatar className="size-8 shrink-0 rounded-lg ring-2 ring-gold">
            <AvatarFallback className="rounded-lg bg-ink-950 text-xs font-semibold text-white dark:bg-gold dark:text-ink-950">
              {staffInitials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-medium text-sidebar-foreground">{name}</span>
            <span className="truncate text-xs text-sidebar-foreground/60">{email}</span>
          </div>
        </div>
      </SidebarMenuItem>
      <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSignOut}
          className="h-9 w-full rounded-lg text-ink-950 hover:bg-gold-light hover:text-ink-950 group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:p-0 dark:text-foreground dark:hover:bg-gold/15 dark:hover:text-gold"
        >
          <LogOut className="size-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:sr-only">Sign out</span>
        </Button>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
