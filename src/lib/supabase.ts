import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert, TablesUpdate } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export type { Database, Tables, TablesInsert, TablesUpdate };

/**
 * Direct REST helper. Bypasses the supabase-js client, which has been observed
 * to hang on simple SELECT queries in some browser sessions (probably an
 * internal token-refresh race we haven't pinned down). Reads the access token
 * directly from localStorage. Returns parsed JSON on success.
 */
export async function restGet<T = unknown>(path: string, init?: { abortMs?: number }): Promise<T> {
  if (!url || !anonKey) throw new Error("Supabase not configured");
  const ref = url.replace(/^https?:\/\//, "").split(".")[0];
  const stored = localStorage.getItem(`sb-${ref}-auth-token`);
  const accessToken = stored ? (JSON.parse(stored)?.access_token as string | undefined) : undefined;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.abortMs ?? 8000);
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: {
        apikey: anonKey,
        Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${anonKey}`,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`REST ${res.status}: ${body}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Edge Function invoke via direct fetch (bypasses supabase-js). */
export async function functionInvoke<T = unknown>(
  name: string,
  body: unknown,
  init?: { abortMs?: number },
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  if (!url || !anonKey) return { ok: false, status: 0, error: "Supabase not configured" };
  const ref = url.replace(/^https?:\/\//, "").split(".")[0];
  const stored = localStorage.getItem(`sb-${ref}-auth-token`);
  const accessToken = stored ? (JSON.parse(stored)?.access_token as string | undefined) : undefined;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.abortMs ?? 15000);
  try {
    const res = await fetch(`${url}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: accessToken ? `Bearer ${accessToken}` : `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: (json as any)?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, data: json as T };
  } catch (err: any) {
    return { ok: false, status: 0, error: err?.message ?? "Network error" };
  } finally {
    clearTimeout(timer);
  }
}
