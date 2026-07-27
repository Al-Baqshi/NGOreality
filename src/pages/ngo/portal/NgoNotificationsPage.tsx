import NotificationFeed from '../../../components/notifications/NotificationFeed';
import NgoPortalPageShell from '../../../components/ngo/NgoPortalPageShell';
import { usePortalNotifications } from '../../../hooks/usePortalNotifications';
import type { PortalNotification } from '../../../types';

export default function NgoNotificationsPage() {
  const { items, loading, error, refetch, markRead, markAllRead } = usePortalNotifications('ngo');

  const handleOpen = async (item: PortalNotification) => {
    if (!item.read_at) {
      await markRead(item.id);
    }
  };

  return (
    <NgoPortalPageShell title="Notifications" path="/ngo/notifications">
      <p className="text-xs text-ink-500 leading-relaxed -mt-2">
        Updates about your profile, setup requests, membership, trust standards, and badge requests from the NGOreality
        team.
      </p>

      <NotificationFeed
        items={items}
        loading={loading}
        error={error}
        emptyMessage="No updates yet. When our team changes something on your account, you will see it here."
        onRefresh={() => void refetch()}
        onMarkAllRead={() => void markAllRead()}
        onOpen={handleOpen}
      />
    </NgoPortalPageShell>
  );
}
