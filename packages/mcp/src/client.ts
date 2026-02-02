/**
 * HTTP client for MoltIQ REST API. Used by MCP tools when server is running.
 */

const DEFAULT_BASE = "http://localhost:37777";

export function getBaseUrl(): string {
  return process.env.MOLTIQ_URL ?? process.env.MOLTIQ_BASE_URL ?? DEFAULT_BASE;
}

export async function apiGet<T = unknown>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const base = getBaseUrl();
  const url = new URL(path, base);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`MoltIQ API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const base = getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MoltIQ API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  const base = getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MoltIQ API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const base = getBaseUrl();
  const res = await fetch(`${base}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`MoltIQ API ${res.status}: ${await res.text()}`);
}
