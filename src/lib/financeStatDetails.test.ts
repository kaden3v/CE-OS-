import { describe, it, expect } from "vitest";
import { buildStatDetail, type StatDetailInput } from "./financeStatDetails";
import { formatMoney } from "./format";
import type { FinanceKpiWindow, CashflowPoint } from "@/hooks/useFinanceOverview";
import type { OrderWithRelations, OrderItemRow } from "@/hooks/useOrders";
import type { Expense } from "@/components/expenses/types";

// --- fixtures ----------------------------------------------------------------

const itemsOf = (...qtys: number[]) => qtys.map((qty) => ({ qty })) as unknown as OrderItemRow[];

function makeWindow(p: Partial<FinanceKpiWindow>): FinanceKpiWindow {
  return {
    gross_sales: 0, gross_receipts: 0, refunds: 0, shipping_collected: 0,
    order_count: 0, sales_tax_owed: 0, channel_fees: 0, net_revenue: 0,
    expenses: 0, cogs_materials: 0, cogs_labor: 0, cogs: 0, cogs_sold: 0, gross_margin: 0, mileage: 0, net_profit: 0,
    ...p,
  };
}

function makeOrder(p: Partial<OrderWithRelations> & { id: string }): OrderWithRelations {
  return {
    id: p.id, org_id: "org", user_id: "u",
    channel: p.channel ?? "shopify",
    status: p.status ?? "active",
    placed_at: p.placed_at ?? "2026-06-10T12:00:00Z",
    subtotal: p.subtotal ?? 0, shipping: p.shipping ?? 0, tax: p.tax ?? 0, total: p.total ?? 0,
    customer_id: p.customer_id ?? null, external_id: null, notes: null,
    created_at: "2026-06-10T12:00:00Z", updated_at: "2026-06-10T12:00:00Z",
    customer: p.customer ?? null, items: p.items ?? [],
  };
}

function makeExpense(p: Partial<Expense> & { id: string; amount: number }): Expense {
  return {
    id: p.id, org_id: "org", user_id: "u", amount: p.amount,
    category: p.category ?? null, category_legacy: null, schedule_c_category: null, schedule_f_category: null,
    occurred_on: p.occurred_on ?? "2026-06-10", source: "manual",
    vendor_id: null, vendor_name: p.vendor_name ?? null, description: p.description ?? null,
    payment_method: null, deductible: true, receipt_url: null, notes: null, external_id: null,
    created_at: "2026-06-10T00:00:00Z", updated_at: "2026-06-10T00:00:00Z",
  };
}

// Scenario: 2 active orders (shopify + etsy) and 1 refunded; 2 expenses.
// Server window matches the SQL: gross_sales = product net of refunds, etc.
const o1 = makeOrder({ id: "o1", channel: "shopify", subtotal: 100, shipping: 10, tax: 8, total: 118, customer: { id: "c1", name: "Ana", email: null }, items: itemsOf(2) });
const o2 = makeOrder({ id: "o2", channel: "etsy", subtotal: 50, shipping: 5, tax: 4, total: 59, customer: { id: "c2", name: "Bo", email: null }, items: itemsOf(1) });
const o3 = makeOrder({ id: "o3", channel: "shopify", status: "refunded", subtotal: 30, shipping: 3, tax: 2, total: 35, items: itemsOf(1) });

const cashflow: CashflowPoint[] = Array.from({ length: 12 }, (_, i) => ({
  month: `2026-${String(i + 1).padStart(2, "0")}-01`,
  money_in: i === 11 ? 100 : 0, money_out: i === 11 ? 50 : 0, net: i === 11 ? 50 : 0,
}));

const input: StatDetailInput = {
  current: makeWindow({
    gross_sales: 150, shipping_collected: 15, gross_receipts: 165, order_count: 2,
    sales_tax_owed: 8, channel_fees: 12, net_revenue: 138, expenses: 60, mileage: 5, net_profit: 88,
  }),
  prior: makeWindow({ net_revenue: 100, expenses: 30, order_count: 1, gross_receipts: 120, net_profit: 50 }),
  breakdown: [{ category: "Ads", total: 40 }, { category: "Shipping", total: 20 }],
  cashflow,
  period: "month",
  windowOrders: [o1, o2, o3],
  windowExpenses: [
    makeExpense({ id: "e1", amount: 40, category: "Ads", vendor_name: "Meta", description: "FB ads" }),
    makeExpense({ id: "e2", amount: 20, category: "Shipping", description: "USPS" }),
  ],
};

// --- tests -------------------------------------------------------------------

