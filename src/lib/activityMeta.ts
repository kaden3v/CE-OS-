/**
 * Single source of truth for how activity_log rows are presented. Extracted from
 * Activity.tsx so the page, the detail modal, and per-record history all agree.
 */
import { PlusCircle, PencilLine, Trash2, UploadCloud, type LucideIcon } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { formatBusinessDate } from "@/lib/dates";

export interface ActionMeta {
  icon: LucideIcon;
  label: string;
  tone: string;
}

export const ACTION_META: Record<string, ActionMeta> = {
  created: { icon: PlusCircle, label: "added", tone: "text-status-ok" },
  updated: { icon: PencilLine, label: "updated", tone: "text-status-info" },
  deleted: { icon: Trash2, label: "removed", tone: "text-status-alert" },
  imported: { icon: UploadCloud, label: "imported", tone: "text-accent-brand" },
};

export function actionMeta(action: string): ActionMeta {
  return ACTION_META[action] ?? ACTION_META.updated;
}

export const ENTITY_LABELS: Record<string, string> = {
  cultivars: "a cultivar",
  customers: "a customer",
  expenses: "an expense",
  inventory: "an inventory item",
  licenses: "a license",
  listings: "a listing",
  mortality_events: "a mortality event",
  orders: "an order",
  plant_photos: "a photo",
  print_jobs: "a print job",
  propagation_batches: "a propagation batch",
  qr_codes: "a QR code",
  shipments: "a shipment",
  subscriptions: "a subscription",
  supplies: "a supply",
  tasks: "a task",
  vendors: "a vendor",
  recurring_expenses: "a recurring expense",
  mileage_log: "a mileage entry",
};

export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity.replace(/_/g, " ");
}

/** Allow-list of valid entity table names — guards the snapshot fetch against
 *  ever passing an arbitrary string to `.from()`. */
export const ACTIVITY_ENTITIES = new Set(Object.keys(ENTITY_LABELS));

/**
 * Which columns to surface in the detail snapshot, per entity. Unknown entities
 * (or missing columns) fall back to a generic pick. The snapshot renderer only
 * shows fields actually present on the fetched row, so a stale guess is harmless.
 */
export const SNAPSHOT_FIELDS: Record<string, string[]> = {
  orders: ["status", "channel", "total"],
  inventory: ["name", "common", "stock_mat", "stock_juv"],
  customers: ["name", "email", "phone"],
  cultivars: ["name", "common", "genus"],
  listings: ["title", "status", "price", "stock", "channel"],
  vendors: ["name", "category", "contact_name"],
  expenses: ["amount", "category", "vendor_name", "occurred_on"],
  supplies: ["name", "on_hand", "unit", "cost"],
  shipments: ["status", "carrier", "tracking_number"],
  tasks: ["title", "completed", "due"],
  recurring_expenses: ["name", "amount", "billing_cycle", "status"],
  mileage_log: ["trip_date", "miles", "purpose"],
};

const GENERIC_FALLBACK = ["name", "title", "status", "amount", "total", "quantity", "price", "email", "common"];

/** Ordered list of (key, value) pairs to show for a fetched snapshot row. */
export function snapshotFields(entity: string, row: Record<string, unknown>): Array<[string, unknown]> {
  const preferred = SNAPSHOT_FIELDS[entity] ?? GENERIC_FALLBACK;
  return preferred
    .filter((k) => k in row && row[k] !== null && row[k] !== "")
    .map((k) => [k, row[k]] as [string, unknown]);
}

const MONEY_FIELDS = new Set(["total", "subtotal", "amount", "price", "cost", "shipping", "tax"]);
const DATE_FIELDS = new Set([
  "occurred_on", "due", "placed_at", "shipped_at", "delivered_at", "created_at", "updated_at",
  "trip_date", "next_renewal", "started_on", "cancelled_at",
]);

/** Present a single snapshot value the same way the rest of the app would. */
export function formatSnapshotValue(key: string, value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (MONEY_FIELDS.has(key)) return formatMoney(value as number);
  if (DATE_FIELDS.has(key)) return formatBusinessDate(value as string);
  return String(value);
}

/** "Tracking number" from "tracking_number". */
export function humanizeField(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Who performed an action. A null actor_id means an automated/system write
 * (Etsy sync, Shopify webhook, DB trigger) — label it "System", never
 * "A teammate" (the bug we fixed in notifications). A known member resolves to
 * their name; an unknown non-null id is an org teammate we can't name yet.
 */
export function actorLabel(actorId: string | null, nameById: Map<string, string>): string {
  if (!actorId) return "System";
  return nameById.get(actorId) ?? "A teammate";
}
