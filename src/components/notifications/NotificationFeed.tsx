import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Inbox, RefreshCw } from 'lucide-react';
import {
  PORTAL_NOTIFICATION_EVENT_LABELS,
  type PortalNotification,
} from '../../types';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type NotificationFeedProps = {
  items: PortalNotification[];
  loading: boolean;
  error: string | null;
  emptyMessage?: string;
  onRefresh: () => void;
  onMarkAllRead: () => void;
  onOpen: (item: PortalNotification) => void;
};

export default function NotificationFeed({
  items,
  loading,
  error,
  emptyMessage = 'No notifications yet.',
  onRefresh,
  onMarkAllRead,
  onOpen,
}: NotificationFeedProps) {
  const navigate = useNavigate();
  const unread = items.filter((n) => !n.read_at).length;

  const handleClick = (item: PortalNotification) => {
    void onOpen(item);
    if (item.link_path) {
      navigate(item.link_path);
    }
  };

  return (
    <div className="card-brutal overflow-hidden flex flex-col max-h-[min(70vh,640px)]">
      <div className="border-b-3 border-ink-950 dark:border-border px-4 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Bell size={14} aria-hidden />
          <span className="font-mono text-xs uppercase tracking-wider font-semibold">Activity</span>
          {unread > 0 && (
            <span className="font-mono text-2xs uppercase bg-accent text-white px-2 py-0.5">
              {unread} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void onMarkAllRead()}
              className="btn-brutal-outline text-2xs min-h-[36px] px-2 flex items-center gap-1"
            >
              <CheckCheck size={12} aria-hidden />
              Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            className="btn-brutal-outline text-2xs min-h-[36px] px-2 flex items-center gap-1"
            aria-label="Refresh"
          >
            <RefreshCw size={12} aria-hidden />
          </button>
        </div>
      </div>

      {error && (
        <p className="text-accent text-xs font-mono border-b border-accent px-4 py-3" role="alert">
          {error}
          {error.includes('portal_notifications') && (
            <span className="block mt-1">Apply migration 023 on Supabase.</span>
          )}
        </p>
      )}

      {loading ? (
        <p className="p-6 text-sm text-ink-400">Loading…</p>
      ) : items.length === 0 ? (
        <div className="p-8 text-center text-sm text-ink-500">
          <Inbox size={32} className="mx-auto mb-3 opacity-40" aria-hidden />
          {emptyMessage}
        </div>
      ) : (
        <ul className="divide-y divide-ink-100 dark:divide-border overflow-y-auto flex-1 min-h-0">
          {items.map((item) => {
            const isUnread = !item.read_at;
            const eventLabel =
              PORTAL_NOTIFICATION_EVENT_LABELS[item.event_type] ?? item.event_type.replace(/_/g, ' ');

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleClick(item)}
                  className={`w-full text-left px-4 py-3 flex gap-3 min-h-[56px] hover:bg-ink-50 dark:hover:bg-muted/50 transition-colors ${
                    isUnread ? 'bg-teal-light/30 dark:bg-teal/10' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${isUnread ? 'bg-accent' : 'bg-transparent'}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-sm text-ink-950 dark:text-foreground truncate">
                        {item.title}
                      </span>
                      <span className="font-mono text-2xs text-ink-400 shrink-0">{formatWhen(item.created_at)}</span>
                    </span>
                    <span className="font-mono text-2xs uppercase text-teal block mt-0.5">{eventLabel}</span>
                    {item.organizations?.name && (
                      <span className="text-2xs text-ink-500 block truncate">{item.organizations.name}</span>
                    )}
                    {item.body?.trim() && (
                      <span className="text-xs text-ink-600 dark:text-muted-foreground line-clamp-2 block mt-1 leading-relaxed">
                        {item.body}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function NotificationFeedHint({ emailNotificationsPath }: { emailNotificationsPath: string }) {
  return (
    <p className="text-xs text-ink-500 mt-4 leading-relaxed">
      Outbound membership and site-down emails are managed separately under{' '}
      <Link to={emailNotificationsPath} className="font-semibold underline text-ink-950 dark:text-foreground">
        Email notifications
      </Link>
      .
    </p>
  );
}
