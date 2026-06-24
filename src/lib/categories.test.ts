import { describe, it, expect } from "vitest";
import {
  makeCategoryBook,
  parseStoredCategories,
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY_BOOK,
  type ExpenseCategory,
} from "./categories";
import { EXPENSE_CATEGORIES, groupedExpenseCategories, normalizeExpenseCategory, mapToScheduleC } from "./scheduleC";

describe("DEFAULT_CATEGORY_BOOK matches the legacy static helpers", () => {
  it("covers exactly the built-in categories", () => {
    expect([...DEFAULT_CATEGORIES.map((c) => c.name)].sort()).toEqual([...EXPENSE_CATEGORIES].sort());
  });

  it("groups identically to groupedExpenseCategories()", () => {
    expect(DEFAULT_CATEGORY_BOOK.groups).toEqual(groupedExpenseCategories());
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
});

describe("makeCategoryBook with a custom list", () => {
  const list: ExpenseCategory[] = [
    { name: "Soil and media", scheduleC: "Supplies" },
    { name: "Greenhouse heating", scheduleC: "Utilities" },
  ];
  const book = makeCategoryBook(list);

  it("knows custom categories and their Schedule C line", () => {
    expect(book.has("greenhouse heating")).toBe(true);
    expect(book.canonical("GREENHOUSE HEATING")).toBe("Greenhouse heating");
    expect(book.scheduleCFor("Greenhouse heating")).toBe("Utilities");
    expect(book.normalize("greenhouse heating")).toEqual({ category: "Greenhouse heating", legacy: null });
  });

  it("groups custom categories under their Schedule C line, in canonical order", () => {
    expect(book.groups).toEqual([
      { scheduleC: "Supplies", categories: ["Soil and media"] },
      { scheduleC: "Utilities", categories: ["Greenhouse heating"] },
    ]);
  });

  it("falls back to the static map for names it doesn't know", () => {
    // "marketing" isn't in this custom list, but the static map still knows it.
    expect(book.scheduleCFor("Marketing")).toBe("Advertising");
    expect(book.normalize("Marketing")).toEqual({ category: null, legacy: "Marketing" });
  });
});

describe("parseStoredCategories", () => {
  it("keeps valid entries and coerces an unknown Schedule C line to the fallback", () => {
    expect(
      parseStoredCategories([
        { name: "Soil and media", scheduleC: "Supplies" },
        { name: "Weird", scheduleC: "Not A Real Line" },
      ]),
    ).toEqual([
      { name: "Soil and media", scheduleC: "Supplies" },
      { name: "Weird", scheduleC: "Other expenses" },
    ]);
  });

  it("drops malformed and duplicate entries", () => {
    expect(
      parseStoredCategories([
        { name: "  Tools  ", scheduleC: "Supplies" },
        { name: "tools", scheduleC: "Supplies" }, // dup (case-insensitive)
        { name: "", scheduleC: "Supplies" }, // empty
        { scheduleC: "Supplies" }, // no name
        "nope", // not an object
      ]),
    ).toEqual([{ name: "Tools", scheduleC: "Supplies" }]);
  });

  it("returns [] for non-arrays so callers fall back to defaults", () => {
    expect(parseStoredCategories(null)).toEqual([]);
    expect(parseStoredCategories({})).toEqual([]);
    expect(parseStoredCategories(undefined)).toEqual([]);
  });
});
