const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API}/api/v1${path}`, { cache: 'no-store' });
  const j = await r.json();
  if (!j.success) throw new Error(j.error?.message ?? j.error?.code ?? 'API error');
  return j.data as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.success) throw new Error(j.error?.message ?? j.error?.code ?? 'API error');
  return j.data as T;
}
