import { describe, it, expect } from "vitest";
import { parseMoney, parseDate, detectType, extractOrderId, disambiguatePaymentKeys } from "./parse";
import { buildPlan } from "./project";
import type { StagedRow, RawRow } from "./types";

describe("parseMoney", () => {
  it.each([
    ["28.50", 28.5],
    ["$1,234.56", 1234.56],
    ["(3.20)", -3.2],
    ["-$5.00", -5],
    ["", 0],
    ["--", 0],
    ["-", 0],
    ["3.20 (1)", 0], // embedded junk → reject, don't mis-parse
    ["($1,000.00)", -1000],
    ["42", 42],
    ["5-", 0], // trailing minus → reject
    ["USD 12.00", 0], // currency belongs in its own column
    ["0", 0],
    ["  7.25  ", 7.25],
  ])("parses %j → %j", (input, want) => {
    expect(parseMoney(input)).toBe(want);
  });
});

describe("parseDate (timezone-robust)", () => {
  it.each([
    ["2024-09-05", "2024-09-05"],
    ["2024-09-05T22:00:00Z", "2024-09-05"],
    ["9/5/24", "2024-09-05"],
    ["12/31/2024", "2024-12-31"],
    ["September 5, 2024", "2024-09-05"],
    // Regression: a late-night local time must NOT roll forward via UTC.
    ["December 31, 2024 11:00 PM", "2024-12-31"],
    ["", null],
    ["not a date", null],
  ])("parses %j → %j", (input, want) => {
    expect(parseDate(input)).toBe(want);
  });
});

describe("detectType", () => {
  it("detects the payment ledger", () => {
    expect(detectType(["Date", "Type", "Title", "Net", "Amount", "Fees & Taxes"])).toBe("payments");
  });
  it("detects order items", () => {
    expect(detectType(["Sale Date", "Order ID", "Title", "Quantity", "Price"])).toBe("order_items");
  });
  it("detects sold orders", () => {
    expect(detectType(["Sale Date", "Order ID", "Buyer", "Order Value", "Order Shipping"])).toBe("sold_orders");
  });
  it("returns null for unknown headers", () => {
    expect(detectType(["Foo", "Bar"])).toBeNull();
  });
  it("prefers payments when Type+Net present (precedence)", () => {
    expect(detectType(["Order ID", "Type", "Net", "Title"])).toBe("payments");
  });
});

describe("extractOrderId", () => {
  it.each([
    ["Payment for Order #1234567890", "1234567890"],
    ["#2233445566", "2233445566"],
    ["Order 9988776655", "9988776655"],
    ["SKU 4567890123 sold", null], // bare long number without Order/# marker
    ["Deposit to bank", null],
  ])("extracts from %j → %j", (input, want) => {
    expect(extractOrderId(input)).toBe(want);
  });
});

describe("disambiguatePaymentKeys", () => {
  const rows: StagedRow[] = [
    { csvType: "payments", etsyKey: "pay:A", rowType: "Fee", orderExternalId: null, occurredOn: null, amount: -0.2, raw: {} },
    { csvType: "payments", etsyKey: "pay:A", rowType: "Fee", orderExternalId: null, occurredOn: null, amount: -0.2, raw: {} },
    { csvType: "payments", etsyKey: "pay:B", rowType: "Fee", orderExternalId: null, occurredOn: null, amount: -0.5, raw: {} },
  ];
  it("appends an occurrence index to identical keys", () => {
    expect(disambiguatePaymentKeys(rows).map((r) => r.etsyKey)).toEqual(["pay:A", "pay:A#2", "pay:B"]);
  });
  it("does not mutate the input rows", () => {
    disambiguatePaymentKeys(rows);
    expect(rows.map((r) => r.etsyKey)).toEqual(["pay:A", "pay:A", "pay:B"]);
  });
  it("is stable when re-run on already-disambiguated rows (idempotent)", () => {
    const once = disambiguatePaymentKeys(rows);
    expect(disambiguatePaymentKeys(once).map((r) => r.etsyKey)).toEqual(["pay:A", "pay:A#2", "pay:B"]);
  });
});