describe("net_revenue", () => {
  const d = buildStatDetail("net_revenue", input);
  it("headline equals the server net revenue", () => {
    expect(d.headline).toBe(formatMoney(138));
  });
  it("composition is product − fees = net revenue", () => {
    expect(d.composition.map((r) => r.amount)).toEqual([150, 12, 138]);
    expect(d.composition[1].outflow).toBe(true);
    expect(d.composition[2].result).toBe(true);
  });
  it("lists every non-cancelled order and mutes the refunded one", () => {
    expect(d.lineItems.rows).toHaveLength(3);
    expect(d.lineItems.rows.find((r) => r.id === "o3")?.muted).toBe(true);
  });
  it("footer reconciles to the sum of non-refunded plant sales", () => {
    const activeGross = [o1, o2].reduce((s, o) => s + o.subtotal, 0);
    expect(d.lineItems.footer?.value).toBe(formatMoney(activeGross));
    expect(d.lineItems.footer?.value).toBe(formatMoney(150));
  });
  it("flags the modeled-fee and refund caveats", () => {
    expect(d.lineItems.caveat).toContain("modeled");
    expect(d.lineItems.caveat).toContain("Refunded");
  });
  it("trend is the cash-flow in/out series and delta improved", () => {
    expect(d.chart.kind).toBe("inout");
    expect(d.delta?.direction).toBe("up");
  });
});

describe("total_expenses", () => {
  const d = buildStatDetail("total_expenses", input);
  it("headline and footer equal the expense total", () => {
    expect(d.headline).toBe(formatMoney(60));
    expect(d.lineItems.footer?.value).toBe(formatMoney(60));
  });
  it("category breakdown sums to the total", () => {
    const cats = d.composition.filter((r) => !r.result);
    expect(cats.reduce((s, r) => s + r.amount, 0)).toBe(60);
  });
  it("lists each expense row", () => {
    expect(d.lineItems.rows).toHaveLength(2);
  });
  it("delta is red when expenses rose (lower is better)", () => {
    expect(d.delta?.direction).toBe("down");
  });
  it("trend is expense bars", () => {
    expect(d.chart.kind).toBe("bars");
    expect(d.chart.barColor).toBe("alert");
  });
});

describe("orders", () => {
  const d = buildStatDetail("orders", input);
  it("counts only non-cancelled/refunded orders", () => {
    expect(d.headline).toBe("2");
    expect(d.lineItems.rows).toHaveLength(2);
    expect(d.lineItems.footer?.value).toBe("2");
  });
  it("breaks down by status", () => {
    const total = d.composition.find((r) => r.result);
    expect(total?.valueText).toBe("2");
  });
});

describe("sales_tax", () => {
  const d = buildStatDetail("sales_tax", input);
  it("includes only direct (non-Etsy/eBay) taxed orders", () => {
    expect(d.lineItems.rows).toHaveLength(1); // o1 shopify only; o2 etsy + o3 refunded excluded
    expect(d.lineItems.footer?.value).toBe(formatMoney(8));
    expect(d.headline).toBe(formatMoney(8));
  });
});

describe("gross_receipts", () => {
  const d = buildStatDetail("gross_receipts", input);
  it("equals product + shipping", () => {
    expect(d.headline).toBe(formatMoney(165));
    expect(d.lineItems.footer?.value).toBe(formatMoney(165));
    expect(d.composition.map((r) => r.amount)).toEqual([150, 15, 165]);
  });
});

describe("shipping_margin", () => {
  const d = buildStatDetail("shipping_margin", input);
  it("is collected minus postage (negative here)", () => {
    expect(d.headline).toBe(formatMoney(-5));
    expect(d.composition[0].amount).toBe(15);
    expect(d.composition[1].amount).toBe(20);
    expect(d.composition[1].outflow).toBe(true);
    expect(d.composition[2].outflow).toBe(true); // margin < 0
  });
  it("flags the postage caveat", () => {
    expect(d.lineItems.caveat).toContain("Postage");
  });
});

describe("avg_order_value", () => {
  const d = buildStatDetail("avg_order_value", input);
  it("is net revenue divided by order count", () => {
    expect(d.headline).toBe(formatMoney(138 / 2));
    expect(d.composition[1].valueText).toBe("÷ 2");
  });
  it("has no monthly trend chart", () => {
    expect(d.chart.kind).toBe("none");
    expect(d.chart.emptyHint).toBeTruthy();
  });
});

describe("net_profit", () => {
  const d = buildStatDetail("net_profit", input);
  it("embeds the waterfall and shows no line items", () => {
    expect(d.useWaterfall).toBe(true);
    expect(d.lineItems.kind).toBe("none");
    expect(d.chart.kind).toBe("bars");
  });
});

describe("loading guard", () => {
  it("returns an em-dash headline when the window is undefined", () => {
    const d = buildStatDetail("net_revenue", { ...input, current: undefined });
    expect(d.headline).toBe("—");
    expect(d.lineItems.kind).toBe("none");
  });
});
