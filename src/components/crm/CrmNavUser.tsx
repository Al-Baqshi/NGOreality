import { LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  const email = user?.email ?? '';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex w-full min-w-0 items-center gap-2.5 px-1 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Avatar className="size-8 shrink-0 rounded-md ring-2 ring-gold">
            <AvatarFallback className="rounded-md bg-gold text-xs font-bold text-ink-950">
              {staffInitials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold text-white">{name}</span>
            {email ? (
              <span className="truncate font-mono text-2xs text-gold/80" title={email}>
                {email}
              </span>
            ) : null}
          </div>
        </div>
      </SidebarMenuItem>
      <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
        <button
          type="button"
          onClick={onSignOut}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md border-2 border-gold bg-transparent px-3 font-mono text-2xs font-semibold uppercase tracking-wider text-gold transition-colors hover:bg-gold hover:text-ink-950 group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:text-gold group-data-[collapsible=icon]:hover:bg-gold/20"
        >
          <LogOut className="size-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:sr-only">Sign out</span>
        </button>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
