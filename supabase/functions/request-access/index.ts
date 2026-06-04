import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Public access-request endpoint.
 *
 * Body: { email, password, name?, message? }
 *
 * Creates a banned auth user with the chosen password, and a pending
 * access_request linked to it. The user CANNOT sign in until an admin
 * approves (which clears banned_until via the sibling edge function).
 *
 * Why this is safer than storing the password in our own table:
 * - Supabase hashes + manages the credential the same way it does any user.
 * - We never see the plaintext beyond this request.
 * - Approval is a single column flip; no "set up your password" round-trip
 *   email is required.
 *
 * Security notes:
 * - verify_jwt is false on this function (public). Calls go straight to
 *   service-role-backed admin operations.
 * - We rate-limit lightly via dedupe (don't create dupes for same email).
 * - We never reveal whether an email already exists — every accepted call
 *   returns the same "submitted" payload.
 * - Password validation happens here AND Supabase enforces its own minimum
 *   server-side.
 */

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 100 years out — long enough that we never accidentally clear it via TTL.
const BANNED_UNTIL = "2125-01-01T00:00:00Z";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { email?: string; password?: string; name?: string; message?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const name = body.name?.trim().slice(0, 200) ?? null;
  const message = body.message?.trim().slice(0, 500) ?? null;

  if (!email || !isValidEmail(email)) return json({ error: "A valid email is required." }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
  if (password.length > 200) return json({ error: "Password is too long." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Generic success payload — same response whether request was newly created,
  // already-pending, or for an already-active user. Prevents email enumeration.
  const acceptedResponse = json({ ok: true, status: "submitted" });

  // Dedupe: existing request for this email?
  const { data: existing } = await admin
    .from("access_requests")
    .select("id, status, user_id")
    .eq("email", email)
    .order("requested_at", { ascending: false })
    .limit(1);
  if (existing && existing.length > 0) {
    const r = existing[0];
    if (r.status === "pending" || r.status === "approved") {
      // Either awaiting decision or already an active user — silent success.
      return acceptedResponse;
    }
    // Denied → fall through and let them re-request.
  }

  // Dedupe: email already in auth.users? A single listUsers() call returns only
  // the first page (~50), so the original guard silently failed as the table
  // grew — both breaking dedupe and leaking an enumeration signal. Page through
  // until found or exhausted (cheap for an invite-only tool).
  let existingUser: { id: string; banned_until?: string | null } | undefined;
  for (let page = 1; page <= 50; page++) {
    const { data: pageData, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !pageData) break;
    const hit = pageData.users.find((u) => u.email === email);
    if (hit) { existingUser = hit as { id: string; banned_until?: string | null }; break; }
    if (pageData.users.length < 200) break; // last page reached
  }
  if (existingUser && !existingUser.banned_until) {
    // Already an active user. Silent success.
    return acceptedResponse;
  }

  // If a banned/orphan user exists from a previous denied/expired request,
  // clean them up first to avoid colliding on email uniqueness.
  if (existingUser) {
    await admin.auth.admin.deleteUser(existingUser.id);
  }

  // Create the user with their chosen password, but locked.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email verification step — admin approval is our gate
    user_metadata: name ? { full_name: name } : undefined,
    ban_duration: "876000h", // 100 years; cleared on admin approve
  });
  if (createErr || !created?.user) {
    console.error("createUser failed", createErr);
    return json({ error: "Could not submit request. Please try again." }, 500);
  }

  const { error: insertErr } = await admin.from("access_requests").insert({
    email,
    name,
    message,
    user_id: created.user.id,
    status: "pending",
  });
  if (insertErr) {
    console.error("access_requests insert failed", insertErr);
    // Roll back the user to avoid orphaning.
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: "Could not submit request. Please try again." }, 500);
  }

  return acceptedResponse;
});
