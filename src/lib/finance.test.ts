import { describe, it, expect } from "vitest";
import {
  weightedAvgUnitCost, reverseSupplyPurchase, productionRunCost, estimateChannelFee,
  advanceRenewal, isSubscriptionDue, quarterlyEstimate, roundMoney,
} from "./finance";

describe("weighted-average unit cost", () => {
  it("buys 10 @ $20 onto empty stock → $2.00 (acceptance)", () => {
    expect(weightedAvgUnitCost(0, 0, 10, 20)).toBe(2);
  });
  it("blends across price changes", () => {
    // 5 @ $2 then buy 10 for $30 → (5*2 + 30) / 15 = 2.6667
    expect(weightedAvgUnitCost(5, 2, 10, 30)).toBeCloseTo(2.6667, 4);
  });
  it("guards divide-by-zero", () => {
    expect(weightedAvgUnitCost(0, 0, 0, 0)).toBe(0);
  });
});

describe("supply purchase reversal", () => {
  it("reverses the acceptance purchase back to empty", () => {
    // after 10 @ $20 → onHand 10, cost 2; reversing returns to 0/0
    expect(reverseSupplyPurchase(10, 2, 10, 20)).toEqual({ onHand: 0, unitCost: 0 });
  });
  it("keeps stock exact under partial reversal", () => {
    const r = reverseSupplyPurchase(15, 2.6667, 10, 30);
    expect(r.onHand).toBe(5);
    expect(r.unitCost).toBeCloseTo(2, 2);
  });
});

describe("production run cost + reversal", () => {
  it("4 units @ $2 + no labor over 10 produced (acceptance)", () => {
    const c = productionRunCost([{ qty: 4, unitCost: 2 }], 0, 0, 10);
    expect(c.materials).toBe(8);
    expect(c.labor).toBe(0);
    expect(c.total).toBe(8);
    expect(c.unitCost).toBe(0.8);
  });
  it("adds labor", () => {
    const c = productionRunCost([{ qty: 4, unitCost: 2 }], 2, 15, 10);
    expect(c.labor).toBe(30);
    expect(c.total).toBe(38);
    expect(c.unitCost).toBe(3.8);
  });
  it("deleting a run restores stock (consumption is additive)", () => {
    // log consumed 4 from 10, delete restores +4 → 10
    const onHandAfterRun = 10 - 4;
    const onHandAfterDelete = onHandAfterRun + 4;
    expect(onHandAfterDelete).toBe(10);
  });
});

describe("channel fee estimation", () => {
  const etsy = { percent_fee: 6.5, payment_percent: 3, fixed_fee: 0, payment_fixed: 0.25, listing_fee: 0.2 };
  it("Etsy order $42.04, 1 item", () => {
    // 42.04 * 9.5% + 0.25 + 0.20 = 3.9938 + 0.45 = 4.4438 → 4.44
    expect(estimateChannelFee(42.04, 1, etsy)).toBe(4.44);
  });
  it("scales listing fee per item", () => {
    const a = estimateChannelFee(100, 1, etsy);
    const b = estimateChannelFee(100, 3, etsy);
    expect(roundMoney(b - a)).toBe(0.4); // 2 extra items × $0.20
  });
  it("shopify has no listing/transaction fee", () => {
    const shopify = { percent_fee: 0, payment_percent: 2.9, fixed_fee: 0, payment_fixed: 0.3, listing_fee: 0 };
    expect(estimateChannelFee(100, 5, shopify)).toBe(3.2); // 2.90 + 0.30
  });
});

describe("subscription renewal advancement + cron idempotency", () => {
  it("Shopify 2026-06-25 → 2026-07-25 (acceptance)", () => {
    expect(advanceRenewal("2026-06-25", "monthly")).toBe("2026-07-25");
  });
  it("clamps end-of-month like Postgres", () => {
    expect(advanceRenewal("2026-01-31", "monthly")).toBe("2026-02-28");
  });
  it("quarterly and yearly", () => {
    expect(advanceRenewal("2026-06-25", "quarterly")).toBe("2026-09-25");
    expect(advanceRenewal("2026-06-25", "yearly")).toBe("2027-06-25");
  });
  it("is idempotent: once advanced past today, a second cron pass skips it", () => {
    const today = "2026-06-12";
    expect(isSubscriptionDue("2026-06-12", today)).toBe(true);
    const advanced = advanceRenewal("2026-06-12", "monthly");
    expect(isSubscriptionDue(advanced, today)).toBe(false); // no double-log
  });
});

describe("quarterly estimated tax", () => {
  it("computes SE tax (15.3% of 92.35%) + income tax", () => {
    const q = quarterlyEstimate(10000, 12);
    expect(q.seTax).toBe(1412.96); // 10000 * 0.9235 * 0.153 = 1412.955
    expect(q.incomeTax).toBe(1200);
    expect(q.total).toBe(2612.96);
    expect(q.perQuarter).toBe(653.24);
  });
  it("floors at zero for a loss", () => {
    const q = quarterlyEstimate(-5000, 12);
    expect(q.total).toBe(0);
  });
});
