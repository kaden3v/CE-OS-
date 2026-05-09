import type { OrderStatus } from "@/lib/constants";
import { utcIsoNow } from "@/lib/dates";

const TERMINAL: ReadonlySet<OrderStatus> = new Set(["Delivered", "Cancelled"]);

/** Forward-only edges (order workflow). */
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  Pending: ["Processing", "Cancelled"],
  Processing: ["Packed", "Cancelled"],
  Packed: ["Shipped", "Cancelled"],
  Shipped: ["Delivered"],
  Delivered: [],
  Cancelled: [],
};

export type OrderTransitionContext = {
  /** Required when moving Packed → Shipped. */
  trackingNumber?: string;
};

export type TransitionResult =
  | {
      ok: true;
      status: OrderStatus;
      /** ISO-8601 UTC `Z` instant of the transition. */
      transitionedAt: string;
    }
  | {
      ok: false;
      error: string;
      code: "invalid-transition" | "terminal" | "missing-required-field";
    };

/**
 * Validates a single order-status transition and produces a canonical timestamp.
 */
export function transitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
  ctx?: OrderTransitionContext,
  clock: () => string = utcIsoNow
): TransitionResult {
  if (TERMINAL.has(from)) {
    return {
      ok: false,
      error: "Terminal states cannot transition",
      code: "terminal",
    };
  }

  const nextSteps = ALLOWED[from];
  if (!nextSteps.includes(to)) {
    return {
      ok: false,
      error: `Invalid transition ${from} → ${to}`,
      code: "invalid-transition",
    };
  }

  if (from === "Packed" && to === "Shipped") {
    const tr = ctx?.trackingNumber?.trim();
    if (!tr) {
      return {
        ok: false,
        error: "trackingNumber is required to ship",
        code: "missing-required-field",
      };
    }
  }

  return {
    ok: true,
    status: to,
    transitionedAt: clock(),
  };
}
