import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { importNormalizedOrder, NormalizedOrder } from "../_shared/import-order.ts";

/**
 * Shopify order-sync webhook (orders/create).
 *
 * Deployed with verify_jwt = FALSE. Requests are authenticated by EITHER:
 *   1. Shopify HMAC  (X-Shopify-Hmac-Sha256 vs SHOPIFY_WEBHOOK_SECRET), or
 *   2. a shared URL token (?token=...) matched against the server-side
 *      integration_config row 'shopify_webhook_token'.
 *
 * The token path lets the connection be armed end-to-end via the Admin API
 * without hand-copying the HMAC secret out of the Shopify admin. HMAC is
 * preferred whenever SHOPIFY_WEBHOOK_SECRET is configured.
 *
 * The payload is normalized and handed to the shared importNormalizedOrder()
 * (see _shared/import-order.ts) — the same path the Etsy poller uses — which
 * dedupes by external_id, upserts the customer, inserts the order + items
 * (channel "shopify"), and opens a pending shipment so the weather sweep and
 * fulfillment triggers cover synced orders exactly like manual ones.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyHmac(rawBody: string, signature: string): Promise<boolean> {
  if (!WEBHOOK_SECRET || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const digest = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(digest, signature);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  const url = new URL(req.url);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Authenticate: Shopify HMAC first, then the shared URL token fallback.
  const signature = req.headers.get("x-shopify-hmac-sha256") ?? "";
  let authed = await verifyHmac(rawBody, signature);
  if (!authed) {
    const provided = url.searchParams.get("token") ?? "";
    if (provided) {
      const { data: cfg } = await admin
        .from("integration_config").select("value").eq("key", "shopify_webhook_token").maybeSingle();
      const expected = cfg?.value ?? "";
      authed = expected.length > 0 && timingSafeEqual(provided, expected);
    }
  }
  if (!authed) return json({ error: "Unauthorized" }, 401);

  const topic = req.headers.get("x-shopify-topic") ?? "";
  if (topic && topic !== "orders/create") {
    return json({ ok: true, skipped: topic }); // ack other topics without action
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!payload?.id || !Array.isArray(payload.line_items)) {
    return json({ error: "Unexpected payload shape" }, 400);
  }

  // Normalize the Shopify payload, then hand it to the shared importer.
  const subtotal = Number(payload.subtotal_price ?? 0);
  const tax = Number(payload.total_tax ?? 0);
  const shipping = (payload.shipping_lines ?? []).reduce(
    (s: number, l: any) => s + Number(l?.price ?? 0), 0);
  const total = Number(payload.total_price ?? subtotal + tax + shipping);
  const email = (payload.email ?? payload.customer?.email ?? "").trim().toLowerCase();
  const addr = payload.shipping_address;

  const normalized: NormalizedOrder = {
    externalId: `shopify:${payload.id}`,
    channel: "shopify",
    email: email || null,
    customerName: [payload.customer?.first_name, payload.customer?.last_name]
      .filter(Boolean).join(" ") || email || "Shopify customer",
    customerExternalId: payload.customer?.id ? String(payload.customer.id) : null,
    subtotal,
    shipping,
    tax,
    total,
    notes: payload.note ?? null,
    placedAt: payload.created_at ?? new Date().toISOString(),
    items: payload.line_items.map((li: any) => ({
      name: String(li.title ?? li.name ?? "Item"),
      qty: Number(li.quantity ?? 1),
      price: Number(li.price ?? 0),
    })),
    shipToZip: addr?.zip ? String(addr.zip) : null,
    shipToState: addr?.province_code ? String(addr.province_code) : null,
    orderLabel: `#${payload.order_number ?? payload.id}`,
  };

  const result = await importNormalizedOrder(admin, normalized);
  if (!result.ok) return json({ error: result.error ?? "Import failed" }, 500);
  if (result.duplicate) return json({ ok: true, duplicate: true });
  return json({ ok: true, order_id: result.orderId });
});
