import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, ChevronRight, Inbox, RefreshCw, Search } from 'lucide-react';
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
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const then = new Date(d);
  then.setHours(0, 0, 0, 0);
  const days = Math.round((start.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return then.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function eventLabel(type: string): string {
  return PORTAL_NOTIFICATION_EVENT_LABELS[type] ?? type.replace(/_/g, ' ');
}

type ReadFilter = 'all' | 'unread' | 'read';

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
  const [query, setQuery] = useState('');
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const unread = items.filter((n) => !n.read_at).length;
  const eventTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const n of items) seen.add(n.event_type);
    return [...seen].sort((a, b) => eventLabel(a).localeCompare(eventLabel(b)));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((n) => {
      if (readFilter === 'unread' && n.read_at) return false;
      if (readFilter === 'read' && !n.read_at) return false;
      if (typeFilter !== 'all' && n.event_type !== typeFilter) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        (n.organizations?.name ?? '').toLowerCase().includes(q) ||
        eventLabel(n.event_type).toLowerCase().includes(q)
      );
    });
  }, [items, query, readFilter, typeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, PortalNotification[]>();
    for (const item of filtered) {
      const key = dayLabel(item.created_at);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const handleClick = (item: PortalNotification) => {
    void onOpen(item);
    if (item.link_path) navigate(item.link_path);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    onRefresh();
    window.setTimeout(() => setRefreshing(false), 400);
  };

  return (
    <div className="card-brutal overflow-hidden flex flex-col max-h-[min(78vh,760px)]">
      <div className="border-b-2 border-gold bg-ink-950 px-4 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-gold" aria-hidden />
          <span className="font-mono text-xs uppercase tracking-wider font-semibold text-white">Activity</span>
          {unread > 0 && (
            <span className="font-mono text-2xs uppercase bg-gold text-ink-950 px-2 py-0.5 font-semibold">
              {unread} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void onMarkAllRead()}
              className="inline-flex min-h-[36px] items-center gap-1 border-2 border-gold bg-transparent px-2 font-mono text-2xs font-semibold uppercase tracking-wider text-gold hover:bg-gold hover:text-ink-950"
            >
              <CheckCheck size={12} aria-hidden />
              Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="inline-flex size-9 items-center justify-center border-2 border-gold text-gold hover:bg-gold hover:text-ink-950"
            aria-label="Refresh"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} aria-hidden />
          </button>
        </div>
      </div>

      <div className="shrink-0 border-b border-ink-200 dark:border-border bg-white px-4 py-3 space-y-3 dark:bg-card">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search alerts…"
            className="input-brutal w-full pl-9 min-h-[40px] text-sm"
            aria-label="Search notifications"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'unread', 'read'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setReadFilter(id)}
              className={`font-mono text-2xs uppercase tracking-wider px-3 py-1.5 min-h-[36px] border-2 ${
                readFilter === id
                  ? 'border-ink-950 bg-ink-950 text-white'
                  : 'border-ink-200 text-ink-600 hover:border-gold hover:bg-gold-light'
              }`}
            >
              {id === 'all' ? `All (${items.length})` : id === 'unread' ? `Unread (${unread})` : 'Read'}
            </button>
          ))}
          {eventTypes.length > 1 && (
            <label className="ml-auto flex items-center gap-2 min-w-0">
              <span className="font-mono text-2xs uppercase tracking-wider text-ink-400 shrink-0">Type</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="input-brutal min-h-[36px] py-1 text-2xs font-mono"
                aria-label="Filter by type"
              >
                <option value="all">All types</option>
                {eventTypes.map((t) => (
                  <option key={t} value={t}>
                    {eventLabel(t)}
                  </option>
                ))}
              </select>
            </label>
          )}
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
        <div className="p-10 text-center text-sm text-ink-500">
          <Inbox size={32} className="mx-auto mb-3 text-gold" aria-hidden />
          {emptyMessage}
        </div>
      ) : filtered.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-500">No alerts match these filters.</p>
      ) : (
        <ul className="overflow-y-auto flex-1 min-h-0">
          {grouped.map(([label, rows]) => (
            <li key={label}>
              <p className="sticky top-0 z-[1] bg-ink-50 px-4 py-1.5 font-mono text-2xs uppercase tracking-wider text-ink-500 border-y border-ink-100 dark:bg-muted/40 dark:border-border">
                {label}
              </p>
              <ul className="divide-y divide-ink-100 dark:divide-border">
                {rows.map((item) => {
                  const isUnread = !item.read_at;
                  return (
                    <li key={item.id}>
                      <div
                        className={`flex items-stretch ${
                          isUnread
                            ? 'bg-gold-light/50 dark:bg-gold/10'
                            : 'bg-white dark:bg-transparent'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleClick(item)}
                          className="min-w-0 flex-1 text-left px-4 py-3 flex gap-3 min-h-[64px] hover:bg-gold-light/40 dark:hover:bg-muted/50 transition-colors"
                        >
                          <span
                            className={`mt-2 size-2 shrink-0 rounded-full ${isUnread ? 'bg-gold' : 'bg-ink-200'}`}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                              <span className={`text-sm truncate ${isUnread ? 'font-bold text-ink-950' : 'font-semibold text-ink-800'} dark:text-foreground`}>
                                {item.title}
                              </span>
                              <span className="font-mono text-2xs text-ink-400 shrink-0">{formatWhen(item.created_at)}</span>
                            </span>
                            <span className="mt-1 inline-flex border border-gold bg-gold/15 px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wider text-ink-950">
                              {eventLabel(item.event_type)}
                            </span>
                            {item.organizations?.name && (
                              <span className="text-2xs text-ink-500 block truncate mt-1">{item.organizations.name}</span>
                            )}
                            {item.body?.trim() && (
                              <span className="text-xs text-ink-600 dark:text-muted-foreground line-clamp-2 block mt-1 leading-relaxed">
                                {item.body}
                              </span>
                            )}
                          </span>
                          {item.link_path ? (
                            <ChevronRight size={16} className="mt-2 shrink-0 text-ink-300" aria-hidden />
                          ) : null}
                        </button>
                        {isUnread && (
                          <button
                            type="button"
                            onClick={() => void onOpen(item)}
                            className="shrink-0 px-3 text-ink-400 hover:bg-gold hover:text-ink-950"
                            title="Mark as read"
                            aria-label="Mark as read"
                          >
                            <Check size={16} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NotificationFeedHint({ emailNotificationsPath }: { emailNotificationsPath: string }) {
  return (
    <p className="text-xs text-ink-500 mt-4 leading-relaxed">
      Outbound membership and site-down emails are managed separately under{' '}
      <Link to={emailNotificationsPath} className="font-semibold underline text-ink-950 hover:text-gold dark:text-foreground">
        Email notifications
      </Link>
      .
    </p>
  );
}
