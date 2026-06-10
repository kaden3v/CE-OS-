import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Approve, deny, or revoke an access request.
 *
 * The new flow (post 2026-05-09) is:
 * 1. User submits email + chosen password via the public `request-access` fn
 *    → an auth user is created with banned_until far in the future.
 * 2. Admin reviews here.
 * 3. Approve → clear banned_until → user can sign in with the password they
 *    already chose. No email round-trip.
 * 4. Deny → delete the auth user. No password remains on disk.
 * 5. Revoke → same as deny but for already-approved requests.
 *
 * Body: {
 *   request_id: string,
 *   action: 'approve' | 'deny' | 'revoke',
 *   denial_reason?: string,
 * }
 */

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // 1. Identify the caller via JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Missing Authorization header" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userResult, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userResult?.user) return json({ error: "Invalid token" }, 401);
  const callerId = userResult.user.id;

  // 2. Verify caller is admin.
  const { data: profile, error: profileErr } = await userClient
    .from("profiles").select("is_admin").eq("id", callerId).maybeSingle();
  if (profileErr) return json({ error: "Profile lookup failed" }, 500);
  if (!profile?.is_admin) return json({ error: "Forbidden — admin only" }, 403);

  // 3. Parse input.
  let body: { request_id?: string; action?: string; denial_reason?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const { request_id, action, denial_reason } = body;
  if (!request_id || !["approve", "deny", "revoke"].includes(action ?? "")) {
    return json({ error: "request_id and action ('approve'|'deny'|'revoke') are required" }, 400);
  }

  // 4. Service-role client for privileged ops.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 5. Load request.
  const { data: reqRow, error: reqErr } = await admin
    .from("access_requests").select("*").eq("id", request_id).maybeSingle();
  if (reqErr || !reqRow) return json({ error: "Request not found" }, 404);

  // 6. Branch.
  if (action === "approve") {
    if (reqRow.status !== "pending") return json({ error: `Already ${reqRow.status}` }, 409);
    if (!reqRow.user_id) return json({ error: "Request has no linked user" }, 500);

    // Clear ban so the user can sign in with the password they chose at request time.
    const { error: unbanErr } = await admin.auth.admin.updateUserById(reqRow.user_id, {
      ban_duration: "none",
    });
    if (unbanErr) {
      console.error("unban failed", unbanErr);
      return json({ error: "Could not unlock account", detail: unbanErr.message }, 500);
    }

    const { error: updateErr } = await admin
      .from("access_requests").update({
        status: "approved",
        decided_at: new Date().toISOString(),
        decided_by: callerId,
        denial_reason: null,
      }).eq("id", request_id);
    if (updateErr) {
      console.error("update failed", updateErr);
      return json({ error: "Could not update request" }, 500);
    }

    // Add the approved user to the approving admin's organization so the team
    // shares data. Without this they'd sign in to a "no workspace" screen.
    const { data: adminOrg } = await admin
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", callerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!adminOrg?.org_id) {
      console.warn("approving admin has no org; approved user not added to a workspace");
      return json({ ok: true, action, warning: "admin_has_no_org" });
    }
    const { error: memberErr } = await admin
      .from("org_memberships")
      .upsert(
        { org_id: adminOrg.org_id, user_id: reqRow.user_id, role: "staff" },
        { onConflict: "org_id,user_id", ignoreDuplicates: true },
      );
    if (memberErr) {
      // Non-fatal: the user is unbanned and can sign in; an owner can still add
      // them via the Team page. Surface a soft warning to the admin UI.
      console.error("add member failed", memberErr);
      return json({ ok: true, action, warning: "approved_but_not_added_to_org" });
    }
    return json({ ok: true, action });
  }

  if (action === "deny" || action === "revoke") {
    // Delete the auth user (cascades to profile + any owned data).
    if (reqRow.user_id) {
      const { error: delErr } = await admin.auth.admin.deleteUser(reqRow.user_id);
      if (delErr && !/not found/i.test(delErr.message ?? "")) {
        console.error("delete user failed", delErr);
        return json({ error: "Could not delete user", detail: delErr.message }, 500);
      }
    }
    const reason =
      action === "revoke"
        ? denial_reason?.slice(0, 500) ?? "Access revoked"
        : denial_reason?.slice(0, 500) ?? null;
    const { error } = await admin
      .from("access_requests").update({
        status: "denied",
        denial_reason: reason,
        decided_at: new Date().toISOString(),
        decided_by: callerId,
        user_id: null,
      }).eq("id", request_id);
    if (error) return json({ error: "Could not update request" }, 500);
    return json({ ok: true, action });
  }

  return json({ error: "Unknown action" }, 400);
});
