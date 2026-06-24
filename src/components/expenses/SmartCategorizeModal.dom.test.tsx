// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { SmartCategorizeModal, type SuggestionItem } from "./SmartCategorizeModal";
import type { Expense } from "./types";

afterEach(cleanup);

let seq = 0;
const mk = (over: Partial<Expense>): Expense =>
  ({
    id: `e${seq++}`,
    amount: 10,
    category: null,
    category_legacy: null,
    created_at: "2026-06-10T00:00:00Z",
    deductible: true,
    description: null,
    external_id: null,
    notes: null,
    occurred_on: "2026-06-10",
    org_id: "org",
    payment_method: null,
    receipt_url: null,
    schedule_c_category: null,
    source: "manual",
    updated_at: "2026-06-10T00:00:00Z",
    user_id: "user",
    vendor_id: null,
    vendor_name: null,
    ...over,
  }) as Expense;

const items = (): SuggestionItem[] => [
  { expense: mk({ id: "a", vendor_name: "USPS" }), suggestion: { category: "Shipping", confidence: 1, support: 3, basis: "vendor" } },
  { expense: mk({ id: "b", vendor_name: "Etsy" }), suggestion: { category: "Marketplace fees", confidence: 1, support: 2, basis: "vendor" } },
];

function renderModal(onApply = vi.fn().mockResolvedValue(undefined), data = items()) {
  render(<SmartCategorizeModal open onClose={vi.fn()} items={data} vendors={[]} onApply={onApply} />);
  return onApply;
}

describe("SmartCategorizeModal", () => {
  it("pre-checks every row and applies all suggestions", async () => {
    const onApply = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /Apply 2/ }));
    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith([
        { id: "a", category: "Shipping" },
        { id: "b", category: "Marketplace fees" },
      ]),
    );
  });

  it("drops an unticked row from the applied set", async () => {
    const onApply = renderModal();
    fireEvent.click(screen.getByLabelText("Select USPS")); // untick row a
    fireEvent.click(screen.getByRole("button", { name: /Apply 1/ }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith([{ id: "b", category: "Marketplace fees" }]));
  });

  it("writes an overridden category instead of the suggestion", async () => {
    const onApply = renderModal();
    const firstCategory = screen.getAllByRole("combobox")[0];
    fireEvent.change(firstCategory, { target: { value: "Tools" } });
    fireEvent.click(screen.getByRole("button", { name: /Apply 2/ }));
    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith([
        { id: "a", category: "Tools" },
        { id: "b", category: "Marketplace fees" },
      ]),
    );
  });

  it("disables Apply when select-all unchecks everything", () => {
    renderModal();
    fireEvent.click(screen.getByLabelText("Select all"));
    const apply = screen.getByRole("button", { name: /Apply 0/ }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
  });
});
