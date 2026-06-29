import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * USPS delivery tracker. Etsy never reports carrier delivery, so orders land as
 * "shipped" (in transit) and sit there until USPS confirms delivery. pg_cron
 * hits this every few hours. Each run:
 *   1. mints a USPS OAuth token (client_credentials),
 *   2. pulls in-transit shipments that carry a USPS tracking number,
 *   3. asks USPS for each one's status, and
 *   4. when USPS says "Delivered", stamps the shipment delivered — the
 *      shipments_status_sync DB trigger then flips the parent order to delivered.
 *
 * Modes (query params):
 *   ?inspect=<trackingNumber>  Dry run: return USPS's raw JSON for one number,
 *                              no writes. Use this first to confirm field names.
 *   ?reconcile=1               Re-evaluate ALL tracked shipments (incl. ones
 *                              already marked delivered) to correct historical
 *                              rows whose delivery was estimated, not confirmed.
 *
 * Gated by ?token=. No-ops gracefully until USPS credentials are present in
 * integration_config, so it is safe to schedule before the connection is armed.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const USPS_TOKEN_URL = "https://apis.usps.com/oauth2/v3/token";
const USPS_TRACKING_URL = "https://apis.usps.com/tracking/v3/tracking";

// Shipments processed per run, and spacing between USPS calls (~4 req/s) to stay
// well under rate limits. Sized so a full batch (incl. USPS latency) stays under
// the cron's 120s timeout; a backlog drains over consecutive runs.
const BATCH_LIMIT = 100;
const REQUEST_SPACING_MS = 250;

const CONFIG_KEYS = {
  token: "usps_sync_token",
  clientId: "usps_client_id",
  clientSecret: "usps_client_secret",
} as const;

