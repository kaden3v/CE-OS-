/**
 * Canonical status → StatusDot tone mappings. Previously each page defined its
 * own, and Orders/Shipping/Dashboard disagreed (shipment "pending" was alert in
 * one place, warn in another). One source of truth here.
 */

export type Tone = "ok" | "info" | "warn" | "alert";

/**
 * Human label for an order status. The stored value stays canonical
 * (`shipped`), but we surface "In transit" so a shipped-not-yet-delivered
 * order reads as its real-world state. Everything else title-cases as-is.
 */
const ORDER_STATUS_LABELS: Record<string, string> = {
  shipped: "In transit",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

/** orders.status ∈ pending|processing|packed|shipped|delivered|cancelled|refunded */
export function orderStatusTone(status: string): Tone {
  switch (status) {
    case "pending": return "alert";
    case "processing": return "warn";
    case "packed": return "info";
    case "shipped": return "info";      // in transit — distinct from delivered
    case "delivered": return "ok";
    case "cancelled":
    case "refunded": return "warn";
    default: return "info";
  }
}

/** shipments.status ∈ pending|ready|held|shipped|delivered|exception */
export function shipmentStatusTone(status: string): Tone {
  switch (status) {
    case "pending": return "alert";
    case "ready": return "info";
    case "held":
    case "exception": return "alert";
    case "shipped":
    case "delivered": return "ok";
    default: return "warn";
  }
}
