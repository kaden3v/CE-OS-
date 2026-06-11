import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Shopify order-sync webhook (orders/create).
 *
 * Deploy with verify_jwt = FALSE (Shopify can't send a Supabase JWT); requests
 * are authenticated instead by Shopify's HMAC signature:
 *   X-Shopify-Hmac-Sha256 = base64(HMAC-SHA256(raw body, SHOPIFY_WEBHOOK_SECRET))
 *
 * Setup (when you're ready to go live):
 *   1. Shopify admin → Settings → Notifications → Webhooks → add
 *      "Order creation" pointing at this function's URL (JSON format).
 *   2. Copy the webhook signing secret shown there into the function env:
 *      supabase secrets set SHOPIFY_WEBHOOK_SECRET=...
 *   3. supabase functions deploy shopify-webhook --no-verify-jwt
 *
 * What it does per order: dedupes by external_id, upserts the customer by
 * email, inserts the order + line items (channel "shopify"), and opens a
 * pending shipment with the destination ZIP/state so the weather sweep and
 * the P1 fulfillment triggers cover synced orders exactly like manual ones.
 * (Inventory decrements when the order ships — same as every other order.)
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
  // Constant-time-ish comparison
  if (digest.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < digest.length; i++) diff |= digest.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();
  const signature = req.headers.get("x-shopify-hmac-sha256") ?? "";
  if (!(await verifyHmac(rawBody, signature))) {
    return json({ error: "Invalid signature" }, 401);
  }

  const topic = req.headers.get("x-shopify-topic") ?? "";
  if (topic !== "orders/create") {
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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const externalId = `shopify:${payload.id}`;

  // Idempotency — Shopify retries webhooks; never double-import.
  const { data: existing } = await admin
    .from("orders").select("id").eq("external_id", externalId).maybeSingle();
  if (existing) return json({ ok: true, duplicate: true });

  // Single-org deployment: attribute everything to the business org and its owner.
  const { data: org } = await admin
    .from("organizations").select("id").order("created_at").limit(1).maybeSingle();
  if (!org) return json({ error: "No organization configured" }, 500);
  const { data: owner } = await admin
    .from("org_memberships").select("user_id").eq("org_id", org.id).eq("role", "owner").limit(1).maybeSingle();
  if (!owner) return json({ error: "No org owner" }, 500);

  // Upsert customer by email.
  let customerId: string | null = null;
  const email = (payload.email ?? payload.customer?.email ?? "").trim().toLowerCase();
  const customerName = [payload.customer?.first_name, payload.customer?.last_name]
    .filter(Boolean).join(" ") || email || "Shopify customer";
  if (email) {
    const { data: found } = await admin
      .from("customers").select("id").eq("org_id", org.id).eq("email", email).maybeSingle();
    customerId = found?.id ?? null;
  }
  if (!customerId) {
    const { data: created, error: custErr } = await admin
      .from("customers")
      .insert({
        org_id: org.id,
        user_id: owner.user_id,
        name: customerName,
        email: email || null,
        shopify_id: payload.customer?.id ? String(payload.customer.id) : null,
      })
      .select("id").single();
    if (custErr) console.error("customer insert failed", custErr);
    customerId = created?.id ?? null;
  }

  const subtotal = Number(payload.subtotal_price ?? 0);
  const tax = Number(payload.total_tax ?? 0);
  const shipping = (payload.shipping_lines ?? []).reduce(
    (s: number, l: any) => s + Number(l?.price ?? 0), 0);
  const total = Number(payload.total_price ?? subtotal + tax + shipping);

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      org_id: org.id,
      user_id: owner.user_id,
      customer_id: customerId,
      external_id: externalId,
      channel: "shopify",
      status: "pending",
      subtotal,
      shipping,
      tax,
      total,
      notes: payload.note ?? null,
      placed_at: payload.created_at ?? new Date().toISOString(),
    })
    .select("id").single();
  if (orderErr || !order) {
    console.error("order insert failed", orderErr);
    return json({ error: "Order insert failed" }, 500);
  }

  const items = payload.line_items.map((li: any) => ({
    org_id: org.id,
    user_id: owner.user_id,
    order_id: order.id,
    cultivar_id: null,
    inventory_id: null,
    name_snapshot: String(li.title ?? li.name ?? "Item"),
    qty: Number(li.quantity ?? 1),
    price: Number(li.price ?? 0),
  }));
  const { error: itemsErr } = await admin.from("order_items").insert(items);
  if (itemsErr) console.error("items insert failed", itemsErr);

  // Open a shipment so the weather sweep + fulfillment pipeline cover it.
  const addr = payload.shipping_address;
  if (addr?.zip) {
    const { error: shipErr } = await admin.from("shipments").insert({
      org_id: org.id,
      user_id: owner.user_id,
      order_id: order.id,
      status: "pending",
      ship_to_zip: String(addr.zip),
      ship_to_state: addr.province_code ? String(addr.province_code) : null,
    });
    if (shipErr) console.error("shipment insert failed", shipErr);
  }

  await admin.from("activity_log").insert({
    org_id: org.id,
    actor_id: null,
    action: "created",
    entity: "orders",
    entity_id: order.id,
    summary: `Shopify order #${payload.order_number ?? payload.id} synced (${items.length} item${items.length === 1 ? "" : "s"})`,
  });

  return json({ ok: true, order_id: order.id });
});
