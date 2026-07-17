import { describe, it, expect } from "vitest";
import {
  assignCsvExternalIds,
  categorizeImportRow,
  csvExternalId,
  isInflow,
  passesPolarity,
} from "./expenseImport";
import { DEFAULT_CATEGORY_BOOK } from "./categories";
import { buildCategoryModel } from "./expenseCategorization";
import type { ExpenseRuleFields } from "./expenseRules";
import type { Expense } from "@/components/expenses/types";

describe("isInflow", () => {
  it("treats a positive amount as money in", () => {
    expect(isInflow(12.5)).toBe(true);
  });
  it("treats zero, negatives, and null as not-inflow", () => {
    expect(isInflow(0)).toBe(false);
    expect(isInflow(-12.5)).toBe(false);
    expect(isInflow(null)).toBe(false);
  });
});

describe("passesPolarity", () => {
  it("'all' keeps both directions", () => {
    expect(passesPolarity("all", true)).toBe(true);
    expect(passesPolarity("all", false)).toBe(true);
  });
  it("'out' keeps outflows, drops inflows", () => {
    expect(passesPolarity("out", false)).toBe(true);
    expect(passesPolarity("out", true)).toBe(false);
  });
  it("'in' keeps inflows, drops outflows", () => {
    expect(passesPolarity("in", true)).toBe(true);
    expect(passesPolarity("in", false)).toBe(false);
  });
});

const ORG = "0a1b2c3d-0000-0000-0000-000000000000";

describe("csvExternalId", () => {
  const row = { occurred_on: "2026-07-01", amount: 10.99, description: "AMZN Mktp US*2X3Y" };

  it("is deterministic and human-readable", () => {
    const id = csvExternalId(ORG, row);
    expect(id).toBe(csvExternalId(ORG, { ...row }));
    expect(id).toBe("csv:0a1b2c3d:2026-07-01:1099:amzn-mktp-us-2x3y");
  });

  it("differs when date, amount, or memo differ", () => {
    const base = csvExternalId(ORG, row);
    expect(csvExternalId(ORG, { ...row, occurred_on: "2026-07-02" })).not.toBe(base);
    expect(csvExternalId(ORG, { ...row, amount: 11.99 })).not.toBe(base);
    expect(csvExternalId(ORG, { ...row, description: "other" })).not.toBe(base);
  });

  it("rounds amounts to cents (no float dust in keys)", () => {
    expect(csvExternalId(ORG, { ...row, amount: 0.1 + 0.2 })).toContain(":30:");
  });

  it("handles an empty memo", () => {
    expect(csvExternalId(ORG, { ...row, description: null })).toBe("csv:0a1b2c3d:2026-07-01:1099:x");
  });
});

describe("assignCsvExternalIds", () => {
  it("suffixes true within-batch repeats so both import", () => {
    const row = { occurred_on: "2026-07-01", amount: 4.5, description: "Coffee" };
    const ids = assignCsvExternalIds(ORG, [row, { ...row }, { ...row }]);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).not.toContain(":1");
    expect(ids[1].endsWith(":1")).toBe(true);
    expect(ids[2].endsWith(":2")).toBe(true);
  });

  it("leaves distinct rows unsuffixed", () => {
    const ids = assignCsvExternalIds(ORG, [
      { occurred_on: "2026-07-01", amount: 4.5, description: "Coffee" },
      { occurred_on: "2026-07-01", amount: 4.5, description: "Tea" },
    ]);
    expect(ids[0].endsWith(":1")).toBe(false);
    expect(ids[1].endsWith(":1")).toBe(false);
  });
});

describe("categorizeImportRow", () => {
  const book = DEFAULT_CATEGORY_BOOK;
  const rule = (over: Partial<ExpenseRuleFields> = {}): ExpenseRuleFields => ({
    id: "r1",
    active: true,
    priority: 100,
    match_field: "any",
    match_value: "amzn",
    amount_min: null,
    amount_max: null,
    set_category: "Supplies",
    set_vendor_id: null,
    mark_reviewed: true,
    ...over,
  });
  const historyRow = (over: Partial<Expense>): Expense =>
    ({
      id: crypto.randomUUID(),
      amount: 10,
      occurred_on: "2026-06-01",
      category: "Shipping",
      vendor_id: null,
      vendor_name: null,
      description: "pirate ship postage",
      ...over,
    }) as Expense;
  const emptyModel = buildCategoryModel([]);
  const row = { amount: 20, description: "AMZN Mktp", vendor_name: null, fileCategoryRaw: null };

  it("a matching rule wins and clears review when mark_reviewed", () => {
    // "Supplies" isn't in the default vocabulary (it's a tax line) — use a real category.
    const r = rule({ set_category: "Packaging" });
    const out = categorizeImportRow(row, { book, rules: [r], model: emptyModel });
    expect(out).toMatchObject({ category: "Packaging", categorySource: "rule", needs_review: false });
  });

  it("a rule with mark_reviewed=false still queues the row for review", () => {
    const r = rule({ set_category: "Packaging", mark_reviewed: false });
    const out = categorizeImportRow(row, { book, rules: [r], model: emptyModel });
    expect(out.needs_review).toBe(true);
  });

  it("a rule beats the file's category column", () => {
    const r = rule({ set_category: "Packaging" });
    const out = categorizeImportRow({ ...row, fileCategoryRaw: "Marketing" }, { book, rules: [r], model: emptyModel });
    expect(out.category).toBe("Packaging");
  });

  it("rule vendor link carries through", () => {
    const r = rule({ set_category: "Packaging", set_vendor_id: "v-9" });
    const out = categorizeImportRow(row, { book, rules: [r], model: emptyModel });
    expect(out.vendor_id).toBe("v-9");
  });

  it("falls back to the file category (normalized), still needing review", () => {
    const out = categorizeImportRow({ ...row, fileCategoryRaw: "marketing" }, { book, rules: [], model: emptyModel });
    expect(out).toMatchObject({ category: "Marketing", categorySource: "file", needs_review: true });
  });

  it("an unknown file category is preserved as legacy", () => {
    const out = categorizeImportRow({ ...row, fileCategoryRaw: "Groceries" }, { book, rules: [], model: emptyModel });
    expect(out).toMatchObject({ category: null, category_legacy: "Groceries", categorySource: null });
  });

  it("falls back to the history model on exact memo", () => {
    const model = buildCategoryModel([historyRow({}), historyRow({})]);
    const out = categorizeImportRow(
      { amount: 12, description: "pirate ship postage", vendor_name: null, fileCategoryRaw: null },
      { book, rules: [], model },
    );
    expect(out).toMatchObject({ category: "Shipping", categorySource: "history", needs_review: true });
  });

  it("uncategorized when nothing matches", () => {
    const out = categorizeImportRow(row, { book, rules: [], model: emptyModel });
    expect(out).toMatchObject({ category: null, categorySource: null, needs_review: true });
  });
});
