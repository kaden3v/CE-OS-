import { describe, it, expect } from "vitest";
import type { OrderStatus } from "@/lib/constants";
import { transitionOrderStatus } from "./orderMachine";

const FIXED_ISO = "2026-01-15T12:00:00.000Z";
const clock = () => FIXED_ISO;

describe("transitionOrderStatus", () => {
  it("records timestamp on success", () => {
    const r = transitionOrderStatus("Pending", "Processing", {}, clock);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.transitionedAt).toBe(FIXED_ISO);
  });

  const happyPaths: Array<[OrderStatus, OrderStatus, Record<string, unknown>?]> =
    [
      ["Pending", "Processing"],
      ["Pending", "Cancelled"],
      ["Processing", "Packed"],
      ["Processing", "Cancelled"],
      ["Packed", "Cancelled"],
      [
        "Packed",
        "Shipped",
        { trackingNumber: "1Z999AA10123456784" },
      ],
      ["Shipped", "Delivered"],
    ];

  it.each(happyPaths)(
    "allows valid transition %s → %s",
    (from, to, ctx) => {
      const r = transitionOrderStatus(from, to, ctx as never, clock);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.status).toBe(to);
        expect(r.transitionedAt).toBe(FIXED_ISO);
      }
    }
  );

  it("Packed → Shipped without tracking fails missing-required-field", () => {
    const r = transitionOrderStatus("Packed", "Shipped", {}, clock);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing-required-field");
  });

  it.each<[OrderStatus, OrderStatus]>([
    ["Pending", "Shipped"],
    ["Processing", "Delivered"],
    ["Shipped", "Packed"],
    ["Pending", "Delivered"],
  ])("rejects invalid transition %s → %s", (from, to) => {
    const r = transitionOrderStatus(from, to, {}, clock);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid-transition");
  });

  it.each<[OrderStatus, OrderStatus]>([
    ["Delivered", "Pending"],
    ["Cancelled", "Processing"],
  ])("terminal %s refuses further transitions", (from, to) => {
    const r = transitionOrderStatus(from, to, {}, clock);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("terminal");
  });

});
