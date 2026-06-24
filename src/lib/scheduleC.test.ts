import { describe, it, expect } from "vitest";
import {
  mapToScheduleC,
  normalizeExpenseCategory,
  groupedExpenseCategories,
  EXPENSE_CATEGORIES,
  SCHEDULE_C_CATEGORIES,
  SCHEDULE_C_FALLBACK,
} from "./scheduleC";

describe("mapToScheduleC", () => {
  it("maps a known category to its Schedule C line", () => {
    expect(mapToScheduleC("Marketplace fees")).toEqual({ scheduleC: "Commissions and fees", mappedCleanly: true });
    expect(mapToScheduleC("Soil and media")).toEqual({ scheduleC: "Supplies", mappedCleanly: true });
  });

  it("is case- and whitespace-insensitive", () => {
    expect(mapToScheduleC("  marketplace FEES ")).toEqual({ scheduleC: "Commissions and fees", mappedCleanly: true });
  });

  it("falls back to Other expenses for unknown categories (not cleanly mapped)", () => {
    expect(mapToScheduleC("Groceries")).toEqual({ scheduleC: SCHEDULE_C_FALLBACK, mappedCleanly: false });
  });

  it("falls back for null/empty input", () => {
    expect(mapToScheduleC(null)).toEqual({ scheduleC: SCHEDULE_C_FALLBACK, mappedCleanly: false });
    expect(mapToScheduleC("")).toEqual({ scheduleC: SCHEDULE_C_FALLBACK, mappedCleanly: false });
  });
});

describe("normalizeExpenseCategory", () => {
  it("returns the canonical-cased category for a recognized name", () => {
    expect(normalizeExpenseCategory("MARKETPLACE FEES")).toEqual({ category: "Marketplace fees", legacy: null });
    expect(normalizeExpenseCategory("  tools ")).toEqual({ category: "Tools", legacy: null });
  });

  it("preserves an unrecognized name as legacy and leaves category null", () => {
    expect(normalizeExpenseCategory("Office Depot run")).toEqual({ category: null, legacy: "Office Depot run" });
  });

  it("treats empty/blank/nullish input as uncategorized", () => {
    expect(normalizeExpenseCategory("")).toEqual({ category: null, legacy: null });
    expect(normalizeExpenseCategory("   ")).toEqual({ category: null, legacy: null });
    expect(normalizeExpenseCategory(null)).toEqual({ category: null, legacy: null });
  });

  it("round-trips every selectable category to itself", () => {
    for (const c of EXPENSE_CATEGORIES) {
      expect(normalizeExpenseCategory(c)).toEqual({ category: c, legacy: null });
    }
  });
});

describe("groupedExpenseCategories", () => {
  const groups = groupedExpenseCategories();

  it("includes every selectable category exactly once", () => {
    const flat = groups.flatMap((g) => g.categories).sort();
    expect(flat).toEqual([...EXPENSE_CATEGORIES].sort());
  });

  it("groups each category under the same line mapToScheduleC would pick", () => {
    for (const g of groups) {
      for (const c of g.categories) {
        expect(mapToScheduleC(c).scheduleC).toBe(g.scheduleC);
      }
    }
  });

  it("emits groups in canonical Schedule C order", () => {
    const indices = groups.map((g) => SCHEDULE_C_CATEGORIES.indexOf(g.scheduleC));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(indices.every((i) => i >= 0)).toBe(true);
  });
});
