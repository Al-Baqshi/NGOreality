import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SectionHeader } from '../../components/ui';
import NotificationFeed, { NotificationFeedHint } from '../../components/notifications/NotificationFeed';
import { usePortalNotifications } from '../../hooks/usePortalNotifications';
import type { PortalNotification } from '../../types';

export default function CrmNotificationInbox() {
  const { items, loading, error, refetch, markRead, markAllRead } = usePortalNotifications('staff');

  const handleOpen = async (item: PortalNotification) => {
    if (!item.read_at) {
      await markRead(item.id);
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full min-w-0">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 dark:hover:text-foreground mb-6 min-h-[44px]"
      >
        <ArrowLeft size={14} aria-hidden /> Dashboard
      </Link>

      <SectionHeader>Notifications</SectionHeader>
      <p className="font-mono text-2xs text-ink-500 -mt-4 mb-6 max-w-xl leading-relaxed">
        In-app alerts for new inquiries, NGO portal sign-ups, setup requests, and badge requests. Open an item to go
        to the related CRM page.
      </p>

      <NotificationFeed
        items={items}
        loading={loading}
        error={error}
        emptyMessage="No alerts yet. New contact inquiries and NGO portal activity will appear here."
        onRefresh={() => void refetch()}
        onMarkAllRead={() => void markAllRead()}
        onOpen={handleOpen}
      />

      <NotificationFeedHint emailNotificationsPath="/email-notifications" />
    </div>
  );
}
