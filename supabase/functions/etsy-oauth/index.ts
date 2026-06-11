import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Etsy OAuth 2.0 + PKCE bootstrap (one-time, to obtain a refresh token).
 *
 * Etsy's Open API v3 requires OAuth with PKCE for every app, so we cannot just
 * paste a long-lived key — a human has to authorize once. This function is the
 * redirect target registered in the Etsy app's callback URLs and serves both
 * legs of the dance:
 *
 *   1. GET ?token=<etsy_sync_token>   → generate PKCE pair, stash the verifier
 *                                        in integration_config, 302 to Etsy.
 *   2. GET ?code=...&state=...         → Etsy's callback; exchange code+verifier
 *                                        for tokens, persist etsy_refresh_token
 *                                        (+ best-effort etsy_shop_id), done.
 *
 * Prereq: integration_config must already hold 'etsy_keystring' (the app's API
 * key) and 'etsy_sync_token'. Deployed with verify_jwt = FALSE.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ETSY_CONNECT_URL = "https://www.etsy.com/oauth/connect";
const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const ETSY_ME_URL = "https://openapi.etsy.com/v3/application/users/me";
// transactions_r → receipts/line items; email_r → buyer email; address_r →
// shipping address; listings_r → product mirror (future). Space-separated.
const SCOPES = "transactions_r email_r address_r listings_r";

// The public callback URL. Hardcoded (not derived from req.url) because the
// Supabase gateway rewrites the inbound URL internally — it strips the
// /functions/v1 prefix and uses http, which would build a redirect_uri Etsy
// rejects. This exact value must also be registered in the Etsy app.
const REDIRECT_URI = "https://jagcnaxdxiummknyrxhj.supabase.co/functions/v1/etsy-oauth";

const CONFIG_KEYS = {
  token: "etsy_sync_token",
  keystring: "etsy_keystring",
  refresh: "etsy_refresh_token",
  shopId: "etsy_shop_id",
  verifier: "etsy_oauth_verifier",
  state: "etsy_oauth_state",
} as const;

function html(body: string, status = 200): Response {
  return new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;max-width:34rem;margin:4rem auto;line-height:1.5">${body}</body>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

type Admin = ReturnType<typeof createClient>;

async function readConfig(admin: Admin, keys: string[]): Promise<Record<string, string>> {
  const { data } = await admin
    .from("integration_config").select("key, value").in("key", keys);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return map;
}

async function writeConfig(admin: Admin, key: string, value: string): Promise<void> {
  await admin.from("integration_config")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

async function startAuthorization(admin: Admin, url: URL): Promise<Response> {
  const cfg = await readConfig(admin, [CONFIG_KEYS.token, CONFIG_KEYS.keystring]);
  const expected = cfg[CONFIG_KEYS.token] ?? "";
  const provided = url.searchParams.get("token") ?? "";
  if (!expected || provided !== expected) {
    return html("<h2>Unauthorized</h2><p>Append <code>?token=&lt;etsy_sync_token&gt;</code> to start the Etsy connection.</p>", 401);
  }
  const keystring = cfg[CONFIG_KEYS.keystring] ?? "";
  if (!keystring) {
    return html("<h2>Not configured</h2><p>Set <code>etsy_keystring</code> in integration_config first.</p>", 400);
  }

  const verifier = randomToken(32);
  const state = randomToken(16);
  await writeConfig(admin, CONFIG_KEYS.verifier, verifier);
  await writeConfig(admin, CONFIG_KEYS.state, state);

  const authorize = new URL(ETSY_CONNECT_URL);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", keystring);
  authorize.searchParams.set("redirect_uri", REDIRECT_URI);
  authorize.searchParams.set("scope", SCOPES);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", await pkceChallenge(verifier));
  authorize.searchParams.set("code_challenge_method", "S256");

  return new Response(null, { status: 302, headers: { Location: authorize.toString() } });
}

async function handleCallback(admin: Admin, url: URL, code: string): Promise<Response> {
  const cfg = await readConfig(admin, [
    CONFIG_KEYS.keystring, CONFIG_KEYS.verifier, CONFIG_KEYS.state,
  ]);

  const returnedState = url.searchParams.get("state") ?? "";
  if (!cfg[CONFIG_KEYS.state] || returnedState !== cfg[CONFIG_KEYS.state]) {
    return html("<h2>State mismatch</h2><p>Restart the connection from the beginning.</p>", 400);
  }
  const keystring = cfg[CONFIG_KEYS.keystring] ?? "";
  const verifier = cfg[CONFIG_KEYS.verifier] ?? "";
  if (!keystring || !verifier) {
    return html("<h2>Session expired</h2><p>Restart the connection from the beginning.</p>", 400);
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: keystring,
    redirect_uri: REDIRECT_URI,
    code,
    code_verifier: verifier,
  });
  const res = await fetch(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("etsy token exchange failed", res.status, text);
    return html("<h2>Token exchange failed</h2><p>Check the Etsy app's redirect URI and keystring, then retry.</p>", 502);
  }
  const tokens = await res.json();
  const refreshToken = String(tokens.refresh_token ?? "");
  const accessToken = String(tokens.access_token ?? "");
  if (!refreshToken) {
    return html("<h2>No refresh token returned</h2><p>Retry the connection.</p>", 502);
  }

  await writeConfig(admin, CONFIG_KEYS.refresh, refreshToken);

  // Best-effort: resolve and store the shop id so etsy-sync is fully armed.
  let shopNote = "Set <code>etsy_shop_id</code> manually to finish.";
  try {
    const me = await fetch(ETSY_ME_URL, {
      headers: { "x-api-key": keystring, Authorization: `Bearer ${accessToken}` },
    });
    if (me.ok) {
      const data = await me.json();
      if (data?.shop_id) {
        await writeConfig(admin, CONFIG_KEYS.shopId, String(data.shop_id));
        shopNote = `Shop id <code>${data.shop_id}</code> stored.`;
      }
    }
  } catch (err) {
    console.error("etsy getMe failed", err);
  }

  // One-time secrets — clear them now that they've been consumed.
  await writeConfig(admin, CONFIG_KEYS.verifier, "");
  await writeConfig(admin, CONFIG_KEYS.state, "");

  return html(`<h2>Etsy connected ✅</h2><p>Refresh token stored. ${shopNote}</p><p>The poller will pick up orders on its next run.</p>`);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return html("<h2>Method not allowed</h2>", 405);
  const url = new URL(req.url);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const error = url.searchParams.get("error");
  if (error) {
    return html(`<h2>Authorization declined</h2><p>${error}</p>`, 400);
  }

  const code = url.searchParams.get("code");
  if (code) return handleCallback(admin, url, code);
  return startAuthorization(admin, url);
});
