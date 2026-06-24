import { describe, it, expect } from "vitest";
import type { Expense } from "@/components/expenses/types";
import { buildCategoryModel, suggestCategory, suggestForRows } from "./expenseCategorization";

let seq = 0;
const mk = (over: Partial<Expense>): Expense =>
  ({
    id: `e${seq++}`,
    amount: 1,
    category: null,
    category_legacy: null,
    created_at: "2026-06-01T00:00:00Z",
    deductible: true,
    description: null,
    external_id: null,
    notes: null,
    occurred_on: "2026-06-01",
    org_id: "org",
    payment_method: null,
    receipt_url: null,
    schedule_c_category: null,
    source: "manual",
    updated_at: "2026-06-01T00:00:00Z",
    user_id: "user",
    vendor_id: null,
    vendor_name: null,
    ...over,
  }) as Expense;

describe("suggestCategory (vendor evidence)", () => {
  it("suggests the dominant category seen for a linked vendor", () => {
    const model = buildCategoryModel([
      mk({ vendor_id: "v1", category: "Shipping" }),
      mk({ vendor_id: "v1", category: "Shipping" }),
      mk({ vendor_id: "v1", category: "Packaging" }),
    ]);
    const s = suggestCategory({ vendor_id: "v1", vendor_name: null, description: null }, model);
    expect(s?.category).toBe("Shipping");
    expect(s?.basis).toBe("vendor");
    expect(s?.support).toBe(2);
    expect(s?.confidence).toBeCloseTo(2 / 3);
  });

  it("matches an unlinked vendor by normalized name", () => {
    const model = buildCategoryModel([
      mk({ vendor_name: "Home Depot", category: "Soil and media" }),
      mk({ vendor_name: "  home depot ", category: "Soil and media" }),
    ]);
    const s = suggestCategory({ vendor_id: null, vendor_name: "HOME DEPOT", description: null }, model);
    expect(s?.category).toBe("Soil and media");
    expect(s?.confidence).toBe(1);
  });

  it("returns null below the confidence bar", () => {
    const model = buildCategoryModel([
      mk({ vendor_id: "v1", category: "Shipping" }),
      mk({ vendor_id: "v1", category: "Packaging" }), // 50/50, below 0.6
    ]);
    expect(suggestCategory({ vendor_id: "v1", vendor_name: null, description: null }, model)).toBeNull();
  });
});

describe("suggestCategory (memo evidence)", () => {
  it("learns from a repeated exact memo (e.g. Etsy ledger)", () => {
    const model = buildCategoryModel([
      mk({ description: "shipping_labels", category: "Shipping" }),
      mk({ description: "shipping_labels", category: "Shipping" }),
    ]);
    const s = suggestCategory({ vendor_id: null, vendor_name: null, description: "shipping_labels" }, model);
    expect(s?.category).toBe("Shipping");
    expect(s?.basis).toBe("memo");
  });

  it("prefers vendor evidence over memo when both qualify", () => {
    const model = buildCategoryModel([
      mk({ vendor_id: "v1", description: "misc", category: "Marketing" }),
      mk({ vendor_id: "v1", description: "misc", category: "Marketing" }),
      mk({ vendor_id: "v9", description: "misc", category: "Tools" }), // memo "misc" alone is mixed
    ]);
    const s = suggestCategory({ vendor_id: "v1", vendor_name: null, description: "misc" }, model);
    expect(s?.category).toBe("Marketing");
    expect(s?.basis).toBe("vendor");
  });
});

describe("buildCategoryModel hygiene", () => {
  it("ignores rows with no known category (legacy/uncategorized don't train it)", () => {
    const model = buildCategoryModel([
      mk({ vendor_id: "v1", category: null }),
      mk({ vendor_id: "v1", category: "Groceries" }), // not a known app category
    ]);
    expect(suggestCategory({ vendor_id: "v1", vendor_name: null, description: null }, model)).toBeNull();
  });
});

describe("suggestForRows", () => {
  it("suggests only for uncategorized rows, learning from categorized ones", () => {
    const rows = [
      mk({ id: "hist1", vendor_id: "v1", category: "Shipping" }),
      mk({ id: "hist2", vendor_id: "v1", category: "Shipping" }),
      mk({ id: "todo", vendor_id: "v1", category: null }),
      mk({ id: "done", vendor_id: "v1", category: "Packaging" }),
    ];
    const out = suggestForRows(rows);
    expect(out.get("todo")?.category).toBe("Shipping");
    expect(out.has("done")).toBe(false); // already categorized
    expect(out.has("hist1")).toBe(false);
  });

  it("returns an empty map when there is nothing to learn from", () => {
    const out = suggestForRows([mk({ vendor_id: "v1", category: null })]);
    expect(out.size).toBe(0);
  });
});
