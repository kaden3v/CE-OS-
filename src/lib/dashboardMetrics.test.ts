import { describe, it, expect } from "vitest";
import {
  channelMix,
  customerStats,
  topSellers,
  validOrders,
  windowStats,
  type MetricOrder,
} from "./dashboardMetrics";

const DAY = 86_400_000;
// Mid-month reference so "this month" has room on both sides.
const NOW = new Date(2026, 6, 17, 12).getTime(); // Jul 17 2026, local

const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();

let seq = 0;
const order = (over: Partial<MetricOrder> = {}): MetricOrder => ({
  id: `o-${++seq}`,
  customer_id: "c-1",
  customer: { id: "c-1", name: "Ana Adams" },
  placed_at: daysAgo(1),
  status: "delivered",
  total: 50,
  channel: "etsy",
  items: [{ qty: 1, name_snapshot: "Monstera", price: 50 }],
  ...over,
});

describe("validOrders", () => {
  it("drops cancelled and refunded orders", () => {
    const list = [order(), order({ status: "cancelled" }), order({ status: "refunded" })];
    expect(validOrders(list)).toHaveLength(1);
  });
});

describe("windowStats", () => {
  it("splits current vs previous 30-day windows", () => {
    const list = [
      order({ placed_at: daysAgo(5), total: 100, items: [{ qty: 2, name_snapshot: "A", price: 50 }] }),
      order({ placed_at: daysAgo(29), total: 60 }),
      order({ placed_at: daysAgo(45), total: 40 }), // previous window
      order({ placed_at: daysAgo(90), total: 999 }), // outside both
    ];
    const s = windowStats(list, NOW);
    expect(s.orders).toBe(2);
    expect(s.revenue).toBe(160);
    expect(s.units).toBe(3);
    expect(s.aov).toBe(80);
    expect(s.prevOrders).toBe(1);
    expect(s.prevRevenue).toBe(40);
    expect(s.prevAov).toBe(40);
  });

  it("excludes cancelled orders and returns null AOV when empty", () => {
    const s = windowStats([order({ status: "cancelled" })], NOW);
    expect(s.orders).toBe(0);
    expect(s.aov).toBeNull();
    expect(s.prevAov).toBeNull();
  });

  it("coerces string totals (Postgres numerics)", () => {
    const s = windowStats([order({ total: "12.50" })], NOW);
    expect(s.revenue).toBe(12.5);
  });
});