// ── buildPlan helpers ──
function soldOrder(raw: Partial<RawRow>): StagedRow {
  const r = raw as RawRow;
  return { csvType: "sold_orders", etsyKey: `order:${r["Order ID"]}`, rowType: "Order", orderExternalId: r["Order ID"], occurredOn: "2024-09-05", amount: 0, raw: r };
}
function itemRow(raw: Partial<RawRow>): StagedRow {
  const r = raw as RawRow;
  return { csvType: "order_items", etsyKey: `item:${r["Order ID"]}:x`, rowType: "Item", orderExternalId: r["Order ID"], occurredOn: "2024-09-05", amount: 0, raw: r };
}
function payRow(type: string, raw: Partial<RawRow>): StagedRow {
  const r = { Type: type, ...raw } as RawRow;
  return {
    csvType: "payments", etsyKey: `pay:${type}:${r["Title"]}:${r["Amount"]}`, rowType: type,
    orderExternalId: extractOrderId((r["Title"] ?? "") + " " + (r["Info"] ?? "")),
    occurredOn: parseDate(r["Date"] ?? ""), amount: parseMoney(r["Amount"] ?? "0"), raw: r,
  };
}

describe("buildPlan", () => {
  it("projects orders + items + customers from the order CSVs", () => {
    const plan = buildPlan([
      soldOrder({ "Order ID": "1111111111", "Full Name": "Jane Doe", "Item Total": "40.00", "Order Shipping": "8.00", "Order Sales Tax": "2.00", "Order Value": "50.00" }),
      itemRow({ "Order ID": "1111111111", "Item Name": "Pinguicula", "Quantity": "2", "Price": "20.00" }),
    ]);
    expect(plan.orders).toHaveLength(1);
    expect([plan.orders[0].subtotal, plan.orders[0].shipping, plan.orders[0].tax, plan.orders[0].total]).toEqual([40, 8, 2, 50]);
    expect(plan.orders[0].source).toBe("orders");
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].qty).toBe(2);
    expect(plan.customers).toHaveLength(1);
  });

  it("categorizes the payment ledger and skips deposits/taxes", () => {
    const plan = buildPlan([
      payRow("Fee", { Date: "9/5/24", Title: "Listing fee", Amount: "-0.20", "Fees & Taxes": "-0.20" }),
      payRow("Marketing", { Date: "9/5/24", Title: "Etsy Ads", Amount: "-3.00" }),
      payRow("Refund", { Date: "9/6/24", Title: "Refund", Amount: "-10.00" }),
      payRow("Deposit", { Date: "9/7/24", Title: "Deposit", Amount: "-100.00" }),
      payRow("Tax", { Date: "9/5/24", Title: "Sales tax remitted", Amount: "-2.00" }),
      payRow("Sale", { Date: "9/5/24", Title: "Payment for Order #7777777777", Amount: "50.00" }),
    ]);
    expect(plan.expenses).toHaveLength(3);
    expect(plan.skipped.deposits).toBe(1);
    expect(plan.skipped.unmapped).toBe(1);
    expect(plan.skipped.unmatchedSales).toBe(0);
    expect(plan.orders).toHaveLength(1);
    expect(plan.orders[0].source).toBe("ledger");
    expect(plan.expenses.find((e) => e.description.includes("Listing"))?.category).toBe("Etsy Fees");
    expect(plan.expenses.find((e) => e.description.includes("Ads"))?.category).toBe("Etsy Ads");
    expect(plan.expenses.find((e) => e.category === "Refund")?.amount).toBe(10);
  });

  // Regression: a Sale row with no extractable order id must be COUNTED, not silently dropped.
  it("surfaces unattributable sales instead of dropping them", () => {
    const plan = buildPlan([payRow("Sale", { Date: "9/5/24", Title: "Payment for your sale", Amount: "75.00" })]);
    expect(plan.orders).toHaveLength(0);
    expect(plan.expenses).toHaveLength(0);
    expect(plan.skipped.unmatchedSales).toBe(1);
  });

  it("reconciles a ledger sale onto an existing order without duplicating it", () => {
    const plan = buildPlan([
      soldOrder({ "Order ID": "8888888888", "Item Total": "30.00", "Order Value": "35.00" }),
      payRow("Sale", { Date: "9/5/24", Title: "Payment for Order #8888888888", Amount: "35.00" }),
    ]);
    expect(plan.orders).toHaveLength(1);
    expect(plan.orders[0].source).toBe("orders");
    expect(plan.skipped.unmatchedSales).toBe(0);
  });

  it("is deterministic for the same input (pure)", () => {
    const staged = [payRow("Fee", { Date: "9/5/24", Title: "Listing fee", Amount: "-0.20" })];
    expect(JSON.stringify(buildPlan(staged))).toBe(JSON.stringify(buildPlan(staged)));
  });
});
