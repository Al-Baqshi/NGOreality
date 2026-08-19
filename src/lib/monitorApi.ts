/** Optional Go API for monitor runs and notification flush (backend/cmd/api). */

const apiUrl = (import.meta.env.VITE_MONITOR_API_URL as string | undefined)?.replace(/\/$/, '');
const apiKey = import.meta.env.VITE_MONITOR_API_KEY as string | undefined;

export function isMonitorApiConfigured(): boolean {
  return Boolean(apiUrl?.trim());
}

type NotificationCounts = {
  pending: number;
  sent: number;
  failed: number;
  skipped?: number;
};

/** Go API returns PascalCase field names; normalize for the CRM. */
function normalizeNotificationSummary(data: Record<string, unknown>): NotificationCounts {
  return {
    pending: Number(data.pending ?? data.Pending ?? 0),
    sent: Number(data.sent ?? data.Sent ?? 0),
    failed: Number(data.failed ?? data.Failed ?? 0),
    skipped: Number(data.skipped ?? data.Skipped ?? 0),
  };
}

export async function flushPendingNotifications(): Promise<NotificationCounts | null> {
  if (!apiUrl) return null;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey?.trim()) headers['X-API-Key'] = apiKey.trim();

  const res = await fetch(`${apiUrl}/v1/notifications/process`, {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Notification flush failed (${res.status})`);
  }

  return normalizeNotificationSummary((await res.json()) as Record<string, unknown>);
}

export async function fetchNotificationSummary(): Promise<NotificationCounts | null> {
  if (!apiUrl) return null;

  const headers: Record<string, string> = {};
  if (apiKey?.trim()) headers['X-API-Key'] = apiKey.trim();

  const res = await fetch(`${apiUrl}/v1/notifications/summary`, { headers });
  if (!res.ok) return null;
  return normalizeNotificationSummary((await res.json()) as Record<string, unknown>);
}