describe("customerStats", () => {
  it("counts new customers by first-order month, not created_at", () => {
    const list = [
      // c-1: first order two months ago, ordered again today → repeat, not new.
      order({ customer_id: "c-1", placed_at: daysAgo(65) }),
      order({ customer_id: "c-1", placed_at: daysAgo(0) }),
      // c-2: first order this month → new this month.
      order({ customer_id: "c-2", customer: { id: "c-2", name: "Bo" }, placed_at: daysAgo(2) }),
    ];
    const s = customerStats(list, NOW);
    expect(s.totalCustomers).toBe(2);
    expect(s.repeatCustomers).toBe(1);
    expect(s.repeatRate).toBe(0.5);
    expect(s.newThisMonth).toBe(1);
    expect(s.newByMonth).toHaveLength(6);
    expect(s.newByMonth[5].value).toBe(1); // current month bucket
    expect(s.newByMonth.reduce((a, b) => a + b.value, 0)).toBe(2);
  });

  it("computes last-month new-customer count from calendar months", () => {
    // Jul 17 NOW → an order on Jun 20 is "last month".
    const list = [order({ customer_id: "c-9", placed_at: new Date(2026, 5, 20).toISOString() })];
    const s = customerStats(list, NOW);
    expect(s.newLastMonth).toBe(1);
    expect(s.newThisMonth).toBe(0);
  });

  it("returning share counts 30d orders whose customer existed before", () => {
    const list = [
      order({ customer_id: "c-1", placed_at: daysAgo(200) }), // history
      order({ customer_id: "c-1", placed_at: daysAgo(3) }), // returning
      order({ customer_id: "c-2", customer: { id: "c-2", name: "Bo" }, placed_at: daysAgo(4) }), // brand new
    ];
    const s = customerStats(list, NOW);
    expect(s.returningShare30).toBe(0.5);
  });

  it("ranks top customers by trailing-90d revenue and skips guests", () => {
    const list = [
      order({ customer_id: "c-1", total: 40, placed_at: daysAgo(10) }),
      order({ customer_id: "c-1", total: 40, placed_at: daysAgo(20) }),
      order({ customer_id: "c-2", customer: { id: "c-2", name: "Bo" }, total: 100, placed_at: daysAgo(5) }),
      order({ customer_id: "c-2", customer: { id: "c-2", name: "Bo" }, total: 10, placed_at: daysAgo(120) }), // outside 90d
      order({ customer_id: null, customer: null, total: 999, placed_at: daysAgo(1) }), // guest
    ];
    const s = customerStats(list, NOW);
    expect(s.topCustomers90.map((c) => c.id)).toEqual(["c-2", "c-1"]);
    expect(s.topCustomers90[0]).toMatchObject({ total: 100, orders: 1, name: "Bo" });
    expect(s.topCustomers90[1]).toMatchObject({ total: 80, orders: 2 });
  });

  it("is null-safe with no orders", () => {
    const s = customerStats([], NOW);
    expect(s.repeatRate).toBeNull();
    expect(s.returningShare30).toBeNull();
    expect(s.topCustomers90).toEqual([]);
  });
});

describe("channelMix", () => {
  it("aggregates the window per channel with shares and AOV, sorted by revenue", () => {
    const list = [
      order({ channel: "etsy", total: 60, placed_at: daysAgo(2) }),
      order({ channel: "etsy", total: 40, placed_at: daysAgo(3) }),
      order({ channel: "shopify", total: 300, placed_at: daysAgo(4) }),
      order({ channel: "shopify", total: 100, placed_at: daysAgo(99) }), // outside window
    ];
    const mix = channelMix(list, NOW);
    expect(mix.map((c) => c.channel)).toEqual(["shopify", "etsy"]);
    expect(mix[0]).toMatchObject({ revenue: 300, orders: 1, aov: 300 });
    expect(mix[0].share).toBeCloseTo(0.75);
    expect(mix[1].share).toBeCloseTo(0.25);
    expect(mix[1].aov).toBe(50);
  });

  it("returns empty for an empty window", () => {
    expect(channelMix([], NOW)).toEqual([]);
  });
});

describe("topSellers", () => {
  it("ranks by units then revenue within the window", () => {
    const list = [
      order({ placed_at: daysAgo(1), items: [{ qty: 3, name_snapshot: "Hoya", price: 20 }] }),
      order({ placed_at: daysAgo(2), items: [{ qty: 1, name_snapshot: "Monstera", price: 90 }, { qty: 2, name_snapshot: "Hoya", price: 20 }] }),
      order({ placed_at: daysAgo(200), items: [{ qty: 50, name_snapshot: "Old", price: 1 }] }),
    ];
    const top = topSellers(list, NOW);
    expect(top[0]).toEqual({ name: "Hoya", units: 5, revenue: 100 });
    expect(top[1]).toEqual({ name: "Monstera", units: 1, revenue: 90 });
    expect(top.find((t) => t.name === "Old")).toBeUndefined();
  });

  it("respects the limit and tolerates null prices", () => {
    const items = Array.from({ length: 8 }, (_, i) => order({
      placed_at: daysAgo(1),
      items: [{ qty: 8 - i, name_snapshot: `P${i}`, price: null }],
    }));
    const top = topSellers(items, NOW, 30, 5);
    expect(top).toHaveLength(5);
    expect(top[0].revenue).toBe(0);
  });
});
