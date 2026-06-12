/**
 * Canonical status → StatusDot tone mappings. Previously each page defined its
 * own, and Orders/Shipping/Dashboard disagreed (shipment "pending" was alert in
 * one place, warn in another). One source of truth here.
 */

export type Tone = "ok" | "info" | "warn" | "alert";

/** orders.status ∈ pending|processing|packed|shipped|delivered|cancelled|refunded */
export function orderStatusTone(status: string): Tone {
  switch (status) {
    case "pending": return "alert";
    case "processing": return "warn";
    case "packed": return "info";
    case "shipped":
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
