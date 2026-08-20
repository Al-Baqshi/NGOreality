import { LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';

function staffInitials(name: string | undefined): string {
  if (!name?.trim()) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

type CrmNavUserProps = {
  onSignOut: () => void;
};

/** Compact identity row — avatar + name, sign out as an icon so it does not dominate the rail. */
export default function CrmNavUser({ onSignOut }: CrmNavUserProps) {
  const { profile, user } = useAuth();
  const { state, isMobile } = useSidebar();
  const iconRail = !isMobile && state === 'collapsed';

  const name = profile?.full_name?.trim() || 'Staff';
  const email = user?.email ?? '';
  const identityHint = email ? `${name} · ${email}` : name;

  if (iconRail) {
    return (
      <SidebarMenu className="items-center gap-1">
        <SidebarMenuItem className="flex justify-center">
          <SidebarMenuButton
            tooltip={identityHint}
            className="size-8 rounded-none hover:bg-white/10"
            aria-label={identityHint}
          >
            <Avatar className="size-6 shrink-0 rounded-none">
              <AvatarFallback className="rounded-none bg-gold text-[10px] font-bold text-ink-950">
                {staffInitials(profile?.full_name)}
              </AvatarFallback>
            </Avatar>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem className="flex justify-center">
          <SidebarMenuButton
            tooltip="Sign out"
            onClick={onSignOut}
            className="size-8 rounded-none text-gold hover:bg-gold hover:text-ink-950"
          >
            <LogOut className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="sr-only">Sign out</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2 px-1">
      <Avatar className="size-8 shrink-0 rounded-none">
        <AvatarFallback className="rounded-none bg-gold text-xs font-bold text-ink-950">
          {staffInitials(profile?.full_name)}
        </AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 flex-1 text-left leading-tight">
        <span className="truncate text-[13px] font-semibold text-white">{name}</span>
        {email ? (
          <span className="truncate font-mono text-[10px] text-gold/70" title={email}>
            {email}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onSignOut}
        className="flex size-8 shrink-0 items-center justify-center text-gold transition-colors hover:bg-gold hover:text-ink-950"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}
