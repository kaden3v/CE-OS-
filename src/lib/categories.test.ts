import { describe, it, expect } from "vitest";
import {
  makeCategoryBook,
  parseStoredCategories,
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY_BOOK,
  type ExpenseCategory,
} from "./categories";
import { EXPENSE_CATEGORIES, groupedExpenseCategories, normalizeExpenseCategory, mapToScheduleC } from "./scheduleC";
import { mapToScheduleF } from "./scheduleF";

describe("DEFAULT_CATEGORY_BOOK matches the legacy static helpers", () => {
  it("covers exactly the built-in categories", () => {
    expect([...DEFAULT_CATEGORIES.map((c) => c.name)].sort()).toEqual([...EXPENSE_CATEGORIES].sort());
  });

  it("groups identically to groupedExpenseCategories() on Schedule C", () => {
    expect(DEFAULT_CATEGORY_BOOK.groupsFor("C")).toEqual(
      groupedExpenseCategories().map((g) => ({ line: g.scheduleC, categories: g.categories })),
    );
  });

  it("normalizes identically to normalizeExpenseCategory()", () => {
    for (const raw of ["MARKETPLACE FEES", "  tools ", "Groceries", "", null]) {
      expect(DEFAULT_CATEGORY_BOOK.normalize(raw)).toEqual(normalizeExpenseCategory(raw));
    }
  });

  it("resolves Schedule C identically to mapToScheduleC()", () => {
    for (const raw of ["Soil and media", "Marketplace fees", "Groceries", null]) {
      expect(DEFAULT_CATEGORY_BOOK.scheduleCFor(raw)).toBe(mapToScheduleC(raw).scheduleC);
    }
  });

  it("resolves Schedule F identically to mapToScheduleF()", () => {
    for (const raw of ["Soil and media", "Shipping", "Permits and licenses", "Groceries", null]) {
      expect(DEFAULT_CATEGORY_BOOK.scheduleFFor(raw)).toBe(mapToScheduleF(raw).scheduleF);
    }
  });
});

describe("makeCategoryBook with a custom list", () => {
  const list: ExpenseCategory[] = [
    { name: "Soil and media", scheduleC: "Supplies", scheduleF: "Supplies" },
    { name: "Greenhouse heating", scheduleC: "Utilities", scheduleF: "Utilities" },
  ];
  const book = makeCategoryBook(list);

  it("knows custom categories and their tax lines", () => {
    expect(book.has("greenhouse heating")).toBe(true);
    expect(book.canonical("GREENHOUSE HEATING")).toBe("Greenhouse heating");
    expect(book.scheduleCFor("Greenhouse heating")).toBe("Utilities");
    expect(book.scheduleFFor("Greenhouse heating")).toBe("Utilities");
    expect(book.normalize("greenhouse heating")).toEqual({ category: "Greenhouse heating", legacy: null });
  });

  it("groups custom categories under the requested schedule's line, in canonical order", () => {
    expect(book.groupsFor("C")).toEqual([
      { line: "Supplies", categories: ["Soil and media"] },
      { line: "Utilities", categories: ["Greenhouse heating"] },
    ]);
    expect(book.groupsFor("F")).toEqual([
      { line: "Supplies", categories: ["Soil and media"] },
      { line: "Utilities", categories: ["Greenhouse heating"] },
    ]);
  });

  it("falls back to the static maps for names it doesn't know", () => {
    // "marketing" isn't in this custom list, but the static maps still know it.
    expect(book.scheduleCFor("Marketing")).toBe("Advertising");
    expect(book.scheduleFFor("Marketing")).toBe("Other expenses"); // no advertising line on F
    expect(book.normalize("Marketing")).toEqual({ category: null, legacy: "Marketing" });
  });
});

describe("parseStoredCategories", () => {
  it("keeps valid entries and coerces an unknown Schedule C line to the fallback", () => {
    expect(
      parseStoredCategories([
        { name: "Soil and media", scheduleC: "Supplies", scheduleF: "Supplies" },
        { name: "Weird", scheduleC: "Not A Real Line", scheduleF: "Not A Real Line" },
      ]),
    ).toEqual([
      { name: "Soil and media", scheduleC: "Supplies", scheduleF: "Supplies" },
      { name: "Weird", scheduleC: "Other expenses", scheduleF: "Other expenses" },
    ]);
  });

  it("derives scheduleF from the name for entries saved before the F rollout", () => {
    expect(parseStoredCategories([{ name: "Shipping", scheduleC: "Other expenses" }])).toEqual([
      { name: "Shipping", scheduleC: "Other expenses", scheduleF: "Freight and trucking" },
    ]);
    // Unknown name with no stored F line → F fallback.
    expect(parseStoredCategories([{ name: "Greenhouse heating", scheduleC: "Utilities" }])).toEqual([
      { name: "Greenhouse heating", scheduleC: "Utilities", scheduleF: "Other expenses" },
    ]);
  });

  it("drops malformed and duplicate entries", () => {
    expect(
      parseStoredCategories([
        { name: "  Tools  ", scheduleC: "Supplies", scheduleF: "Supplies" },
        { name: "tools", scheduleC: "Supplies", scheduleF: "Supplies" }, // dup (case-insensitive)
        { name: "", scheduleC: "Supplies", scheduleF: "Supplies" }, // empty
        { scheduleC: "Supplies", scheduleF: "Supplies" }, // no name
        "nope", // not an object
      ]),
    ).toEqual([{ name: "Tools", scheduleC: "Supplies", scheduleF: "Supplies" }]);
  });

  it("returns [] for non-arrays so callers fall back to defaults", () => {
    expect(parseStoredCategories(null)).toEqual([]);
    expect(parseStoredCategories({})).toEqual([]);
    expect(parseStoredCategories(undefined)).toEqual([]);
  });
});
