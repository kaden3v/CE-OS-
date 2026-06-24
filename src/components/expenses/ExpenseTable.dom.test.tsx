// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ExpenseTable, type SortState } from "./ExpenseTable";
import type { Expense, Vendor } from "./types";

afterEach(cleanup);

const baseExpense = (over: Partial<Expense>): Expense => ({
  amount: 10,
  category: "Packaging",
  category_legacy: null,
  created_at: "2026-06-10T00:00:00Z",
  deductible: true,
  description: null,
  external_id: null,
  id: "row-1",
  notes: null,
  occurred_on: "2026-06-10",
  org_id: "org-1",
  payment_method: "Card",
  receipt_url: null,
  schedule_c_category: "Supplies",
  source: "manual",
  updated_at: "2026-06-10T00:00:00Z",
  user_id: "user-1",
  vendor_id: null,
  vendor_name: null,
  ...over,
});

const VENDORS: Vendor[] = [];
const SORT: SortState = { key: "occurred_on", dir: "desc" };

function renderTable(rows: Expense[], handlers: Partial<Parameters<typeof ExpenseTable>[0]> = {}) {
  const props = {
    rows,
    vendors: VENDORS,
    selected: new Set<string>(),
    allSelected: false,
    onToggleRow: vi.fn(),
    onToggleAll: vi.fn(),
    sort: SORT,
    onSort: vi.fn(),
    onStartEdit: vi.fn(),
    onDelete: vi.fn(),
    onOpenReceipt: vi.fn(),
    onAttachReceipt: vi.fn(),
    total: 10,
    ...handlers,
  };
  return { props, ...render(<ExpenseTable {...props} />) };
}

describe("ExpenseTable — managed vs manual rows", () => {
  it("makes a manual row selectable, editable, and deletable", () => {
    const onToggleRow = vi.fn();
    const onStartEdit = vi.fn();
    renderTable([baseExpense({ id: "manual-1" })], { onToggleRow, onStartEdit });

    fireEvent.click(screen.getByLabelText("Select row"));
    expect(onToggleRow).toHaveBeenCalledWith("manual-1");

    fireEvent.click(screen.getByLabelText("Edit"));
    expect(onStartEdit).toHaveBeenCalledWith("manual-1");

    expect(screen.getByLabelText("Delete")).toBeTruthy();
  });

  it("locks a synced (Etsy) row: no checkbox, no edit/delete, shows its source", () => {
    renderTable([baseExpense({ id: "etsy-1", source: "etsy", vendor_name: "Etsy" })]);

    expect(screen.queryByLabelText("Select row")).toBeNull();
    expect(screen.queryByLabelText("Edit")).toBeNull();
    expect(screen.queryByLabelText("Delete")).toBeNull();
    expect(screen.getByText("Synced")).toBeTruthy();
  });

  it("locks supply/subscription/mileage rows too, not just Etsy", () => {
    renderTable([
      baseExpense({ id: "sup-1", source: "supply_purchase" }),
      baseExpense({ id: "sub-1", source: "subscription" }),
      baseExpense({ id: "mi-1", source: "mileage" }),
    ]);
    // None of the three managed rows expose a selection checkbox or edit control.
    expect(screen.queryAllByLabelText("Select row")).toHaveLength(0);
    expect(screen.queryAllByLabelText("Edit")).toHaveLength(0);
  });

  it("only manual rows count toward selectable controls in a mixed list", () => {
    renderTable([
      baseExpense({ id: "manual-1", source: "manual" }),
      baseExpense({ id: "etsy-1", source: "etsy" }),
    ]);
    expect(screen.getAllByLabelText("Select row")).toHaveLength(1);
    expect(screen.getAllByLabelText("Edit")).toHaveLength(1);
    // Receipts stay attachable on every row, managed or not.
    expect(screen.getAllByLabelText("Attach receipt")).toHaveLength(2);
  });

  it("flags an uncategorized row as Needs review", () => {
    renderTable([baseExpense({ id: "r", category: null, schedule_c_category: null })]);
    expect(screen.getByText("Needs review")).toBeTruthy();
  });

  it("offers an inline category suggestion on a needs-review row and applies it on click", () => {
    const onApplySuggestion = vi.fn();
    renderTable([baseExpense({ id: "r", category: null, schedule_c_category: null })], {
      suggestions: new Map([["r", "Shipping"]]),
      onApplySuggestion,
    });
    const chip = screen.getByTitle("Apply suggested category: Shipping");
    fireEvent.click(chip);
    expect(onApplySuggestion).toHaveBeenCalledWith("r", "Shipping");
  });

  it("shows no suggestion chip once a row is categorized", () => {
    renderTable([baseExpense({ id: "r", category: "Packaging" })], {
      suggestions: new Map([["r", "Shipping"]]),
      onApplySuggestion: vi.fn(),
    });
    expect(screen.queryByTitle("Apply suggested category: Shipping")).toBeNull();
  });

  it("offers the suggestion chip on a managed (synced) row too — setting a category is sync-safe", () => {
    const onApplySuggestion = vi.fn();
    renderTable([baseExpense({ id: "etsy-r", source: "etsy", category: null, schedule_c_category: null })], {
      suggestions: new Map([["etsy-r", "Shipping"]]),
      onApplySuggestion,
    });
    // The managed row has no checkbox/edit/delete...
    expect(screen.queryByLabelText("Select row")).toBeNull();
    expect(screen.queryByLabelText("Edit")).toBeNull();
    // ...but the category chip is intentionally NOT gated by `managed`.
    const chip = screen.getByLabelText("Apply suggested category Shipping");
    fireEvent.click(chip);
    expect(onApplySuggestion).toHaveBeenCalledWith("etsy-r", "Shipping");
  });

  it("disables the chip while its write is in flight", () => {
    const onApplySuggestion = vi.fn();
    renderTable([baseExpense({ id: "r", category: null, schedule_c_category: null })], {
      suggestions: new Map([["r", "Shipping"]]),
      onApplySuggestion,
      pendingSuggestionIds: new Set(["r"]),
    });
    const chip = screen.getByLabelText("Apply suggested category Shipping") as HTMLButtonElement;
    expect(chip.disabled).toBe(true);
    fireEvent.click(chip);
    expect(onApplySuggestion).not.toHaveBeenCalled();
  });
});
