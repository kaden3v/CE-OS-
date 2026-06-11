import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { importNormalizedOrder, NormalizedOrder } from "../_shared/import-order.ts";

/**
 * Etsy sync poller (Open API v3). Etsy has NO order webhooks, so this is a PULL:
 * pg_cron hits this every ~10 min. Each run:
 *   1. refreshes the OAuth access token,
 *   2. self-heals the shop id (resolves + stores it if missing),
 *   3. imports receipts (orders) modified since the cursor — full history on the
 *      first run (no cursor) — via the shared importNormalizedOrder(),
 *   4. imports the shop's listings (+ stock) into the listings table.
 *
 * AUTH NOTE: Etsy's API requires the x-api-key header to be "keystring:shared_secret"
 * (colon-joined) — the keystring alone is rejected with "Shared secret is required
 * in x-api-key header". The keystring alone is still the OAuth client_id (token refresh).
 *
 * Idempotent throughout (dedupe/upsert by external_id). Gated by ?token=.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ETSY_API = "https://openapi.etsy.com/v3/application";
const ETSY_TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";

const PAGE_LIMIT = 100;
const MAX_PAGES = 25;

const LISTING_STATUS: Record<string, string> = {
  active: "active",
  draft: "draft",
  sold_out: "sold-out",
  inactive: "archived",
  expired: "archived",
};
const LISTING_STATES = ["active", "draft", "sold_out"];

const CONFIG_KEYS = {
  token: "etsy_sync_token",
  keystring: "etsy_keystring",
  sharedSecret: "etsy_shared_secret",
  refresh: "etsy_refresh_token",
  shopId: "etsy_shop_id",
  cursor: "etsy_last_synced_at",
} as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface EtsyMoney {
  amount?: number;
  divisor?: number;
}

function money(m: EtsyMoney | null | undefined): number {
  if (!m || typeof m.amount !== "number" || !m.divisor) return 0;
  return m.amount / m.divisor;
}

/**
 * Etsy HTML-encodes text fields (titles, names, messages) — e.g. ' arrives
 * as "&#39;". Decode entities before storing so the app shows real text.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

type Admin = ReturnType<typeof createClient>;
type ConfigMap = Record<string, string>;

async function readConfig(admin: Admin, keys: string[]): Promise<ConfigMap> {
  const { data } = await admin.from("integration_config").select("key, value").in("key", keys);
  const map: ConfigMap = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return map;
}

async function writeConfig(admin: Admin, key: string, value: string): Promise<void> {
  await admin.from("integration_config").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

async function refreshAccessToken(keystring: string, refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: keystring, refresh_token: refreshToken });
  const res = await fetch(ETSY_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy token refresh failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return { accessToken: String(data.access_token), refreshToken: String(data.refresh_token ?? refreshToken) };
}

/** apiKey is the composed "keystring:shared_secret" value Etsy's API requires. */
function etsyHeaders(apiKey: string, accessToken: string): HeadersInit {
  return { "x-api-key": apiKey, Authorization: `Bearer ${accessToken}` };
}

/**
 * Resolve the numeric shop id from the token. The user id is the prefix of the
 * access token ("{user_id}.{secret}"), so we call getShopByOwnerUserId directly
 * and skip getMe — getMe needs the shops_r scope, which we don't request.
 */
async function resolveShopId(apiKey: string, accessToken: string): Promise<string | null> {
  const userId = accessToken.split(".")[0];
  if (!userId) return null;
  const shopRes = await fetch(`${ETSY_API}/users/${userId}/shops`, { headers: etsyHeaders(apiKey, accessToken) });
  if (!shopRes.ok) {
    console.error("etsy getShops failed", shopRes.status, await shopRes.text());
    return null;
  }
  const shop = await shopRes.json();
  const shopId = shop?.shop_id ?? shop?.results?.[0]?.shop_id;
  return shopId ? String(shopId) : null;
}

interface EtsyReceipt {
  receipt_id: number;
  name?: string;
  state?: string;
  zip?: string;
  buyer_email?: string;
  buyer_user_id?: number;
  status?: string;
  is_shipped?: boolean;
  created_timestamp?: number;
  updated_timestamp?: number;
  message_from_buyer?: string;
  subtotal?: EtsyMoney;
  total_tax_cost?: EtsyMoney;
  total_shipping_cost?: EtsyMoney;
  grandtotal?: EtsyMoney;
  total_price?: EtsyMoney;
  transactions?: { title?: string; quantity?: number; price?: EtsyMoney }[];
  shipments?: { shipment_notification_timestamp?: number; carrier_name?: string; tracking_code?: string }[];
}

/**
 * Map Etsy's receipt state to a CEOS order status. Etsy statuses: paid,
 * completed, open, payment processing, canceled, fully refunded, partially
 * refunded — plus the is_shipped flag for in-transit orders.
 */
