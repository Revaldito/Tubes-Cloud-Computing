import { cookies } from "next/headers";

export function getBackendBaseUrl(): string {
  return (process.env.BACKEND_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
}

export async function fetchBackendJson<T>(
  apiPath: string
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; offline: boolean; error: string }> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");

  try {
    const res = await fetch(`${getBackendBaseUrl()}${apiPath}`, {
      method: "GET",
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        offline: false,
        error: String(json.error || `HTTP ${res.status}`),
      };
    }

    return { ok: true, status: res.status, data: json as T };
  } catch {
    return {
      ok: false,
      status: 503,
      offline: true,
      error: "Tidak dapat terhubung ke server Backend.",
    };
  }
}
