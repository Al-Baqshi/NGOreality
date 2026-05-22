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
      className={`relative inline-flex items-center justify-center size-9 sm:size-10 rounded-md border-2 border-ink-950 dark:border-border hover:bg-ink-50 dark:hover:bg-muted shrink-0 ${className}`}
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
    >
      <Bell size={18} aria-hidden />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-accent text-white font-mono text-[10px] font-bold leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