function mapReceiptStatus(receipt: EtsyReceipt): "pending" | "shipped" | "delivered" | "cancelled" | "refunded" {
  const s = (receipt.status ?? "").toLowerCase();
  if (s === "canceled" || s === "cancelled") return "cancelled";
  if (s === "fully refunded") return "refunded";
  if (s === "completed") return "delivered";
  if (receipt.is_shipped) return "shipped";
  return "pending";
}

/** Earliest ship-notification timestamp on the receipt, as ISO (or null). */
function receiptShippedAt(receipt: EtsyReceipt): string | null {
  const stamps = (receipt.shipments ?? [])
    .map((s) => Number(s?.shipment_notification_timestamp ?? 0))
    .filter((t) => t > 0);
  if (stamps.length === 0) return null;
  return new Date(Math.min(...stamps) * 1000).toISOString();
}

/** First carrier + tracking code on the receipt's shipments (or nulls). */
function receiptTracking(receipt: EtsyReceipt): { trackingNumber: string | null; carrier: string | null } {
  const withCode = (receipt.shipments ?? []).find((s) => (s?.tracking_code ?? "").trim().length > 0);
  if (!withCode) return { trackingNumber: null, carrier: null };
  return {
    trackingNumber: String(withCode.tracking_code).trim(),
    carrier: withCode.carrier_name ? String(withCode.carrier_name).trim() : null,
  };
}

async function fetchReceiptsPage(shopId: string, apiKey: string, accessToken: string, minLastModified: number, offset: number): Promise<EtsyReceipt[]> {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: String(offset), was_paid: "true" });
  if (minLastModified > 0) params.set("min_last_modified", String(minLastModified));
  const res = await fetch(`${ETSY_API}/shops/${shopId}/receipts?${params}`, { headers: etsyHeaders(apiKey, accessToken) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy receipts fetch failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

function toNormalized(receipt: EtsyReceipt): NormalizedOrder {
  const items = (receipt.transactions ?? []).map((t) => ({ name: decodeEntities(String(t.title ?? "Item")), qty: Number(t.quantity ?? 1), price: money(t.price) }));
  const email = (receipt.buyer_email ?? "").trim().toLowerCase() || null;
  const customerName = decodeEntities(receipt.name?.trim() || "") || email || "Etsy buyer";
  const placedAt = receipt.created_timestamp ? new Date(receipt.created_timestamp * 1000).toISOString() : new Date().toISOString();
  return {
    externalId: `etsy:${receipt.receipt_id}`,
    channel: "etsy",
    email,
    customerName,
    customerEtsyId: receipt.buyer_user_id ? String(receipt.buyer_user_id) : null,
    subtotal: money(receipt.subtotal),
    shipping: money(receipt.total_shipping_cost),
    tax: money(receipt.total_tax_cost),
    total: money(receipt.grandtotal ?? receipt.total_price),
    notes: receipt.message_from_buyer ? decodeEntities(receipt.message_from_buyer) : null,
    placedAt,
    items,
    shipToZip: receipt.zip ? String(receipt.zip) : null,
    shipToState: receipt.state ? String(receipt.state) : null,
    orderLabel: `#${receipt.receipt_id}`,
    status: mapReceiptStatus(receipt),
    shippedAt: receiptShippedAt(receipt),
    deliveredAt: null, // Etsy doesn't report delivery; importer estimates from shippedAt
    ...receiptTracking(receipt),
  };
}

interface OrgOwner {
  orgId: string;
  userId: string;
}

async function getOrgOwner(admin: Admin): Promise<OrgOwner | null> {
  const { data: org } = await admin.from("organizations").select("id").order("created_at").limit(1).maybeSingle();
  if (!org) return null;
  const { data: owner } = await admin.from("org_memberships").select("user_id").eq("org_id", org.id).eq("role", "owner").limit(1).maybeSingle();
  if (!owner) return null;
  return { orgId: org.id, userId: owner.user_id };
}

interface EtsyListing {
  listing_id: number;
  title?: string;
  state?: string;
  url?: string;
  quantity?: number;
  price?: EtsyMoney;
}

async function upsertListing(admin: Admin, oo: OrgOwner, l: EtsyListing): Promise<void> {
  const externalId = `etsy:${l.listing_id}`;
  const fields = {
    org_id: oo.orgId,
    user_id: oo.userId,
    external_id: externalId,
    channel: "etsy",
    title: decodeEntities(String(l.title ?? "Untitled listing")),
    price: money(l.price),
    stock: Number(l.quantity ?? 0),
    status: LISTING_STATUS[l.state ?? ""] ?? "archived",
    url: l.url ?? null,
    last_synced_at: new Date().toISOString(),
  };
  const { data: existing } = await admin.from("listings").select("id").eq("external_id", externalId).maybeSingle();
  if (existing) {
    await admin.from("listings").update(fields).eq("id", existing.id);
  } else {
    await admin.from("listings").insert(fields);
  }
}

async function importListings(admin: Admin, oo: OrgOwner, shopId: string, apiKey: string, accessToken: string): Promise<number> {
  let count = 0;
  for (const state of LISTING_STATES) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ state, limit: String(PAGE_LIMIT), offset: String(page * PAGE_LIMIT) });
      const res = await fetch(`${ETSY_API}/shops/${shopId}/listings?${params}`, { headers: etsyHeaders(apiKey, accessToken) });
      if (!res.ok) {
        console.error("etsy listings fetch failed", state, res.status, await res.text());
        break;
      }
      const data = await res.json();
      const listings: EtsyListing[] = Array.isArray(data.results) ? data.results : [];
      if (listings.length === 0) break;
      for (const l of listings) {
        await upsertListing(admin, oo, l);
        count++;
      }
      if (listings.length < PAGE_LIMIT) break;
    }
  }
  return count;
}

