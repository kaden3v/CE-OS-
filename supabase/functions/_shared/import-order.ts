import { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Shared order-import logic for channel sync (Shopify webhook, Etsy poller, ...).
 *
 * Callers normalize their channel-specific payload into a NormalizedOrder, then
 * hand it here. Keeps the upsert dance (dedupe → org/owner → customer → order →
 * items → shipment → activity log) in one place so the channels never drift.
 *
 * Lifecycle, not just creation: when an order already exists, its status is
 * upgraded to match the channel (pending → shipped/delivered/cancelled/refunded)
 * so historical imports and later fulfillment land correctly. Manual statuses
 * are respected — only pending/processing/packed (or shipped → delivered) are
 * upgraded, never downgraded.
 *
 * Inventory safety: consume_inventory_for_order skips items whose inventory_id
 * and cultivar_id are both null (all channel-imported items), so status
 * transitions here never double-decrement stock.
 */

export type Channel = "shopify" | "etsy";

export type OrderStatus = "pending" | "shipped" | "delivered" | "cancelled" | "refunded";

export interface NormalizedItem {
  name: string;
  qty: number;
  price: number;
}

export interface NormalizedOrder {
  /** Stable cross-channel id, e.g. "shopify:123" or "etsy:456". Used for dedupe. */
  externalId: string;
  channel: Channel;
  email: string | null;
  customerName: string;
  /** Shopify customer id → customers.shopify_id. */
  customerExternalId?: string | null;
  /** Etsy buyer_user_id → customers.etsy_handle (stable dedupe key; Etsy omits buyer_email). */
  customerEtsyId?: string | null;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  notes: string | null;
  placedAt: string;
  items: NormalizedItem[];
  shipToZip: string | null;
  shipToState: string | null;
  orderLabel: string;
  /** Real channel fulfillment state; defaults to "pending" for create-only webhooks. */
  status?: OrderStatus;
  /** Historical fulfillment timestamps (ISO) when the channel provides them. */
  shippedAt?: string | null;
  deliveredAt?: string | null;
  /** Carrier tracking, when the channel provides it (e.g. Etsy receipt shipments). */
  trackingNumber?: string | null;
  carrier?: string | null;
}

export interface ImportResult {
  ok: boolean;
  duplicate?: boolean;
  updated?: boolean;
  orderId?: string;
  error?: string;
}

const CHANNEL_LABEL: Record<Channel, string> = {
  shopify: "Shopify",
  etsy: "Etsy",
};

/** Statuses safe to overwrite from channel data — never stomp manual progress. */
const UPGRADABLE_STATUSES = ["pending", "processing", "packed"];

type Admin = SupabaseClient;

interface OrgOwner {
  orgId: string;
  userId: string;
}

async function getOrgOwner(admin: Admin): Promise<OrgOwner | null> {
  const { data: org } = await admin
    .from("organizations").select("id").order("created_at").limit(1).maybeSingle();
  if (!org) return null;
  const { data: owner } = await admin
    .from("org_memberships").select("user_id").eq("org_id", org.id).eq("role", "owner").limit(1).maybeSingle();
  if (!owner) return null;
  return { orgId: org.id, userId: owner.user_id };
}

/**
 * Find-or-create the customer for an order. Dedupe priority: Etsy buyer id
 * (etsy_handle) → email → create new. Backfills the etsy_handle/email keys on
 * matches so future lookups get cheaper and dupes stop accumulating.
 */
async function resolveCustomer(admin: Admin, oo: OrgOwner, order: NormalizedOrder): Promise<string | null> {
  const email = (order.email ?? "").trim().toLowerCase();
  const etsyKey = order.customerEtsyId ? String(order.customerEtsyId) : null;

  if (etsyKey) {
    const { data: byKey } = await admin
      .from("customers").select("id").eq("org_id", oo.orgId).eq("etsy_handle", etsyKey).maybeSingle();
    if (byKey) return byKey.id;
  }
  if (email) {
    const { data: byEmail } = await admin
      .from("customers").select("id, etsy_handle").eq("org_id", oo.orgId).eq("email", email).maybeSingle();
    if (byEmail) {
      if (etsyKey && !byEmail.etsy_handle) {
        await admin.from("customers").update({ etsy_handle: etsyKey }).eq("id", byEmail.id);
      }
      return byEmail.id;
    }
  }

  const { data: created, error: custErr } = await admin
    .from("customers")
    .insert({
      org_id: oo.orgId,
      user_id: oo.userId,
      name: order.customerName,
      email: email || null,
      shopify_id: order.customerExternalId ?? null,
      etsy_handle: etsyKey,
    })
    .select("id").single();
  if (custErr) console.error("customer insert failed", custErr);
  return created?.id ?? null;
}

/**
 * Reconcile an already-imported order with the channel's current state:
 * re-point it at the canonical (deduped) customer and upgrade its status with
 * historical timestamps. Shipment updates cascade to the order via the
 * on_shipment_status_change trigger.
 */
async function updateExistingOrder(admin: Admin, orderId: string, order: NormalizedOrder): Promise<ImportResult> {
  const { data: row } = await admin
    .from("orders").select("id, status, customer_id, org_id, user_id").eq("id", orderId).maybeSingle();
  if (!row) return { ok: true, duplicate: true, orderId };

  let updated = false;

  // Tracking backfill — independent of status: stamp carrier/tracking onto any
  // of the order's shipments that don't have a tracking number yet.
  if (order.trackingNumber) {
    const { data: untracked } = await admin
      .from("shipments").select("id").eq("order_id", orderId).is("tracking_number", null);
    if (untracked && untracked.length > 0) {
      await admin.from("shipments")
        .update({ tracking_number: order.trackingNumber, carrier: order.carrier ?? "USPS" })
        .eq("order_id", orderId).is("tracking_number", null);
      updated = true;
    }
  }

  // Customer reconciliation (Etsy): adopt or become the canonical buyer record.
  if (order.customerEtsyId) {
    const etsyKey = String(order.customerEtsyId);
    const { data: canonical } = await admin
      .from("customers").select("id").eq("org_id", row.org_id).eq("etsy_handle", etsyKey).maybeSingle();
    if (canonical && canonical.id !== row.customer_id) {
      await admin.from("orders").update({ customer_id: canonical.id }).eq("id", orderId);
      updated = true;
    } else if (!canonical && row.customer_id) {
      // First receipt seen for this buyer: stamp the key on the order's customer.
      await admin.from("customers")
        .update({ etsy_handle: etsyKey, ...(order.email ? { email: order.email } : {}) })
        .eq("id", row.customer_id);
    }
  }

  const target = order.status ?? "pending";
  const canUpgrade =
    row.status !== target &&
    (UPGRADABLE_STATUSES.includes(row.status) || (row.status === "shipped" && target === "delivered"));

  if (canUpgrade) {
    if (target === "shipped" || target === "delivered") {
      // Set historical timestamps on the shipment first so the cascade's
      // coalesce(now()) never stamps today's date on months-old orders.
      const shippedAt = order.shippedAt ?? order.placedAt;
      const fields: Record<string, unknown> =
        target === "delivered"
          ? { status: "delivered", shipped_at: shippedAt, delivered_at: order.deliveredAt ?? shippedAt }
          : { status: "shipped", shipped_at: shippedAt };
      const { data: ships } = await admin.from("shipments").select("id").eq("order_id", orderId);
      if (ships && ships.length > 0) {
        await admin.from("shipments").update(fields).eq("order_id", orderId);
      }
      // Cascade usually handles this; direct update covers shipment-less orders.
      await admin.from("orders").update({ status: target }).eq("id", orderId);
    } else if (target === "cancelled" || target === "refunded") {
      await admin.from("orders").update({ status: target }).eq("id", orderId);
      // The synthetic open shipment will never ship — remove it from the queue.
      await admin.from("shipments").delete().eq("order_id", orderId).in("status", ["pending", "ready", "held"]);
    }
    updated = true;
  }

  return { ok: true, duplicate: true, updated, orderId };
}

/**
 * Import a single normalized order. Idempotent by externalId — re-running
 * reconciles status/customer instead of duplicating.
 */
export async function importNormalizedOrder(admin: Admin, order: NormalizedOrder): Promise<ImportResult> {
  const { data: existing } = await admin
    .from("orders").select("id").eq("external_id", order.externalId).maybeSingle();
  if (existing) return updateExistingOrder(admin, existing.id, order);

  const oo = await getOrgOwner(admin);
  if (!oo) return { ok: false, error: "No organization/owner configured" };

  const customerId = await resolveCustomer(admin, oo, order);
  const status = order.status ?? "pending";

  const { data: row, error: orderErr } = await admin
    .from("orders")
    .insert({
      org_id: oo.orgId,
      user_id: oo.userId,
      customer_id: customerId,
      external_id: order.externalId,
      channel: order.channel,
      status,
      subtotal: order.subtotal,
      shipping: order.shipping,
      tax: order.tax,
      total: order.total,
      notes: order.notes,
      placed_at: order.placedAt,
    })
    .select("id").single();
  if (orderErr || !row) {
    console.error("order insert failed", orderErr);
    return { ok: false, error: "Order insert failed" };
  }

  const items = order.items.map((li) => ({
    org_id: oo.orgId,
    user_id: oo.userId,
    order_id: row.id,
    cultivar_id: null,
    inventory_id: null,
    name_snapshot: li.name,
    qty: li.qty,
    price: li.price,
  }));
  const { error: itemsErr } = await admin.from("order_items").insert(items);
  if (itemsErr) console.error("items insert failed", itemsErr);

  // Open/record a shipment matching the order's real state. Cancelled/refunded
  // orders get none — there is nothing to fulfill.
  if (order.shipToZip && status !== "cancelled" && status !== "refunded") {
    const shippedAt = order.shippedAt ?? order.placedAt;
    const shipment: Record<string, unknown> = {
      org_id: oo.orgId,
      user_id: oo.userId,
      order_id: row.id,
      status: status === "pending" ? "pending" : status,
      ship_to_zip: order.shipToZip,
      ship_to_state: order.shipToState,
      tracking_number: order.trackingNumber ?? null,
      carrier: order.trackingNumber ? (order.carrier ?? "USPS") : null,
    };
    if (status === "shipped") shipment.shipped_at = shippedAt;
    if (status === "delivered") {
      shipment.shipped_at = shippedAt;
      shipment.delivered_at = order.deliveredAt ?? shippedAt;
    }
    const { error: shipErr } = await admin.from("shipments").insert(shipment);
    if (shipErr) console.error("shipment insert failed", shipErr);
  }

  const count = items.length;
  await admin.from("activity_log").insert({
    org_id: oo.orgId,
    actor_id: null,
    action: "created",
    entity: "orders",
    entity_id: row.id,
    summary: `${CHANNEL_LABEL[order.channel]} order ${order.orderLabel} synced (${count} item${count === 1 ? "" : "s"})`,
  });

  return { ok: true, orderId: row.id };
}