type Admin = ReturnType<typeof createClient>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readConfig(admin: Admin, keys: string[]): Promise<Record<string, string>> {
  const { data } = await admin.from("integration_config").select("key, value").in("key", keys);
  const map: Record<string, string> = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return map;
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(USPS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`USPS token failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error("USPS token response missing access_token");
  return String(data.access_token);
}

interface TrackResult {
  found: boolean;
  delivered: boolean;
  deliveredAt: string | null;
  statusCategory: string;
  rawStatus: string;
}

/** Fetch one tracking number. Returns found=false on a 404 (USPS aged it out). */
async function trackOne(trackingNumber: string, token: string): Promise<{ result: TrackResult; raw: unknown }> {
  const url = `${USPS_TRACKING_URL}/${encodeURIComponent(trackingNumber)}?expand=DETAIL`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (res.status === 404) {
    return { result: { found: false, delivered: false, deliveredAt: null, statusCategory: "", rawStatus: "" }, raw: null };
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`USPS tracking failed (${res.status}): ${text}`);
  }
  const raw = await res.json();
  return { result: parseTracking(raw), raw };
}

/**
 * Parse USPS's tracking JSON defensively. The v3 payload reports a coarse
 * `statusCategory` ("Delivered" | "In Transit" | "Out for Delivery" | ...), a
 * detailed `status` string, a `deliveryDate`, and a `trackingEvents[]` history.
 * Field names are matched loosely so a minor schema shift doesn't break us.
 */
function parseTracking(raw: unknown): TrackResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const statusCategory = String(r.statusCategory ?? r.status_category ?? "");
  const rawStatus = String(r.status ?? "");
  const delivered = /deliver(ed)?/i.test(statusCategory) || /^delivered/i.test(rawStatus);

  let deliveredAt: string | null = null;
  if (delivered) {
    const events = (r.trackingEvents ?? r.tracking_events ?? r.events) as unknown;
    if (Array.isArray(events)) {
      // Events are newest-first in USPS responses; take the first delivery event.
      const ev = events.find((e) => {
        const o = (e ?? {}) as Record<string, unknown>;
        const type = String(o.eventType ?? o.event ?? o.eventCode ?? "");
        return /deliver/i.test(type);
      }) as Record<string, unknown> | undefined;
      const ts = ev && (ev.eventTimestamp ?? ev.eventTime ?? ev.gmtTimestamp ?? ev.date);
      if (ts) deliveredAt = toIso(String(ts));
    }
    if (!deliveredAt) {
      const dd = r.deliveryDate ?? r.delivery_date;
      if (dd) deliveredAt = toIso(String(dd));
    }
  }
  return { found: true, delivered, deliveredAt, statusCategory, rawStatus };
}

/** Best-effort parse of USPS date/timestamp strings to ISO; null if unusable. */
function toIso(value: string): string | null {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

interface ShipmentRow {
  id: string;
  order_id: string;
  status: string;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
}

/** Mark a shipment delivered. The DB trigger propagates the order to delivered. */
async function markDelivered(admin: Admin, s: ShipmentRow, deliveredAt: string): Promise<void> {
  await admin
    .from("shipments")
    .update({ status: "delivered", delivered_at: deliveredAt, shipped_at: s.shipped_at ?? deliveredAt })
    .eq("id", s.id);
}

/**
 * Downgrade a row that was estimated-delivered but USPS still shows in transit.
 * The trigger won't downgrade an order, so correct the order directly — but only
 * when it's currently 'delivered' (never stomp cancelled/refunded/manual states).
 */
async function downgradeToInTransit(admin: Admin, s: ShipmentRow): Promise<void> {
  await admin.from("shipments").update({ status: "shipped", delivered_at: null }).eq("id", s.id);
  await admin.from("orders").update({ status: "shipped" }).eq("id", s.order_id).eq("status", "delivered");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const cfg = await readConfig(admin, Object.values(CONFIG_KEYS));
  const provided = new URL(req.url).searchParams.get("token") ?? "";
  const expected = cfg[CONFIG_KEYS.token] ?? "";
  if (!expected || !timingSafeEqual(provided, expected)) return json({ error: "Unauthorized" }, 401);

  const clientId = cfg[CONFIG_KEYS.clientId] ?? "";
  const clientSecret = cfg[CONFIG_KEYS.clientSecret] ?? "";
  if (!clientId || !clientSecret) return json({ ok: true, skipped: "usps not configured" });

  let token: string;
  try {
    token = await getAccessToken(clientId, clientSecret);
  } catch (err) {
    console.error("usps auth failed", err);
    return json({ error: "USPS authentication failed", detail: err instanceof Error ? err.message : String(err) }, 502);
  }

  // Dry run: return USPS's raw payload for one tracking number. No writes. Use
  // this to confirm field names against live data before trusting the parser.
  const params = new URL(req.url).searchParams;
  const inspect = params.get("inspect");
  if (inspect) {
    try {
      const { result, raw } = await trackOne(inspect, token);
      return json({ ok: true, mode: "inspect", trackingNumber: inspect, parsed: result, raw });
    } catch (err) {
      return json({ error: "USPS inspect failed", detail: err instanceof Error ? err.message : String(err) }, 502);
    }
  }

  const reconcile = params.get("reconcile") === "1";

  // Default: in-transit shipments awaiting delivery confirmation. Reconcile:
  // every tracked shipment (incl. estimated-delivered) so historical rows get
  // corrected to their true USPS state.
  let query = admin
    .from("shipments")
    .select("id, order_id, status, tracking_number, shipped_at, delivered_at")
    .not("tracking_number", "is", null)
    // Reconcile newest-first: recent shipments are the ones most likely
    // falsely-delivered, and old numbers USPS has aged out 404 anyway. Default
    // (in-transit) drains oldest-first.
    .order("created_at", { ascending: !reconcile })
    .limit(BATCH_LIMIT);
  query = reconcile
    ? query.not("status", "in", "(cancelled,refunded)")
    : query.is("delivered_at", null).in("status", ["pending", "ready", "held", "shipped"]);

  const { data: shipments, error } = await query;
  if (error) {
    console.error("shipments query failed", error);
    return json({ error: "Could not load shipments" }, 500);
  }

  let checked = 0, delivered = 0, downgraded = 0, notFound = 0, failed = 0;
  for (const s of (shipments ?? []) as ShipmentRow[]) {
    if (!s.tracking_number) continue;
    try {
      const { result } = await trackOne(s.tracking_number, token);
      checked++;
      if (!result.found) { notFound++; continue; }
      if (result.delivered) {
        if (s.status !== "delivered" || !s.delivered_at) {
          await markDelivered(admin, s, result.deliveredAt ?? new Date().toISOString());
          delivered++;
        }
      } else if (reconcile && s.status === "delivered") {
        // Estimated-delivered, but USPS says still moving — correct it.
        await downgradeToInTransit(admin, s);
        downgraded++;
      }
    } catch (err) {
      failed++;
      console.error(`track ${s.tracking_number} failed`, err);
    }
    await sleep(REQUEST_SPACING_MS);
  }

  return json({
    ok: true,
    mode: reconcile ? "reconcile" : "in-transit",
    batch: (shipments ?? []).length,
    checked,
    delivered,
    downgraded,
    not_found: notFound,
    failed,
    note: (shipments ?? []).length === BATCH_LIMIT ? "hit batch cap; more will drain next run" : undefined,
  });
});
