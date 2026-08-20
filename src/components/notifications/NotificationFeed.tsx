import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, ChevronRight, Inbox, RefreshCw, Search } from 'lucide-react';
import {
  PORTAL_NOTIFICATION_EVENT_LABELS,
  type PortalNotification,
} from '../../types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

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
    <div className="flex max-h-[min(78vh,760px)] flex-col overflow-hidden rounded-xl border border-ink-200/90 bg-white shadow-sm dark:border-border dark:bg-card">
      {/* Activity bar */}
      <div className="shrink-0 border-b border-teal/30 bg-gradient-to-r from-[#041C3C] via-[#0a2a4a] to-[#0d3d4a] px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
              <Bell size={15} className="text-[#EBBB57]" aria-hidden />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-white">
                Activity
              </span>
              {unread > 0 ? (
                <span className="rounded-full bg-[#EBBB57] px-2.5 py-0.5 font-mono text-2xs font-bold uppercase tracking-wider text-[#041C3C]">
                  {unread} new
                </span>
              ) : (
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-2xs uppercase tracking-wider text-white/70">
                  Up to date
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void onMarkAllRead()}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#EBBB57]/70 bg-[#EBBB57]/10 px-3 font-mono text-2xs font-semibold uppercase tracking-wider text-[#EBBB57] transition-colors hover:bg-[#EBBB57] hover:text-[#041C3C]"
              >
                <CheckCheck size={12} aria-hidden />
                Mark all read
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white/80 transition-colors hover:border-[#EBBB57]/60 hover:bg-[#EBBB57]/15 hover:text-[#EBBB57]"
              aria-label="Refresh"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 space-y-3 border-b border-ink-100 bg-ink-50/40 px-4 py-3 dark:border-border dark:bg-muted/20">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search alerts…"
            className="w-full min-h-[40px] rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-ink-400 focus:border-teal focus:ring-2 focus:ring-teal/20 dark:border-border dark:bg-card"
            aria-label="Search notifications"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'unread', 'read'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setReadFilter(id)}
              className={cn(
                'min-h-[36px] rounded-full border px-3.5 py-1.5 font-mono text-2xs uppercase tracking-wider transition-colors',
                readFilter === id
                  ? 'border-teal bg-teal text-white shadow-sm'
                  : 'border-ink-200 bg-white text-ink-600 hover:border-teal/50 hover:text-teal dark:border-border dark:bg-card',
              )}
            >
              {id === 'all' ? `All (${items.length})` : id === 'unread' ? `Unread (${unread})` : 'Read'}
            </button>
          ))}
          {eventTypes.length > 0 ? (
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <span className="shrink-0 font-mono text-2xs uppercase tracking-wider text-ink-400">
                Type
              </span>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? 'all')}>
                <SelectTrigger
                  size="sm"
                  className="h-9 min-w-[9.5rem] max-w-[14rem] rounded-lg border-ink-200 bg-white font-mono text-2xs uppercase tracking-wide text-ink-700 shadow-none hover:border-teal/50 focus-visible:border-teal focus-visible:ring-teal/20 dark:border-border dark:bg-card"
                  aria-label="Filter by type"
                >
                  <SelectValue>
                    {typeFilter === 'all' ? 'All types' : eventLabel(typeFilter)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="end" className="min-w-[12rem] rounded-lg">
                  <SelectItem value="all" className="font-mono text-2xs uppercase">
                    All types
                  </SelectItem>
                  {eventTypes.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {eventLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="border-b border-accent px-4 py-3 font-mono text-xs text-accent" role="alert">
          {error}
          {error.includes('portal_notifications') ? (
            <span className="mt-1 block">Apply migration 023 on Supabase.</span>
          ) : null}
        </p>
      ) : null}

      {loading ? (
        <p className="p-6 text-sm text-ink-400">Loading…</p>
      ) : items.length === 0 ? (
        <div className="p-10 text-center text-sm text-ink-500">
          <Inbox size={32} className="mx-auto mb-3 text-teal" aria-hidden />
          {emptyMessage}
        </div>
      ) : filtered.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-500">No alerts match these filters.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {grouped.map(([label, rows]) => (
            <li key={label}>
              <p className="sticky top-0 z-[1] border-y border-ink-100 bg-ink-50/90 px-4 py-1.5 font-mono text-2xs uppercase tracking-wider text-ink-500 backdrop-blur-sm dark:border-border dark:bg-muted/50">
                {label}
              </p>
              <ul className="divide-y divide-ink-100 dark:divide-border">
                {rows.map((item) => {
                  const isUnread = !item.read_at;
                  return (
                    <li key={item.id}>
                      <div
                        className={cn(
                          'flex items-stretch',
                          isUnread
                            ? 'bg-teal/[0.06] dark:bg-teal/10'
                            : 'bg-white dark:bg-transparent',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleClick(item)}
                          className="flex min-h-[64px] min-w-0 flex-1 gap-3 px-4 py-3 text-left transition-colors hover:bg-teal/[0.08] dark:hover:bg-muted/50"
                        >
                          <span
                            className={cn(
                              'mt-2 size-2 shrink-0 rounded-full',
                              isUnread ? 'bg-teal' : 'bg-ink-200',
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                              <span
                                className={cn(
                                  'truncate text-sm dark:text-foreground',
                                  isUnread
                                    ? 'font-bold text-ink-950'
                                    : 'font-semibold text-ink-800',
                                )}
                              >
                                {item.title}
                              </span>
                              <span className="shrink-0 font-mono text-2xs text-ink-400">
                                {formatWhen(item.created_at)}
                              </span>
                            </span>
                            <span className="mt-1 inline-flex rounded-md border border-teal/30 bg-teal/10 px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wider text-teal">
                              {eventLabel(item.event_type)}
                            </span>
                            {item.organizations?.name ? (
                              <span className="mt-1 block truncate text-2xs text-ink-500">
                                {item.organizations.name}
                              </span>
                            ) : null}
                            {item.body?.trim() ? (
                              <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-ink-600 dark:text-muted-foreground">
                                {item.body}
                              </span>
                            ) : null}
                          </span>
                          {item.link_path ? (
                            <ChevronRight
                              size={16}
                              className="mt-2 shrink-0 text-ink-300"
                              aria-hidden
                            />
                          ) : null}
                        </button>
                        {isUnread ? (
                          <button
                            type="button"
                            onClick={() => void onOpen(item)}
                            className="shrink-0 px-3 text-ink-400 transition-colors hover:bg-teal hover:text-white"
                            title="Mark as read"
                            aria-label="Mark as read"
                          >
                            <Check size={16} />
                          </button>
                        ) : null}
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
    <p className="mt-4 text-xs leading-relaxed text-ink-500">
      Outbound membership and site-down emails are managed separately under{' '}
      <Link
        to={emailNotificationsPath}
        className="font-semibold text-ink-950 underline hover:text-teal dark:text-foreground"
      >
        Email notifications
      </Link>
      .
    </p>
  );
}
