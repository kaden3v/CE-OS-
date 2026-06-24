// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { makeCategoryBook, type ExpenseCategory } from "@/lib/categories";

const addCategory = vi.fn().mockResolvedValue({ ok: true });
const updateCategory = vi.fn().mockResolvedValue({ ok: true });
const removeCategory = vi.fn().mockResolvedValue({ ok: true });
const countUsage = vi.fn().mockResolvedValue(3);

let mockValue: ReturnType<typeof baseValue>;

vi.mock("@/contexts/ExpenseCategoriesContext", () => ({ useExpenseCategories: () => mockValue }));
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ addToast: vi.fn() }) }));

// Imported after the mocks are registered.
const { default: ExpenseCategories } = await import("./ExpenseCategories");

const LIST: ExpenseCategory[] = [
  { name: "Soil and media", scheduleC: "Supplies" },
  { name: "Marketing", scheduleC: "Advertising" },
];

function baseValue(over: Record<string, unknown> = {}) {
  return {
    book: makeCategoryBook(LIST),
    list: LIST,
    isLoading: false,
    available: true,
    isCustom: true,
    refresh: vi.fn(),
    countUsage,
    addCategory,
    updateCategory,
    removeCategory,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockValue = baseValue();
});
afterEach(cleanup);

const renderPage = () => render(<MemoryRouter><ExpenseCategories /></MemoryRouter>);

describe("ExpenseCategories page", () => {
  it("lists categories grouped under their Schedule C line", () => {
    renderPage();
    expect(screen.getByText("Soil and media")).toBeTruthy();
    expect(screen.getByText("Marketing")).toBeTruthy();
    // Schedule C line shows as a group header AND a per-row badge (so ≥1 each).
    expect(screen.getAllByText("Supplies").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Advertising").length).toBeGreaterThan(0);
  });

  it("adds a category with its chosen Schedule C line", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Add category/ })); // toolbar (unique pre-open)
    fireEvent.change(screen.getByPlaceholderText(/Greenhouse heating/), { target: { value: "Greenhouse heating" } });
    const submits = screen.getAllByRole("button", { name: "Add category" });
    fireEvent.click(submits[submits.length - 1]); // modal submit
    expect(addCategory).toHaveBeenCalledWith("Greenhouse heating", "Other expenses");
  });

  it("deletes a category, reassigning rows that use it", async () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("Delete Soil and media"));
    expect(countUsage).toHaveBeenCalledWith("Soil and media");
    // wait for the usage count to resolve (Delete is disabled until then)
    const del = await screen.findByRole("button", { name: "Delete" });
    await waitFor(() => expect((del as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(del);
    expect(removeCategory).toHaveBeenCalledWith("Soil and media", null); // default: leave uncategorized
  });

  it("is read-only with a notice when the storage isn't set up yet", () => {
    mockValue = baseValue({ available: false });
    renderPage();
    expect(screen.getByText(/one-time database setup/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Add category/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("Edit Soil and media")).toBeNull();
  });
});
