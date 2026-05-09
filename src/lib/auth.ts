import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Public anon client — safe to expose via Vite (`VITE_*`). */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
  }
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  });
  return client;
}

export function hasSupabaseAuthConfig(): boolean {
  return !!(import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim());
}

/** Comma-separated operator emails (lowercased for comparison). */
export function parseOperatorAllowlist(): Set<string> {
  const raw = import.meta.env.VITE_CE_OS_OPERATOR_EMAILS ?? "";
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function isOperatorEmail(email: string | undefined): boolean {
  if (!email) return false;
  const allow = parseOperatorAllowlist();
  if (allow.size === 0) return false;
  return allow.has(email.trim().toLowerCase());
}

export async function signInWithMagicLink(email: string): Promise<{ error: Error | null }> {
  try {
    const supabase = getSupabaseClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: origin ? `${origin}/` : undefined,
      },
    });
    return { error: error ? new Error(error.message) : null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export async function signOutUser(): Promise<void> {
  await getSupabaseClient().auth.signOut();
}

export function subscribeAuthState(
  fn: Parameters<SupabaseClient["auth"]["onAuthStateChange"]>[0]
): ReturnType<SupabaseClient["auth"]["onAuthStateChange"]> {
  return getSupabaseClient().auth.onAuthStateChange(fn);
}