async function importReceipts(admin: Admin, shopId: string, apiKey: string, accessToken: string, sinceCursor: number, baseCursor: number): Promise<{ imported: number; duplicates: number; updated: number; maxModified: number }> {
  let imported = 0;
  let duplicates = 0;
  let updated = 0;
  let maxModified = baseCursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const receipts = await fetchReceiptsPage(shopId, apiKey, accessToken, sinceCursor, page * PAGE_LIMIT);
    if (receipts.length === 0) break;
    for (const receipt of receipts) {
      const result = await importNormalizedOrder(admin, toNormalized(receipt));
      if (result.duplicate) {
        duplicates++;
        if (result.updated) updated++;
      } else if (result.ok) imported++;
      const modified = receipt.updated_timestamp ?? receipt.created_timestamp ?? 0;
      if (modified > maxModified) maxModified = modified;
    }
    if (receipts.length < PAGE_LIMIT) break;
  }
  return { imported, duplicates, updated, maxModified };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const cfg = await readConfig(admin, Object.values(CONFIG_KEYS));
  const provided = new URL(req.url).searchParams.get("token") ?? "";
  const expected = cfg[CONFIG_KEYS.token] ?? "";
  if (!expected || !timingSafeEqual(provided, expected)) return json({ error: "Unauthorized" }, 401);

  const keystring = cfg[CONFIG_KEYS.keystring] ?? "";
  const sharedSecret = cfg[CONFIG_KEYS.sharedSecret] ?? "";
  const refreshToken = cfg[CONFIG_KEYS.refresh] ?? "";
  if (!keystring || !sharedSecret || !refreshToken) return json({ ok: true, skipped: "etsy not configured" });

  // Etsy API requires "keystring:shared_secret" in x-api-key; the keystring alone is the OAuth client_id.
  const apiKey = `${keystring}:${sharedSecret}`;

  let accessToken: string;
  try {
    const refreshed = await refreshAccessToken(keystring, refreshToken);
    accessToken = refreshed.accessToken;
    if (refreshed.refreshToken !== refreshToken) await writeConfig(admin, CONFIG_KEYS.refresh, refreshed.refreshToken);
  } catch (err) {
    console.error("etsy auth failed", err);
    return json({ error: "Etsy authentication failed" }, 502);
  }

  // Self-heal the shop id if it wasn't captured during OAuth.
  let shopId = cfg[CONFIG_KEYS.shopId] ?? "";
  if (!shopId) {
    const resolved = await resolveShopId(apiKey, accessToken);
    if (!resolved) return json({ error: "Could not resolve Etsy shop id" }, 502);
    shopId = resolved;
    await writeConfig(admin, CONFIG_KEYS.shopId, shopId);
  }

  const oo = await getOrgOwner(admin);
  if (!oo) return json({ error: "No organization/owner configured" }, 500);

  const storedCursor = Number(cfg[CONFIG_KEYS.cursor] ?? 0);
  // ?full=1 ignores the cursor for a complete re-scan — used to reconcile
  // statuses/customers across the whole history. Safe: the importer is idempotent.
  const fullScan = new URL(req.url).searchParams.get("full") === "1";
  const sinceCursor = fullScan ? 0 : storedCursor;

  let receiptResult = { imported: 0, duplicates: 0, updated: 0, maxModified: storedCursor };
  let listingsCount = 0;
  try {
    receiptResult = await importReceipts(admin, shopId, apiKey, accessToken, sinceCursor, storedCursor);
  } catch (err) {
    console.error("etsy receipts sync failed", err);
  }
  // Listings are independent — a failure here must not block order import.
  try {
    listingsCount = await importListings(admin, oo, shopId, apiKey, accessToken);
  } catch (err) {
    console.error("etsy listings sync failed", err);
  }

  if (receiptResult.maxModified > storedCursor) {
    await writeConfig(admin, CONFIG_KEYS.cursor, String(receiptResult.maxModified));
  }

  return json({
    ok: true,
    shop_id: shopId,
    orders_imported: receiptResult.imported,
    orders_duplicate: receiptResult.duplicates,
    orders_updated: receiptResult.updated,
    listings_synced: listingsCount,
    cursor: receiptResult.maxModified,
  });
});
