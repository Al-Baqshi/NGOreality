/** Optional Go API for monitor runs and notification flush (backend/cmd/api). */

const apiUrl = (import.meta.env.VITE_MONITOR_API_URL as string | undefined)?.replace(/\/$/, '');
const apiKey = import.meta.env.VITE_MONITOR_API_KEY as string | undefined;

export function isMonitorApiConfigured(): boolean {
  return Boolean(apiUrl?.trim());
}

export async function flushPendingNotifications(): Promise<{
  pending: number;
  sent: number;
  failed: number;
} | null> {
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

  return res.json();
}

export async function fetchNotificationSummary(): Promise<{
  pending: number;
  sent: number;
  failed: number;
} | null> {
  if (!apiUrl) return null;

  const headers: Record<string, string> = {};
  if (apiKey?.trim()) headers['X-API-Key'] = apiKey.trim();

  const res = await fetch(`${apiUrl}/v1/notifications/summary`, { headers });
  if (!res.ok) return null;
  return res.json();
}
