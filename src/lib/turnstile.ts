const apiUrl = (import.meta.env.VITE_MONITOR_API_URL as string | undefined)?.replace(/\/$/, '');
const apiKey = import.meta.env.VITE_MONITOR_API_KEY as string | undefined;

export async function verifyTurnstileToken(token: string): Promise<boolean> {
  if (!apiUrl) return true;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey?.trim()) headers['X-API-Key'] = apiKey.trim();

  const res = await fetch(`${apiUrl}/v1/turnstile/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ token }),
  });

  if (!res.ok) return false;

  const data = await res.json();
  return data.success === true;
}
