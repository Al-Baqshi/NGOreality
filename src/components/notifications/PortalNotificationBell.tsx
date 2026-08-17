import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { usePortalNotifications } from '../../hooks/usePortalNotifications';
import type { PortalNotificationAudience } from '../../types';

type PortalNotificationBellProps = {
  audience: PortalNotificationAudience;
  to: string;
  className?: string;
};

export default function PortalNotificationBell({ audience, to, className = '' }: PortalNotificationBellProps) {
  const { unreadCount } = usePortalNotifications(audience, 30);

  return (
    <Link
      to={to}
      className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
    >
      <Bell size={16} aria-hidden />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gold px-1 font-mono text-[10px] font-semibold leading-none text-ink-950">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
