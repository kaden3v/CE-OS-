// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { NetProfitWaterfall } from "./NetProfitWaterfall";
import type { FinanceKpiWindow, ExpenseBreakdownRow } from "@/hooks/useFinanceOverview";

afterEach(cleanup);

// A self-consistent window: revenue = plant sales; shipping is its own net line.
// net_revenue (6434.43) − shipping loss (476.48) − other expenses (2107.25) = 3850.70.
const WIN: FinanceKpiWindow = {
  gross_sales: 6435.67, // plant sales
  gross_receipts: 8189.62,
  refunds: 0,
  shipping_collected: 1753.95,
  order_count: 212,
  sales_tax_owed: 2.34,
  channel_fees: 1.24,
  net_revenue: 6434.43,
  expenses: 4337.68,
  cogs_materials: 0,
  cogs_labor: 0,
  cogs: 0,
  mileage: 0,
  net_profit: 3850.7,
};

const BREAKDOWN: ExpenseBreakdownRow[] = [
  { category: "Shipping", total: 2230.43 }, // postage — folded into the Shipping line
  { category: "Marketing", total: 1115.27 },
  { category: "Marketplace fees", total: 962.98 },
  { category: "Etsy fees (uncategorized)", total: 29.0 },
];

function renderWaterfall(win: FinanceKpiWindow | undefined = WIN, loading = false) {
  return render(
    <MemoryRouter>
      <NetProfitWaterfall win={win} breakdown={BREAKDOWN} loading={loading} />
    </MemoryRouter>,
  );
}

describe("NetProfitWaterfall (Part 2: show your work)", () => {
  it("leads with plant-sales revenue, not revenue inflated by shipping", () => {
    renderWaterfall();
    expect(screen.getByText("Product revenue")).toBeTruthy();
    expect(screen.getByText("$6,435.67")).toBeTruthy(); // plant sales, NOT $8,189
    expect(screen.getByText("Net revenue")).toBeTruthy();
    expect(screen.getByText("$6,434.43")).toBeTruthy();
    expect(screen.getByText("Net profit")).toBeTruthy();
    expect(screen.getByText("$3,850.70")).toBeTruthy();
  });

  it("shows shipping as its own net loss line (collected minus postage)", () => {
    renderWaterfall();
    expect(screen.getByText("Shipping")).toBeTruthy();
    expect(screen.getByText("−$476.48")).toBeTruthy(); // 1753.95 collected − 2230.43 postage
  });

  it("hides operating-expense categories until expanded, then shows them (postage excluded)", () => {
    renderWaterfall();
    expect(screen.queryByText("Marketing")).toBeNull();
    fireEvent.click(screen.getByText("Operating expenses"));
    expect(screen.getByText("Marketing")).toBeTruthy();
    expect(screen.getByText("Marketplace fees")).toBeTruthy();
    expect(screen.getByText("−$1,115.27")).toBeTruthy();
  });

  it("shows a loading skeleton and no figures while loading", () => {
    const { container } = renderWaterfall(undefined, true);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByText("Net profit")).toBeNull();
  });

  it("notes managerial COGS only when present (cash basis)", () => {
    renderWaterfall();
    expect(screen.queryByText(/Production COGS/)).toBeNull();
    cleanup();
    renderWaterfall({ ...WIN, cogs: 50, cogs_materials: 50 });
    expect(screen.getByText(/Production COGS/)).toBeTruthy();
  });
});
